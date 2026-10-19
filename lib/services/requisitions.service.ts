import type { SupabaseClient } from '@supabase/supabase-js'
import { ConflictError, NotFoundError, ValidationError } from '../errors'
import { listClientUsers } from './admin.service'

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
  if (error.code === '23503') throw new ConflictError('Ce service est utilisé par des réquisitions : désactivez-le plutôt que de le supprimer.')
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
