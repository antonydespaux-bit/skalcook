import type { SupabaseClient } from '@supabase/supabase-js'
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../errors'
import type { NiveauxRequisitions } from '../requisitions/droits'
import type { ServiceInterne } from './requisitions.service'

// Réquisitions — demandes : contexte de l'utilisateur, catalogue du service
// destinataire, création, liste, détail et annulation. Appelé par les routes
// /api/requisitions* en service_role : chaque fonction filtre sur client_id
// et applique elle-même les règles d'appartenance aux services (miroir de la
// policy requisitions_select).

export type Statut = 'a_valider' | 'a_preparer' | 'en_preparation' | 'livree' | 'refusee' | 'annulee'
export type StockProduit = 'cuisine' | 'bar' | 'articles'

export interface Requisition {
  id: string
  client_id: string
  numero: number
  type: 'demande' | 'sortie_directe'
  statut: Statut
  service_demandeur_id: string
  service_preparateur_id: string
  stock: StockProduit
  demandeur_id: string | null
  date_souhaitee: string | null
  commentaire: string | null
  envoyee_at: string
  valideur_id: string | null
  validee_at: string | null
  refusee_par: string | null
  livree_at: string | null
  refusee_at: string | null
  motif_refus: string | null
  annulee_at: string | null
}

const COLONNES_SERVICE = 'id, client_id, nom, emoji, ordre, actif, peut_demander, peut_preparer, stock'
const COLONNES_REQ = 'id, client_id, numero, type, statut, service_demandeur_id, service_preparateur_id, stock, demandeur_id, date_souhaitee, commentaire, envoyee_at, valideur_id, validee_at, livree_at, refusee_par, refusee_at, motif_refus, annulee_at'
const COLONNES_LIGNE = 'id, ordre, ingredient_id, article_id, nom, unite, quantite_demandee, quantite_livree, prix_unitaire, valeur, ajoutee_par_preparateur, commentaire'

/** Statuts où le demandeur peut encore annuler (préparation pas commencée). */
export const STATUTS_ANNULABLES: Statut[] = ['a_valider', 'a_preparer']

// ── Règles pures (testées dans lib/__tests__/requisitionsDemandes.test.ts) ──

export const statutInitial = (validationRequise: boolean): Statut => (validationRequise ? 'a_valider' : 'a_preparer')

export const peutAnnuler = (statut: Statut) => STATUTS_ANNULABLES.includes(statut)

/** Voit tous les bons de l'établissement (miroir de la policy). */
export const voitTout = (n: NiveauxRequisitions) =>
  n.administration !== 'aucun' || n.analyses !== 'aucun'

/** Passe des commandes au nom de n'importe quel service (administrateur). */
export const commandePourTous = (n: NiveauxRequisitions) => n.administration === 'modification'

/** Table et colonne de ligne correspondant au stock d'un service préparateur. */
export function sourceCatalogue(stock: string): { table: string; colonne: 'ingredient_id' | 'article_id' } {
  if (stock === 'cuisine') return { table: 'ingredients', colonne: 'ingredient_id' }
  if (stock === 'bar') return { table: 'ingredients_bar', colonne: 'ingredient_id' }
  if (stock === 'articles') return { table: 'articles', colonne: 'article_id' }
  throw new ValidationError('Ce service ne sert aucun stock.')
}

/** Vérifie le couple demandeur → préparateur pour une nouvelle demande. */
export function verifierCouple(
  demandeur: Pick<ServiceInterne, 'id' | 'actif' | 'peut_demander'> | null,
  preparateur: Pick<ServiceInterne, 'id' | 'actif' | 'peut_preparer' | 'stock'> | null,
  autorise: boolean,
) {
  if (!demandeur || !demandeur.actif || !demandeur.peut_demander) throw new ValidationError('Service demandeur invalide ou désactivé.')
  if (!preparateur || !preparateur.actif || !preparateur.peut_preparer || preparateur.stock === 'aucun') {
    throw new ValidationError('Service destinataire invalide ou désactivé.')
  }
  if (demandeur.id === preparateur.id) throw new ValidationError('Le service destinataire doit être différent du service demandeur.')
  if (!autorise) throw new ForbiddenError('Vous ne faites pas partie de ce service demandeur.')
}

