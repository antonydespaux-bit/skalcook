import type { SupabaseClient } from '@supabase/supabase-js'
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../errors'
import { listClientUsers } from './admin.service'
import { normUnite } from '../constants'

// Réquisitions — services internes et leurs membres (Paramètres › Services).
// Appelé par les routes /api/requisitions/* en service_role : chaque fonction
// filtre elle-même sur client_id (le guard a vérifié l'accès à ce client).

export type StockService = 'aucun' | 'cuisine' | 'bar' | 'articles'

export interface ServiceInterne {
  id: string
  client_id: string
  nom: string
  emoji: string | null
  ordre: number
  actif: boolean
  peut_demander: boolean
  peut_preparer: boolean
  stock: StockService
}

export interface ServicePatch {
  nom?: string
  emoji?: string | null
  peut_demander?: boolean
  peut_preparer?: boolean
  stock?: StockService
  actif?: boolean
}

const COLONNES = 'id, client_id, nom, emoji, ordre, actif, peut_demander, peut_preparer, stock'

// ── Règles pures (testées dans lib/__tests__/requisitions.service.test.ts) ──

/** Erreur lisible si la ligne complète viole les règles d'un service, sinon null. */
export function erreurService(s: Pick<ServiceInterne, 'peut_demander' | 'peut_preparer' | 'stock'>): string | null {
  if (!s.peut_demander && !s.peut_preparer) return 'Le service doit pouvoir demander, préparer, ou les deux.'
  if (s.peut_preparer && s.stock === 'aucun') return 'Un service qui prépare doit avoir un stock.'
  return null
}

/** Ligne existante + modifications, vérifiée avant l'UPDATE. */
export function fusionnerService(existant: ServiceInterne, patch: ServicePatch): ServiceInterne {
  const fusion = { ...existant }
  for (const [k, v] of Object.entries(patch)) {
    if (v !== undefined) (fusion as Record<string, unknown>)[k] = v
  }
  if (typeof fusion.nom === 'string') fusion.nom = fusion.nom.trim()
  const err = erreurService(fusion)
  if (err) throw new ValidationError(err)
  return fusion
}

/** user_id demandés qui n'ont pas accès à l'établissement. */
export function membresHorsEtablissement(demandes: string[], accesUserIds: string[]): string[] {
  const acces = new Set(accesUserIds)
  return demandes.filter((id) => !acces.has(id))
}

function traduireErreurDb(error: { code?: string; message: string }): never {
  if (error.code === '23505') throw new ConflictError('Un service porte déjà ce nom.')
  if (error.code === '23503') throw new ConflictError('Ce service a un catalogue d\'articles ou des réquisitions : désactivez-le plutôt que de le supprimer.')
  if (error.code === '23514') throw new ValidationError('Service invalide : il doit pouvoir demander ou préparer, et un service qui prépare doit avoir un stock.')
  throw new Error(error.message)
}

async function chargerService(db: SupabaseClient, clientId: string, id: string): Promise<ServiceInterne> {
  const { data, error } = await db.from('services_internes').select(COLONNES)
    .eq('client_id', clientId).eq('id', id).maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new NotFoundError('Service introuvable.')
  return data as ServiceInterne
}

// ── Lecture ────────────────────────────────────────────────────────────────

export async function listServicesEtMembres(db: SupabaseClient, clientId: string) {
  const [servicesRes, membresRes, clientRes, users] = await Promise.all([
    db.from('services_internes').select(COLONNES).eq('client_id', clientId)
      .order('ordre').order('nom'),
    db.from('service_membres').select('service_id, user_id, responsable').eq('client_id', clientId),
    db.from('clients').select('requisitions_validation').eq('id', clientId).maybeSingle(),
    listClientUsers(db, clientId),
  ])
  if (servicesRes.error) throw new Error(servicesRes.error.message)
  if (membresRes.error) throw new Error(membresRes.error.message)
  if (clientRes.error) throw new Error(clientRes.error.message)

  return {
    services: (servicesRes.data ?? []) as ServiceInterne[],
    membres: membresRes.data ?? [],
    utilisateurs: users.map((u: { user_id?: string; id?: string; nom?: string | null; email?: string | null; role?: string | null }) => ({
      user_id: u.user_id ?? u.id,
      nom: u.nom ?? null,
      email: u.email ?? null,
      role: u.role ?? null,
    })),
    validation: !!clientRes.data?.requisitions_validation,
  }
}

// ── Écriture ───────────────────────────────────────────────────────────────

