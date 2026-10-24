import { supabase } from './supabase'
import { memoLecture } from './requeteCache'

// Périmètre du CRM vu depuis l'établissement actif : tout le groupe quand le
// groupe partage son CRM (groupes.crm_partage, ex. MARSAN + JOIA), sinon
// l'établissement seul. Les listes CRM filtrent sur ces ids ; les écritures
// d'une ligne existante gardent son client_id d'origine.
//
// Renvoie aussi les lieux (crm_lieux) du périmètre et le nom de la maison de
// chaque établissement, lu dans les lieux : un membre ne peut pas lire la
// ligne `clients` d'un autre établissement du groupe.

/**
 * @param {string} clientId  établissement actif
 * @returns {Promise<{ ids: string[], lieux: Array<{id:string, nom:string, client_id:string|null, groupe_id:string|null}>, maisons: Record<string,string>, partage: boolean, seuils: {vipVisites?:number, vipMois?:number, perduMois?:number} }>}
 */
export async function crmPerimetre(clientId) {
  if (!clientId) return { ids: [], lieux: [], maisons: {}, partage: false, seuils: {} }
  const [{ data: ids, error }, { data: lieux }, { data: etab }] = await Promise.all([
    memoLecture(`crm_perimetre:${clientId}`, () =>
      supabase.rpc('crm_perimetre', { p_client_id: clientId })),
    memoLecture(`crm_lieux:${clientId}`, () =>
      supabase.from('crm_lieux').select('id, nom, client_id, groupe_id').eq('actif', true).order('nom')),
    memoLecture(`crm_groupe:${clientId}`, () =>
      supabase.from('clients').select('groupe_id, groupes(crm_vip_visites, crm_vip_mois, crm_perdu_mois)').eq('id', clientId).maybeSingle()),
  ])
  const liste = !error && Array.isArray(ids) && ids.length
    ? ids.map((r) => (typeof r === 'string' ? r : r.crm_perimetre))
    : [clientId]
  // Le superadmin lit tous les lieux : on ne garde que ceux du périmètre et
  // les lieux sans établissement du groupe de l'établissement actif.
  const groupeId = etab?.groupe_id || null
  const lieuxPerimetre = (lieux || []).filter((l) =>
    (l.client_id && liste.includes(l.client_id)) || (!l.client_id && groupeId && l.groupe_id === groupeId))
  const maisons = {}
  for (const l of lieuxPerimetre) if (l.client_id) maisons[l.client_id] = l.nom
  const g = etab?.groupes
  const seuils = g ? { vipVisites: g.crm_vip_visites, vipMois: g.crm_vip_mois, perduMois: g.crm_perdu_mois } : {}
  return { ids: liste, lieux: lieuxPerimetre, maisons, partage: liste.length > 1, seuils }
}