/** Lignes figées (nom, unité) depuis les produits du catalogue du préparateur. */
export function construireLignes(
  demandes: { produit_id: string; quantite: number; commentaire?: string | null }[],
  produits: { id: string; nom: string; unite: string | null }[],
  colonne: 'ingredient_id' | 'article_id',
) {
  const parId = new Map(produits.map((p) => [p.id, p]))
  return demandes.map((d) => {
    const p = parId.get(d.produit_id)
    if (!p) throw new ValidationError('Un produit demandé n\'est pas dans le catalogue du service destinataire.')
    return {
      [colonne]: p.id,
      nom: p.nom,
      unite: p.unite || 'u',
      quantite_demandee: d.quantite,
      commentaire: d.commentaire || null,
    }
  })
}

// ── Accès aux données ──────────────────────────────────────────────────────

async function servicesEtablissement(db: SupabaseClient, clientId: string): Promise<ServiceInterne[]> {
  const { data, error } = await db.from('services_internes').select(COLONNES_SERVICE)
    .eq('client_id', clientId).order('ordre').order('nom')
  if (error) throw new Error(error.message)
  return (data ?? []) as ServiceInterne[]
}

/** Services dont l'utilisateur est membre, et ceux dont il est responsable. */
async function appartenances(db: SupabaseClient, clientId: string, userId: string): Promise<{ ids: Set<string>; responsables: Set<string> }> {
  const { data, error } = await db.from('service_membres').select('service_id, responsable')
    .eq('client_id', clientId).eq('user_id', userId)
  if (error) throw new Error(error.message)
  const lignes = data ?? []
  return {
    ids: new Set(lignes.map((m) => m.service_id as string)),
    responsables: new Set(lignes.filter((m) => m.responsable).map((m) => m.service_id as string)),
  }
}

/** Ce que l'utilisateur peut faire : services pour lesquels il commande, destinataires possibles. */
export async function contexteUtilisateur(db: SupabaseClient, clientId: string, userId: string, n: NiveauxRequisitions) {
  const [services, { ids: mesIds, responsables }, clientRes] = await Promise.all([
    servicesEtablissement(db, clientId),
    appartenances(db, clientId, userId),
    db.from('clients').select('requisitions_validation').eq('id', clientId).maybeSingle(),
  ])
  const actifs = services.filter((s) => s.actif)
  const pourTous = commandePourTous(n)
  return {
    services: actifs,
    mes_services: actifs.filter((s) => mesIds.has(s.id)).map((s) => s.id),
    // Services dont l'utilisateur valide les demandes (tous pour l'administration).
    valide_pour: pourTous ? actifs.map((s) => s.id) : actifs.filter((s) => responsables.has(s.id)).map((s) => s.id),
    demandeurs: actifs.filter((s) => s.peut_demander && (pourTous || mesIds.has(s.id))).map((s) => s.id),
    destinataires: actifs.filter((s) => s.peut_preparer && s.stock !== 'aucun').map((s) => s.id),
    validation: !!clientRes.data?.requisitions_validation,
    voit_tout: voitTout(n),
    peut_commander: n.requisitions === 'modification',
  }
}