export async function createService(
  db: SupabaseClient,
  clientId: string,
  data: Omit<ServicePatch, 'actif'> & Required<Pick<ServicePatch, 'nom' | 'peut_demander' | 'peut_preparer' | 'stock'>>,
): Promise<ServiceInterne> {
  const err = erreurService(data)
  if (err) throw new ValidationError(err)

  const { data: dernier } = await db.from('services_internes').select('ordre')
    .eq('client_id', clientId).order('ordre', { ascending: false }).limit(1).maybeSingle()

  const { data: cree, error } = await db.from('services_internes').insert({
    client_id: clientId,
    nom: data.nom.trim(),
    emoji: data.emoji ?? null,
    peut_demander: data.peut_demander,
    peut_preparer: data.peut_preparer,
    stock: data.stock,
    ordre: (dernier?.ordre ?? 0) + 1,
  }).select(COLONNES).single()
  if (error) traduireErreurDb(error)
  return cree as ServiceInterne
}

export async function updateService(db: SupabaseClient, clientId: string, id: string, patch: ServicePatch): Promise<ServiceInterne> {
  const existant = await chargerService(db, clientId, id)
  const f = fusionnerService(existant, patch)
  const { data, error } = await db.from('services_internes').update({
    nom: f.nom, emoji: f.emoji, peut_demander: f.peut_demander,
    peut_preparer: f.peut_preparer, stock: f.stock, actif: f.actif,
  }).eq('client_id', clientId).eq('id', id).select(COLONNES).single()
  if (error) traduireErreurDb(error)
  return data as ServiceInterne
}

export async function deleteService(db: SupabaseClient, clientId: string, id: string): Promise<ServiceInterne> {
  const existant = await chargerService(db, clientId, id)
  const { error } = await db.from('services_internes').delete().eq('client_id', clientId).eq('id', id)
  if (error) traduireErreurDb(error)
  return existant
}

export async function reordonnerServices(db: SupabaseClient, clientId: string, ids: string[]) {
  const { data, error } = await db.from('services_internes').select('id').eq('client_id', clientId).in('id', ids)
  if (error) throw new Error(error.message)
  if ((data ?? []).length !== new Set(ids).size) throw new ValidationError('Service inconnu dans l\'ordre demandé.')
  const resultats = await Promise.all(ids.map((id, i) =>
    db.from('services_internes').update({ ordre: i + 1 }).eq('client_id', clientId).eq('id', id)))
  const echec = resultats.find((r) => r.error)
  if (echec?.error) throw new Error(echec.error.message)
}

/** Remplace la liste des membres d'un service. */
export async function setMembres(
  db: SupabaseClient,
  clientId: string,
  serviceId: string,
  membres: { user_id: string; responsable: boolean }[],
) {
  const service = await chargerService(db, clientId, serviceId)

  if (membres.length > 0) {
    const { data: acces, error } = await db.from('acces_clients').select('user_id')
      .eq('client_id', clientId).in('user_id', membres.map((m) => m.user_id))
    if (error) throw new Error(error.message)
    const hors = membresHorsEtablissement(membres.map((m) => m.user_id), (acces ?? []).map((a) => a.user_id))
    if (hors.length > 0) throw new ValidationError('Certains utilisateurs n\'ont pas accès à cet établissement.')
  }

  const garder = membres.map((m) => m.user_id)
  let suppr = db.from('service_membres').delete().eq('client_id', clientId).eq('service_id', serviceId)
  if (garder.length > 0) suppr = suppr.not('user_id', 'in', `(${garder.join(',')})`)
  const { error: delErr } = await suppr
  if (delErr) throw new Error(delErr.message)

  if (membres.length > 0) {
    const { error: upErr } = await db.from('service_membres').upsert(
      membres.map((m) => ({ service_id: serviceId, client_id: clientId, user_id: m.user_id, responsable: m.responsable })),
      { onConflict: 'service_id,user_id' },
    )
    if (upErr) throw new Error(upErr.message)
  }
  return { service, membres: membres.length }
}

export async function setValidationRequisitions(db: SupabaseClient, clientId: string, validation: boolean) {
  const { error } = await db.from('clients').update({ requisitions_validation: validation }).eq('id', clientId)
  if (error) throw new Error(error.message)
}

// ── Catalogue d'articles ───────────────────────────────────────────────────

export interface Article {
  id: string
  client_id: string
  service_id: string
  nom: string
  categorie: string | null
  reference: string | null
  unite: string
  prix_unitaire: number | null
  actif: boolean
}

export interface ArticleChamps {
  nom?: string
  categorie?: string | null
  reference?: string | null
  unite?: string
  prix_unitaire?: number | null
  actif?: boolean
}

const COLONNES_ARTICLE = 'id, client_id, service_id, nom, categorie, reference, unite, prix_unitaire, actif'

/**
 * Qui peut modifier le catalogue d'un service : « administration » en
 * modification, ou membre du service avec « requisitions » en modification
 * (miroir des policies de public.articles).
 */
export function peutGererCatalogue(
  niveaux: { administration: string; requisitions: string },
  estMembre: boolean,
): boolean {
  if (niveaux.administration === 'modification') return true
  return estMembre && niveaux.requisitions === 'modification'
}

