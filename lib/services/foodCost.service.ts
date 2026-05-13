/**
 * Service layer for Food Cost Ratio domain.
 *
 * Un rapport = (client, periode_debut, periode_fin) avec :
 *   - inventaires début/fin (saisis, HT, optionnels)
 *   - liste d'ajustements libres (libellé + montant signé + commentaire)
 *
 * Le CA Food HT et la somme des achats sur la période sont *calculés à la
 * volée* depuis ca_journalier et achats_factures. On ne les persiste pas.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  UpsertRapportInput,
  PatchRapportInput,
  DeleteRapportInput,
  GetRapportInput,
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

// ── Rapport CRUD ───────────────────────────────────────────────────────────

export async function upsertRapport(
  db: SupabaseClient,
  input: UpsertRapportInput,
  userId: string,
) {
  const { clientId, periodeDebut, periodeFin } = input

  // 1. Rapport existant pour cette période ?
  const { data: existing } = await db
    .from('food_cost_rapports')
    .select('id')
    .eq('client_id', clientId)
    .eq('periode_debut', periodeDebut)
    .eq('periode_fin', periodeFin)
    .is('deleted_at', null)
    .maybeSingle()

  if (existing) return { rapport_id: existing.id, created: false }

  // 2. Création
  const { data: created, error } = await db
    .from('food_cost_rapports')
    .insert({
      client_id: clientId,
      periode_debut: periodeDebut,
      periode_fin: periodeFin,
      created_by: userId,
    })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  return { rapport_id: created.id, created: true }
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

  const { data: ajustements } = await db
    .from('food_cost_ajustements')
    .select('id, libelle, montant, commentaire, created_at')
    .eq('rapport_id', rapportId)
    .eq('client_id', clientId)
    .order('created_at', { ascending: true })

  // Calculs live
  const [caFoodHt, achatsHt] = await Promise.all([
    computeCaFoodHt(db, clientId, rapport.periode_debut, rapport.periode_fin),
    computeAchatsHt(db, clientId, rapport.periode_debut, rapport.periode_fin),
  ])

  return {
    rapport,
    ajustements: ajustements ?? [],
    totaux: {
      ca_food_ht: caFoodHt,
      achats_ht: achatsHt,
    },
  }
}

export async function patchRapport(db: SupabaseClient, input: PatchRapportInput) {
  const { rapportId, clientId, inventaireDebutHt, inventaireFinHt, notes } = input

  const updates: Record<string, unknown> = {}
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
  const { clientId, rapportId, libelle, montant, commentaire } = input
  const { data, error } = await db
    .from('food_cost_ajustements')
    .insert({
      client_id: clientId,
      rapport_id: rapportId,
      libelle,
      montant,
      commentaire: commentaire ?? '',
      created_by: userId,
    })
    .select('id, libelle, montant, commentaire, created_at')
    .single()
  if (error) throw new Error(error.message)
  return data
}

export async function patchAjustement(db: SupabaseClient, input: PatchAjustementInput) {
  const { clientId, ajustementId, libelle, montant, commentaire } = input
  const updates: Record<string, unknown> = {}
  if (libelle !== undefined) updates.libelle = libelle
  if (montant !== undefined) updates.montant = montant
  if (commentaire !== undefined) updates.commentaire = commentaire
  if (Object.keys(updates).length === 0) return { updated: false }

  const { error } = await db
    .from('food_cost_ajustements')
    .update(updates)
    .eq('id', ajustementId)
    .eq('client_id', clientId)
  if (error) throw new Error(error.message)
  return { updated: true }
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