/** Recherche dans le catalogue servi par un service préparateur. */
export async function rechercherCatalogue(db: SupabaseClient, clientId: string, serviceId: string, q?: string) {
  const { data: service, error } = await db.from('services_internes').select(COLONNES_SERVICE)
    .eq('client_id', clientId).eq('id', serviceId).maybeSingle()
  if (error) throw new Error(error.message)
  if (!service || !service.peut_preparer) throw new NotFoundError('Service destinataire introuvable.')

  const { table } = sourceCatalogue(service.stock)
  const colonnes = table === 'articles' ? 'id, nom, unite, categorie, reference' : 'id, nom, unite'
  let req = db.from(table).select(colonnes).eq('client_id', clientId)
  if (table === 'articles') req = req.eq('service_id', serviceId).eq('actif', true)
  const terme = (q || '').replace(/[%_,()]/g, ' ').trim()
  if (terme) req = req.ilike('nom', `%${terme}%`)
  const { data: produits, error: pErr } = await req.order('nom').limit(50)
  if (pErr) throw new Error(pErr.message)
  return { stock: service.stock as StockProduit, produits: produits ?? [] }
}

export async function creerDemande(
  db: SupabaseClient,
  clientId: string,
  userId: string,
  n: NiveauxRequisitions,
  d: {
    service_demandeur_id: string
    service_preparateur_id: string
    date_souhaitee?: string | null
    commentaire?: string | null
    lignes: { produit_id: string; quantite: number; commentaire?: string | null }[]
  },
) {
  const [services, { ids: mesIds }, clientRes] = await Promise.all([
    servicesEtablissement(db, clientId),
    appartenances(db, clientId, userId),
    db.from('clients').select('requisitions_validation').eq('id', clientId).maybeSingle(),
  ])
  const demandeur = services.find((s) => s.id === d.service_demandeur_id) ?? null
  const preparateur = services.find((s) => s.id === d.service_preparateur_id) ?? null
  verifierCouple(demandeur, preparateur, commandePourTous(n) || mesIds.has(d.service_demandeur_id))

  const { table, colonne } = sourceCatalogue(preparateur!.stock)
  let req = db.from(table).select('id, nom, unite').eq('client_id', clientId).in('id', d.lignes.map((l) => l.produit_id))
  if (table === 'articles') req = req.eq('service_id', preparateur!.id).eq('actif', true)
  const { data: produits, error: pErr } = await req
  if (pErr) throw new Error(pErr.message)
  const lignes = construireLignes(d.lignes, produits ?? [], colonne)

  const statut = statutInitial(!!clientRes.data?.requisitions_validation)
  const { data, error } = await db.rpc('requisition_creer', {
    p_entete: {
      client_id: clientId,
      type: 'demande',
      statut,
      service_demandeur_id: demandeur!.id,
      service_preparateur_id: preparateur!.id,
      stock: preparateur!.stock,
      demandeur_id: userId,
      date_souhaitee: d.date_souhaitee || null,
      commentaire: d.commentaire || null,
    },
    p_lignes: lignes,
  })
  if (error) throw new Error(error.message)
  const cree = (Array.isArray(data) ? data[0] : data) as { id: string; numero: number }
  return { id: cree.id, numero: cree.numero, statut, demandeur: demandeur!, preparateur: preparateur! }
}

async function nomsUtilisateurs(db: SupabaseClient, ids: string[]): Promise<Map<string, string>> {
  const uniques = [...new Set(ids.filter(Boolean))]
  if (uniques.length === 0) return new Map()
  const { data } = await db.from('profils').select('id, nom, email').in('id', uniques)
  return new Map((data ?? []).map((p) => [p.id as string, (p.nom || p.email || '') as string]))
}

/** Le bon est-il visible pour cet utilisateur ? (miroir de requisitions_select) */
export const estVisible = (r: Pick<Requisition, 'service_demandeur_id' | 'service_preparateur_id'>, mesIds: Set<string>, n: NiveauxRequisitions) =>
  voitTout(n) || mesIds.has(r.service_demandeur_id) || mesIds.has(r.service_preparateur_id)

type Appartenances = { ids: Set<string>; responsables: Set<string> }

/** Le demandeur (ou son service) peut-il annuler ce bon ? */
const peutAnnulerBon = (r: Requisition, userId: string, a: Appartenances, n: NiveauxRequisitions) =>
  peutAnnuler(r.statut) && n.requisitions === 'modification'
  && (r.demandeur_id === userId || a.ids.has(r.service_demandeur_id) || commandePourTous(n))

