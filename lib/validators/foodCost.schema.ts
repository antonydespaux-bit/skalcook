import { z } from 'zod'
import { clientIdSchema, uuidSchema } from './achats.schema'

// Période ISO YYYY-MM-DD
const dateIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date attendue au format YYYY-MM-DD')

// ── Création explicite d'un rapport food cost pour une période donnée ─────
// Remplace l'ancien upsert. Renvoie une erreur si un rapport actif existe déjà
// pour le même triplet (client_id, periode_debut, periode_fin).
export const createRapportSchema = z.object({
  clientId:     clientIdSchema,
  periodeDebut: dateIso,
  periodeFin:   dateIso,
  inventaireDebutHt: z.coerce.number().nullable().optional(),
  inventaireFinHt:   z.coerce.number().nullable().optional(),
  notes:        z.string().max(2000).optional(),
}).refine(d => d.periodeFin >= d.periodeDebut, {
  message: 'periodeFin doit être >= periodeDebut',
  path: ['periodeFin'],
})

// ── Patch d'un rapport (inventaires + notes + période) ─────────────────────
export const patchRapportSchema = z.object({
  rapportId:         uuidSchema,
  clientId:          clientIdSchema,
  periodeDebut:      dateIso.optional(),
  periodeFin:        dateIso.optional(),
  inventaireDebutHt: z.coerce.number().nullable().optional(),
  inventaireFinHt:   z.coerce.number().nullable().optional(),
  notes:             z.string().max(2000).optional(),
}).refine(d => !d.periodeDebut || !d.periodeFin || d.periodeFin >= d.periodeDebut, {
  message: 'periodeFin doit être >= periodeDebut',
  path: ['periodeFin'],
})

// ── Delete (soft) d'un rapport ─────────────────────────────────────────────
export const deleteRapportSchema = z.object({
  rapportId: uuidSchema,
  clientId:  clientIdSchema,
})

// ── Get rapport unique + computed totals ───────────────────────────────────
export const getRapportSchema = z.object({
  rapportId: uuidSchema,
  clientId:  clientIdSchema,
})

// ── Liste des rapports sauvegardés ─────────────────────────────────────────
export const listRapportsSchema = z.object({
  clientId: clientIdSchema,
})

// ── Aperçu live d'une période (sans rapport sauvegardé) ────────────────────
// Permet de visualiser le ratio pour une période arbitraire, en chargeant les
// ajustements datés qui tombent dedans, sans créer de rapport en base.
export const previewPeriodeSchema = z.object({
  clientId:     clientIdSchema,
  periodeDebut: dateIso,
  periodeFin:   dateIso,
}).refine(d => d.periodeFin >= d.periodeDebut, {
  message: 'periodeFin doit être >= periodeDebut',
  path: ['periodeFin'],
})

// ── Ajustements ─────────────────────────────────────────────────────────────
// rapportId optionnel : un ajustement peut être créé en dehors de tout rapport
// sauvegardé. dateAjustement obligatoire : c'est elle qui détermine quels
// rapports le voient.
export const createAjustementSchema = z.object({
  clientId:        clientIdSchema,
  rapportId:       uuidSchema.optional().nullable(),
  dateAjustement:  dateIso,
  libelle:         z.string().min(1, 'Libellé requis').max(255),
  montant:         z.coerce.number(),  // signé
  commentaire:     z.string().max(2000).optional().default(''),
})

export const patchAjustementSchema = z.object({
  clientId:        clientIdSchema,
  ajustementId:    uuidSchema,
  dateAjustement:  dateIso.optional(),
  libelle:         z.string().min(1).max(255).optional(),
  montant:         z.coerce.number().optional(),
  commentaire:     z.string().max(2000).optional(),
})

export const deleteAjustementSchema = z.object({
  clientId:     clientIdSchema,
  ajustementId: uuidSchema,
})

export type CreateRapportInput   = z.infer<typeof createRapportSchema>
export type PatchRapportInput    = z.infer<typeof patchRapportSchema>
export type DeleteRapportInput   = z.infer<typeof deleteRapportSchema>
export type GetRapportInput      = z.infer<typeof getRapportSchema>
export type ListRapportsInput    = z.infer<typeof listRapportsSchema>
export type PreviewPeriodeInput  = z.infer<typeof previewPeriodeSchema>
export type CreateAjustementInput = z.infer<typeof createAjustementSchema>
export type PatchAjustementInput  = z.infer<typeof patchAjustementSchema>
export type DeleteAjustementInput = z.infer<typeof deleteAjustementSchema>
