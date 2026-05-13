import { z } from 'zod'
import { clientIdSchema, uuidSchema } from './achats.schema'

// Période ISO YYYY-MM-DD
const dateIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date attendue au format YYYY-MM-DD')

// ── Upsert d'un rapport food cost pour une période donnée ─────────────────
// Crée si absent, retourne l'existant si déjà présent (idempotent sur
// le couple client_id + periode_debut + periode_fin).
export const upsertRapportSchema = z.object({
  clientId:           clientIdSchema,
  periodeDebut:       dateIso,
  periodeFin:         dateIso,
}).refine(d => d.periodeFin >= d.periodeDebut, {
  message: 'periodeFin doit être >= periodeDebut',
  path: ['periodeFin'],
})

// ── Patch d'un rapport (inventaires + notes) ───────────────────────────────
export const patchRapportSchema = z.object({
  rapportId:           uuidSchema,
  clientId:            clientIdSchema,
  inventaireDebutHt:   z.coerce.number().nullable().optional(),
  inventaireFinHt:     z.coerce.number().nullable().optional(),
  notes:               z.string().max(2000).optional(),
})

// ── Delete (soft) d'un rapport ─────────────────────────────────────────────
export const deleteRapportSchema = z.object({
  rapportId: uuidSchema,
  clientId:  clientIdSchema,
})

// ── Get rapport + computed totals ──────────────────────────────────────────
export const getRapportSchema = z.object({
  rapportId: uuidSchema,
  clientId:  clientIdSchema,
})

// ── Ajustements ─────────────────────────────────────────────────────────────
export const createAjustementSchema = z.object({
  clientId:    clientIdSchema,
  rapportId:   uuidSchema,
  libelle:     z.string().min(1, 'Libellé requis').max(255),
  montant:     z.coerce.number(),  // signé
  commentaire: z.string().max(2000).optional().default(''),
})

export const patchAjustementSchema = z.object({
  clientId:    clientIdSchema,
  ajustementId: uuidSchema,
  libelle:     z.string().min(1).max(255).optional(),
  montant:     z.coerce.number().optional(),
  commentaire: z.string().max(2000).optional(),
})

export const deleteAjustementSchema = z.object({
  clientId:     clientIdSchema,
  ajustementId: uuidSchema,
})

export type UpsertRapportInput   = z.infer<typeof upsertRapportSchema>
export type PatchRapportInput    = z.infer<typeof patchRapportSchema>
export type DeleteRapportInput   = z.infer<typeof deleteRapportSchema>
export type GetRapportInput      = z.infer<typeof getRapportSchema>
export type CreateAjustementInput = z.infer<typeof createAjustementSchema>
export type PatchAjustementInput  = z.infer<typeof patchAjustementSchema>
export type DeleteAjustementInput = z.infer<typeof deleteAjustementSchema>