/**
 * Valide ou refuse une demande en attente : responsable du service demandeur,
 * ou administration en modification.
 */
export const peutValider = (
  r: Pick<Requisition, 'statut' | 'service_demandeur_id'>,
  responsables: Set<string>,
  n: NiveauxRequisitions,
) => r.statut === 'a_valider' && n.requisitions === 'modification'
  && (commandePourTous(n) || responsables.has(r.service_demandeur_id))

export async function listerRequisitions(
  db: SupabaseClient,
  clientId: string,
  userId: string,
  n: NiveauxRequisitions,
  vue: 'mes_demandes' | 'a_valider' | 'toutes',
) {
  const [services, a] = await Promise.all([servicesEtablissement(db, clientId), appartenances(db, clientId, userId)])

  let req = db.from('requisitions').select(COLONNES_REQ).eq('client_id', clientId)
  if (vue === 'toutes') {
    if (!voitTout(n)) throw new ForbiddenError('Vous ne voyez que les réquisitions de vos services.')
  } else if (vue === 'a_valider') {
    // Demandes en attente des services dont je suis responsable (tous pour l'administration).
    req = req.eq('statut', 'a_valider')
    if (!commandePourTous(n)) {
      const ids = [...a.responsables]
      if (ids.length === 0) return { services, requisitions: [] }
      req = req.in('service_demandeur_id', ids)
    }
  } else {
    // Mes demandes : bons de mes services demandeurs, ou que j'ai passés.
    const ids = [...a.ids]
    const filtres = [`demandeur_id.eq.${userId}`]
    if (ids.length > 0) filtres.push(`service_demandeur_id.in.(${ids.join(',')})`)
    req = req.or(filtres.join(','))
  }
  const { data, error } = await req.order('envoyee_at', { ascending: false }).limit(300)
  if (error) throw new Error(error.message)
  const reqs = (data ?? []) as Requisition[]

  const nbLignes = new Map<string, number>()
  if (reqs.length > 0) {
    const { data: lignes, error: lErr } = await db.from('requisition_lignes').select('requisition_id')
      .eq('client_id', clientId).in('requisition_id', reqs.map((r) => r.id))
    if (lErr) throw new Error(lErr.message)
    for (const l of lignes ?? []) nbLignes.set(l.requisition_id as string, (nbLignes.get(l.requisition_id as string) ?? 0) + 1)
  }
  const noms = await nomsUtilisateurs(db, reqs.map((r) => r.demandeur_id || ''))

  return {
    services,
    requisitions: reqs.map((r) => ({
      ...r,
      nb_lignes: nbLignes.get(r.id) ?? 0,
      demandeur_nom: r.demandeur_id ? noms.get(r.demandeur_id) ?? null : null,
      peut_annuler: peutAnnulerBon(r, userId, a, n),
      peut_valider: peutValider(r, a.responsables, n),
    })),
  }
}

async function chargerVisible(db: SupabaseClient, clientId: string, userId: string, n: NiveauxRequisitions, id: string) {
  const [{ data, error }, a] = await Promise.all([
    db.from('requisitions').select(COLONNES_REQ).eq('client_id', clientId).eq('id', id).maybeSingle(),
    appartenances(db, clientId, userId),
  ])
  if (error) throw new Error(error.message)
  // Bon invisible = introuvable (ne pas révéler son existence).
  if (!data || !estVisible(data as Requisition, a.ids, n)) throw new NotFoundError('Réquisition introuvable.')
  return { r: data as Requisition, a }
}

