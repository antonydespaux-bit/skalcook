/**
 * Service layer for Food Cost Ratio domain.
 *
 * Un rapport = (client, periode_debut, periode_fin) avec :
 *   - inventaires début/fin (saisis, HT, optionnels)
 *   - notes libres
 *
 * Les ajustements sont indépendants des rapports : chacun a sa propre
 * date_ajustement. Le rapport courant inclut tous les ajustements du client
 * dont date_ajustement ∈ [periode_debut, periode_fin]. Idem pour la preview
 * d'une période non sauvegardée.
 *
 * Le CA Food HT et la somme des achats sur la période sont calculés à la
 * volée depuis ca_journalier et achats_factures (non persistés).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  CreateRapportInput,
  PatchRapportInput,
  DeleteRapportInput,
  GetRapportInput,
  ListRapportsInput,
  PreviewPeriodeInput,
  CreateAjustementInput,
  PatchAjustementInput,
  DeleteAjustementInput,
} from '../validators/foodCost.schema'

// TVA Food 10% (cohérent avec lib/caAnalyses.js / TVA_FOOD)
const TVA_FOOD = 1.10

// ── Helpers de calcul ──────────────────────────────────────────────────────

export async function computeCaFoodHt(
  db: SupabaseClient,
  clientId: string,
  debut: string,
  fin: string,
): Promise<number> {
  const { data, error } = await db
    .from('ca_journalier')
    .select('ca_food')
    .eq('client_id', clientId)
    .gte('jour', debut)
    .lte('jour', fin)
  if (error) throw new Error(error.message)
  const totalFoodTtc = (data ?? []).reduce((s, r) => s + (Number((r as { ca_food: number | null }).ca_food) || 0), 0)
  return totalFoodTtc / TVA_FOOD
}

export async function computeAchatsHt(
  db: SupabaseClient,
  clientId: string,
  debut: string,
  fin: string,
): Promise<number> {
  const { data, error } = await db
    .from('achats_factures')
    .select('total_ht')
    .eq('client_id', clientId)
    .gte('date_facture', debut)
    .lte('date_facture', fin)
    .is('deleted_at', null)
  if (error) throw new Error(error.message)
  return (data ?? []).reduce((s, r) => s + (Number((r as { total_ht: number | null }).total_ht) || 0), 0)
}

async function fetchAjustementsForPeriode(
  db: SupabaseClient,
  clientId: string,
  debut: string,
  fin: string,
) {
  const { data, error } = await db
    .from('food_cost_ajustements')
    .select('id, date_ajustement, libelle, montant, commentaire, rapport_id, created_at')
    .eq('client_id', clientId)
    .gte('date_ajustement', debut)
    .lte('date_ajustement', fin)
    .order('date_ajustement', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) throw new Error(error.message)
  return data ?? []
}

// ── Rapport CRUD ───────────────────────────────────────────────────────────

export async function createRapport(
  db: SupabaseClient,
  input: CreateRapportInput,
  userId: string,
) {
  const { clientId, periodeDebut, periodeFin, inventaireDebutHt, inventaireFinHt, notes } = input

  // Refus si un rapport actif existe déjà pour cette période exacte.
  const { data: existing } = await db
    .from('food_cost_rapports')
    .select('id')
    .eq('client_id', clientId)
    .eq('periode_debut', periodeDebut)
    .eq('periode_fin', periodeFin)
    .is('deleted_at', null)
    .maybeSingle()
  if (existing) {
    return { rapport_id: existing.id, created: false, duplicate: true }
  }

  const { data: created, error } = await db
    .from('food_cost_rapports')
    .insert({
      client_id: clientId,
      periode_debut: periodeDebut,
      periode_fin: periodeFin,
      inventaire_debut_ht: inventaireDebutHt ?? null,
      inventaire_fin_ht: inventaireFinHt ?? null,
      notes: notes ?? '',
      created_by: userId,
    })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  return { rapport_id: created.id, created: true, duplicate: false }
}

export async function getRapport(db: SupabaseClient, input: GetRapportInput) {
  const { rapportId, clientId } = input

  const { data: rapport, error } = await db
    .from('food_cost_rapports')
    .select('id, client_id, periode_debut, periode_fin, inventaire_debut_ht, inventaire_fin_ht, notes, created_at, updated_at')
    .eq('id', rapportId)
    .eq('client_id', clientId)
    .is('deleted_at', null)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!rapport) return null

  const [ajustements, caFoodHt, achatsHt] = await Promise.all([
    fetchAjustementsForPeriode(db, clientId, rapport.periode_debut, rapport.periode_fin),
    computeCaFoodHt(db, clientId, rapport.periode_debut, rapport.periode_fin),
    computeAchatsHt(db, clientId, rapport.periode_debut, rapport.periode_fin),
  ])

  return {
    rapport,
    ajustements,
    totaux: {
      ca_food_ht: caFoodHt,
      achats_ht: achatsHt,
    },
  }
}

export async function listRapports(db: SupabaseClient, input: ListRapportsInput) {
  const { clientId } = input
  const { data, error } = await db
    .from('food_cost_rapports')
    .select('id, periode_debut, periode_fin, inventaire_debut_ht, inventaire_fin_ht, notes, created_at, updated_at')
    .eq('client_id', clientId)
    .is('deleted_at', null)
    .order('periode_debut', { ascending: false })
    .limit(100)
  if (error) throw new Error(error.message)
  return { rapports: data ?? [] }
}

export async function listAllAjustements(db: SupabaseClient, input: ListRapportsInput) {
  const { clientId } = input
  const { data, error } = await db
    .from('food_cost_ajustements')
    .select('id, date_ajustement, libelle, montant, commentaire, rapport_id, created_at')
    .eq('client_id', clientId)
    .order('date_ajustement', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1000)
  if (error) throw new Error(error.message)
  return { ajustements: data ?? [] }
}

export async function previewPeriode(db: SupabaseClient, input: PreviewPeriodeInput) {
  const { clientId, periodeDebut, periodeFin } = input
  const [ajustements, caFoodHt, achatsHt] = await Promise.all([
    fetchAjustementsForPeriode(db, clientId, periodeDebut, periodeFin),
    computeCaFoodHt(db, clientId, periodeDebut, periodeFin),
    computeAchatsHt(db, clientId, periodeDebut, periodeFin),
  ])
  return {
    ajustements,
    totaux: { ca_food_ht: caFoodHt, achats_ht: achatsHt },
  }
}

export async function patchRapport(db: SupabaseClient, input: PatchRapportInput) {
  const { rapportId, clientId, periodeDebut, periodeFin, inventaireDebutHt, inventaireFinHt, notes } = input

  const updates: Record<string, unknown> = {}
  if (periodeDebut !== undefined) updates.periode_debut = periodeDebut
  if (periodeFin !== undefined) updates.periode_fin = periodeFin
  if (inventaireDebutHt !== undefined) updates.inventaire_debut_ht = inventaireDebutHt
  if (inventaireFinHt !== undefined) updates.inventaire_fin_ht = inventaireFinHt
  if (notes !== undefined) updates.notes = notes

  if (Object.keys(updates).length === 0) return { updated: false }

  const { error } = await db
    .from('food_cost_rapports')
    .update(updates)
    .eq('id', rapportId)
    .eq('client_id', clientId)
    .is('deleted_at', null)
  if (error) throw new Error(error.message)
  return { updated: true }
}

export async function deleteRapport(db: SupabaseClient, input: DeleteRapportInput) {
  const { rapportId, clientId } = input
  const { error } = await db
    .from('food_cost_rapports')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', rapportId)
    .eq('client_id', clientId)
    .is('deleted_at', null)
  if (error) throw new Error(error.message)
  return { deleted: true }
}

// ── Ajustements CRUD ───────────────────────────────────────────────────────

export async function createAjustement(
  db: SupabaseClient,
  input: CreateAjustementInput,
  userId: string,
) {
  const { clientId, rapportId, dateAjustement, libelle, montant, commentaire } = input
  const { data, error } = await db
    .from('food_cost_ajustements')
    .insert({
      client_id: clientId,
      rapport_id: rapportId ?? null,
      date_ajustement: dateAjustement,
      libelle,
      montant,
      commentaire: commentaire ?? '',
      created_by: userId,
    })
    .select('id, date_ajustement, libelle, montant, commentaire, rapport_id, created_at')
    .single()
  if (error) throw new Error(error.message)
  return data
}

export async function patchAjustement(db: SupabaseClient, input: PatchAjustementInput) {
  const { clientId, ajustementId, dateAjustement, libelle, montant, commentaire } = input
  const updates: Record<string, unknown> = {}
  if (dateAjustement !== undefined) updates.date_ajustement = dateAjustement
  if (libelle !== undefined) updates.libelle = libelle
  if (montant !== undefined) updates.montant = montant
  if (commentaire !== undefined) updates.commentaire = commentaire
  if (Object.keys(updates).length === 0) return { updated: false }

  const { data, error } = await db
    .from('food_cost_ajustements')
    .update(updates)
    .eq('id', ajustementId)
    .eq('client_id', clientId)
    .select('id, date_ajustement, libelle, montant, commentaire, rapport_id, created_at')
    .single()
  if (error) throw new Error(error.message)
  return data
}

export async function deleteAjustement(db: SupabaseClient, input: DeleteAjustementInput) {
  const { clientId, ajustementId } = input
  const { error } = await db
    .from('food_cost_ajustements')
    .delete()
    .eq('id', ajustementId)
    .eq('client_id', clientId)
  if (error) throw new Error(error.message)
  return { deleted: true }
}
