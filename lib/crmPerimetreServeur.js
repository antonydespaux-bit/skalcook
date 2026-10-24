// Périmètre CRM côté routes API (db = service_role). La fonction SQL
// crm_perimetre() lit auth.uid(), nul en service_role : on recalcule ici.
// L'appelant a déjà passé le guard 'permission' (droit crm) sur clientId ;
// le périmètre ajoute les autres établissements du groupe si le groupe
// partage son CRM (groupes.crm_partage). Cf. lib/crmPerimetre.js.

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} db  client service_role
 * @param {string} clientId  établissement vérifié par le guard
 * @returns {Promise<string[]>}
 */
export async function perimetreCrmServeur(db, clientId) {
  const { data: etab } = await db.from('clients').select('groupe_id').eq('id', clientId).maybeSingle()
  if (!etab?.groupe_id) return [clientId]
  const { data: groupe } = await db.from('groupes').select('crm_partage').eq('id', etab.groupe_id).maybeSingle()
  if (!groupe?.crm_partage) return [clientId]
  const { data: membres } = await db.from('clients').select('id').eq('groupe_id', etab.groupe_id)
  return [...new Set([clientId, ...(membres || []).map((m) => m.id)])]
}
