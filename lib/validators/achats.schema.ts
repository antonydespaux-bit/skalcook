import { z } from 'zod'

// ── Shared primitives ──────────────────────────────────────────────────────
export const uuidSchema = z.string().uuid('UUID invalide')
export const clientIdSchema = uuidSchema

// ── Ligne de facture ───────────────────────────────────────────────────────
const ligneFactureSchema = z.object({
  designation:      z.string().min(1, 'Désignation requise'),
  ingredient_id:    z.string().uuid().nullable().optional(),
  quantite:         z.coerce.number().min(0, 'Quantité invalide'),
  unite:            z.string().nullable().optional(),
  prix_unitaire_ht: z.coerce.number().min(0),
  remise:           z.coerce.number().min(0).max(100).default(0),
  updatePrice:      z.boolean().optional(),
})

export type LigneFacture = z.infer<typeof ligneFactureSchema>

// ── Save facture ───────────────────────────────────────────────────────────
export const saveFactureSchema = z.object({
  clientId:       clientIdSchema,
  fournisseur:    z.string().min(1, 'Fournisseur requis').max(255),
  numeroFacture:  z.string().max(100).optional().nullable(),
  dateFacture:    z.string().min(1, 'Date requise'),
  statut:         z.enum(['bl', 'facture']).default('facture'),
  lignes:         z.array(ligneFactureSchema).min(1, 'Au moins une ligne requise'),
  fileBase64:     z.string().optional(),
  fileMime:       z.enum(['application/pdf', 'image/png', 'image/webp', 'image/jpeg']).optional(),
  forceInsert:    z.boolean().optional(),
  tauxTva:        z.coerce.number().min(0).max(100).optional(),
})

export type SaveFactureInput = z.infer<typeof saveFactureSchema>

// ── Update facture ─────────────────────────────────────────────────────────
export const updateFactureSchema = z.object({
  factureId:      uuidSchema,
  clientId:       clientIdSchema,
  fournisseur:    z.string().min(1).max(255).optional(),
  numeroFacture:  z.string().max(100).optional().nullable(),
  dateFacture:    z.string().optional(),
  statut:         z.enum(['bl', 'facture']).optional(),
})

export type UpdateFactureInput = z.infer<typeof updateFactureSchema>

// ── Delete facture ─────────────────────────────────────────────────────────
export const deleteFactureSchema = z.object({
  factureId: uuidSchema,
  clientId:  clientIdSchema,
})

// ── Check duplicate ────────────────────────────────────────────────────────
export const checkDuplicateSchema = z.object({
  clientId:      clientIdSchema,
  numeroFacture: z.string().min(1),
})

// ── Create ingredient ──────────────────────────────────────────────────────
export const createIngredientSchema = z.object({
  clientId: clientIdSchema,
  nom:      z.string().min(1, 'Nom requis').max(255),
  unite:    z.string().min(1).max(20),
  prix_kg:  z.coerce.number().min(0).optional().default(0),
})

export type CreateIngredientInput = z.infer<typeof createIngredientSchema>

// ── Parse facture (OCR) ────────────────────────────────────────────────────
export const parseFactureSchema = z.object({
  imageBase64: z.string().min(1, 'Image requise'),
  mimeType:    z.enum([
    'image/jpeg', 'image/png', 'image/webp', 'application/pdf',
  ]),
})

// ── Mercuriale query ───────────────────────────────────────────────────────
export const mercurialeQuerySchema = z.object({
  client_id: clientIdSchema,
})

// ── Reconciliation query ───────────────────────────────────────────────────
export const reconciliationQuerySchema = z.object({
  client_id: clientIdSchema,
})