export async function detailRequisition(db: SupabaseClient, clientId: string, userId: string, n: NiveauxRequisitions, id: string) {
  const { r, a } = await chargerVisible(db, clientId, userId, n, id)
  const [{ data: lignes, error }, services] = await Promise.all([
    db.from('requisition_lignes').select(COLONNES_LIGNE).eq('client_id', clientId).eq('requisition_id', id).order('ordre'),
    servicesEtablissement(db, clientId),
  ])
  if (error) throw new Error(error.message)
  const noms = await nomsUtilisateurs(db, [r.demandeur_id || '', r.valideur_id || '', r.refusee_par || ''])
  const nom = (uid?: string | null) => (uid ? noms.get(uid) ?? null : null)
  return {
    requisition: {
      ...r,
      demandeur_nom: nom(r.demandeur_id),
      valideur_nom: nom(r.valideur_id),
      refusee_par_nom: nom(r.refusee_par),
      peut_annuler: peutAnnulerBon(r, userId, a, n),
      peut_valider: peutValider(r, a.responsables, n),
    },
    lignes: lignes ?? [],
    services: services.filter((s) => s.id === r.service_demandeur_id || s.id === r.service_preparateur_id),
  }
}

export async function annulerRequisition(db: SupabaseClient, clientId: string, userId: string, n: NiveauxRequisitions, id: string) {
  const { r, a } = await chargerVisible(db, clientId, userId, n, id)
  if (!(r.demandeur_id === userId || a.ids.has(r.service_demandeur_id) || commandePourTous(n))) {
    throw new ForbiddenError('Seul le service demandeur peut annuler cette réquisition.')
  }
  if (!peutAnnuler(r.statut)) throw new ConflictError('La préparation a commencé : la réquisition ne peut plus être annulée.')

  // Filtre sur le statut : si le préparateur l'a prise entre-temps, rien n'est modifié.
  const { data, error } = await db.from('requisitions')
    .update({ statut: 'annulee', annulee_at: new Date().toISOString() })
    .eq('client_id', clientId).eq('id', id).in('statut', STATUTS_ANNULABLES)
    .select('id, numero')
  if (error) throw new Error(error.message)
  if (!data || data.length === 0) throw new ConflictError('La préparation a commencé : la réquisition ne peut plus être annulée.')
  return { id, numero: r.numero }
}

// ── Validation (optionnelle, cf. clients.requisitions_validation) ─────────

async function chargerAValider(db: SupabaseClient, clientId: string, userId: string, n: NiveauxRequisitions, id: string) {
  const { r, a } = await chargerVisible(db, clientId, userId, n, id)
  if (r.statut !== 'a_valider') throw new ConflictError('Cette réquisition n\'attend pas de validation.')
  if (!peutValider(r, a.responsables, n)) {
    throw new ForbiddenError('Seul le responsable du service demandeur (ou un administrateur) valide cette demande.')
  }
  return r
}

/** Valide la demande : elle part en préparation. */
export async function validerRequisition(db: SupabaseClient, clientId: string, userId: string, n: NiveauxRequisitions, id: string) {
  const r = await chargerAValider(db, clientId, userId, n, id)
  const { data, error } = await db.from('requisitions')
    .update({ statut: 'a_preparer', valideur_id: userId, validee_at: new Date().toISOString() })
    .eq('client_id', clientId).eq('id', id).eq('statut', 'a_valider')
    .select('id, numero')
  if (error) throw new Error(error.message)
  if (!data || data.length === 0) throw new ConflictError('Cette réquisition a changé entre-temps : rechargez la page.')
  return { id, numero: r.numero, service_preparateur_id: r.service_preparateur_id }
}

/** Refuse la demande avec un motif. */
export async function refuserRequisition(db: SupabaseClient, clientId: string, userId: string, n: NiveauxRequisitions, id: string, motif: string) {
  const r = await chargerAValider(db, clientId, userId, n, id)
  const { data, error } = await db.from('requisitions')
    .update({ statut: 'refusee', refusee_par: userId, refusee_at: new Date().toISOString(), motif_refus: motif.trim() })
    .eq('client_id', clientId).eq('id', id).eq('statut', 'a_valider')
    .select('id, numero')
  if (error) throw new Error(error.message)
  if (!data || data.length === 0) throw new ConflictError('Cette réquisition a changé entre-temps : rechargez la page.')
  return { id, numero: r.numero, demandeur_id: r.demandeur_id }
}