function traduireErreurArticle(error: { code?: string; message: string }): never {
  if (error.code === '23505') throw new ConflictError('Un article porte déjà ce nom dans ce catalogue.')
  if (error.code === '23514') throw new ValidationError('Article invalide.')
  throw new Error(error.message)
}

/** Services au stock « articles » de l'établissement (catalogues possibles). */
async function servicesCatalogue(db: SupabaseClient, clientId: string): Promise<ServiceInterne[]> {
  const { data, error } = await db.from('services_internes').select(COLONNES)
    .eq('client_id', clientId).eq('stock', 'articles').order('ordre').order('nom')
  if (error) throw new Error(error.message)
  return (data ?? []) as ServiceInterne[]
}

async function servicesDuMembre(db: SupabaseClient, clientId: string, userId: string): Promise<Set<string>> {
  const { data, error } = await db.from('service_membres').select('service_id')
    .eq('client_id', clientId).eq('user_id', userId)
  if (error) throw new Error(error.message)
  return new Set((data ?? []).map((m) => m.service_id as string))
}

/**
 * Catalogues d'articles : services au stock « articles », avec pour chacun
 * le droit de modification de l'utilisateur, et les articles demandés.
 */
export async function listCatalogues(
  db: SupabaseClient,
  clientId: string,
  userId: string,
  niveaux: { administration: string; requisitions: string },
  serviceId?: string,
) {
  const [services, membreDe] = await Promise.all([
    servicesCatalogue(db, clientId),
    servicesDuMembre(db, clientId, userId),
  ])
  let q = db.from('articles').select(COLONNES_ARTICLE).eq('client_id', clientId)
  if (serviceId) q = q.eq('service_id', serviceId)
  const { data: articles, error } = await q.order('categorie', { nullsFirst: false }).order('nom')
  if (error) throw new Error(error.message)
  return {
    services: services.map((s) => ({ ...s, peut_modifier: peutGererCatalogue(niveaux, membreDe.has(s.id)) })),
    articles: (articles ?? []) as Article[],
  }
}

/** Vérifie le service cible (stock « articles ») et le droit de l'utilisateur. */
export async function verifierCatalogue(
  db: SupabaseClient,
  clientId: string,
  serviceId: string,
  userId: string,
  niveaux: { administration: string; requisitions: string },
): Promise<ServiceInterne> {
  const service = await chargerService(db, clientId, serviceId)
  if (service.stock !== 'articles') throw new ValidationError('Ce service ne sert pas de catalogue d\'articles.')
  const membreDe = await servicesDuMembre(db, clientId, userId)
  if (!peutGererCatalogue(niveaux, membreDe.has(serviceId))) {
    throw new ForbiddenError('Seuls les membres du service (ou un administrateur) modifient ce catalogue.')
  }
  return service
}

export async function chargerArticle(db: SupabaseClient, clientId: string, id: string): Promise<Article> {
  const { data, error } = await db.from('articles').select(COLONNES_ARTICLE)
    .eq('client_id', clientId).eq('id', id).maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new NotFoundError('Article introuvable.')
  return data as Article
}

/** Champs normalisés avant écriture (nom trimé, unité canonique). */
export function normaliserArticle<T extends ArticleChamps>(champs: T): T {
  const out = { ...champs }
  if (typeof out.nom === 'string') out.nom = out.nom.trim()
  if (typeof out.unite === 'string') out.unite = normUnite(out.unite) || 'u'
  return out
}

export async function createArticle(
  db: SupabaseClient,
  clientId: string,
  serviceId: string,
  champs: Required<Pick<ArticleChamps, 'nom' | 'unite'>> & ArticleChamps,
): Promise<Article> {
  const c = normaliserArticle(champs)
  const { data, error } = await db.from('articles').insert({
    client_id: clientId,
    service_id: serviceId,
    nom: c.nom,
    categorie: c.categorie ?? null,
    reference: c.reference ?? null,
    unite: c.unite,
    prix_unitaire: c.prix_unitaire ?? null,
  }).select(COLONNES_ARTICLE).single()
  if (error) traduireErreurArticle(error)
  return data as Article
}

export async function updateArticle(db: SupabaseClient, clientId: string, id: string, patch: ArticleChamps): Promise<Article> {
  const c = normaliserArticle(patch)
  const maj = Object.fromEntries(Object.entries(c).filter(([, v]) => v !== undefined))
  const { data, error } = await db.from('articles').update(maj)
    .eq('client_id', clientId).eq('id', id).select(COLONNES_ARTICLE).single()
  if (error) traduireErreurArticle(error)
  return data as Article
}

export async function deleteArticle(db: SupabaseClient, clientId: string, id: string) {
  const { error } = await db.from('articles').delete().eq('client_id', clientId).eq('id', id)
  if (error) {
    if (error.code === '23503') throw new ConflictError('Cet article figure dans des réquisitions : désactivez-le plutôt que de le supprimer.')
    throw new Error(error.message)
  }
}
