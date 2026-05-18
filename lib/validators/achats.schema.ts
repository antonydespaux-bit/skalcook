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
  // Taux de TVA spécifique à la ligne (pour factures multi-taux). Si null,
  // on retombera sur le taux global de la facture (achats_factures.taux_tva).
  taux_tva:         z.coerce.number().min(0).max(100).nullable().optional(),
  updatePrice:      z.boolean().optional(),
})

export type LigneFacture = z.infer<typeof ligneFactureSchema>

// ── Save facture ───────────────────────────────────────────────────────────
export const saveFactureSchema = z.object({
  clientId:       clientIdSchema,
  fournisseur:    z.string().min(1, 'Fournisseur requis').max(255),
  numeroFacture:  z.string().max(100).optional().nullable(),
  dateFacture:    z.string().min(1, 'Date requise'),
  statut:         z.enum(['bl', 'facture', 'avoir']).default('facture'),
  lignes:         z.array(ligneFactureSchema).min(1, 'Au moins une ligne requise'),
  // En mode manuel, le client envoie null (pas undefined) → on accepte les deux.
  fileBase64:     z.string().nullable().optional(),
  fileMime:       z.enum(['application/pdf', 'image/png', 'image/webp', 'image/jpeg']).nullable().optional(),
  forceInsert:    z.boolean().optional(),
  tauxTva:        z.coerce.number().min(0).max(100).optional(),
  // Montant TVA total saisi en pied de facture (override). Si fourni, prime
  // sur le calcul automatique depuis les taux par ligne / le taux global.
  montantTva:     z.coerce.number().min(0).nullable().optional(),
  autoCreateMissing: z.boolean().optional(),
})

export type SaveFactureInput = z.infer<typeof saveFactureSchema>

// ── Update facture ─────────────────────────────────────────────────────────
export const updateFactureSchema = z.object({
  factureId:      uuidSchema,
  clientId:       clientIdSchema,
  fournisseur:    z.string().min(1).max(255).optional(),
  numeroFacture:  z.string().max(100).optional().nullable(),
  dateFacture:    z.string().optional(),
  statut:         z.enum(['bl', 'facture', 'avoir']).optional(),
  tauxTva:        z.coerce.number().min(0).max(100).optional(),
  montantTva:     z.coerce.number().min(0).nullable().optional(),
  lignes:         z.array(ligneFactureSchema).optional(),
})

export type UpdateFactureInput = z.infer<typeof updateFactureSchema>

// ── Delete facture ─────────────────────────────────────────────────────────
export const deleteFactureSchema = z.object({
  factureId: uuidSchema,
  clientId:  clientIdSchema,
})

// ── Fusionner plusieurs BL en une facture consolidée ──────────────────────
export const fusionnerBlsSchema = z.object({
  clientId:      clientIdSchema,
  blIds:         z.array(uuidSchema).min(2, 'Sélectionne au moins 2 BL'),
  numeroFacture: z.string().min(1, 'Numéro de facture requis').max(100),
  dateFacture:   z.string().min(1, 'Date requise'),
  totalHt:       z.coerce.number(),
  montantTva:    z.coerce.number().nullable().optional(),
  tauxTva:       z.coerce.number().min(0).max(100).nullable().optional(),
})

export type FusionnerBlsInput = z.infer<typeof fusionnerBlsSchema>

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

// ── Import Excel pied de facture ───────────────────────────────────────────
// Import en masse de "pieds de facture" (entêtes seuls, sans lignes détaillées)
// depuis un fichier Excel. Chaque row → 1 facture + 1 ligne fictive globale
// portant le total HT, pour rester compatible avec le schéma qui exige ≥1 ligne.
export const bulkImportHeadersSchema = z.object({
  clientId: clientIdSchema,
  rows: z.array(z.object({
    fournisseur:   z.string().min(1, 'Fournisseur requis').max(255),
    dateFacture:   z.string().min(1, 'Date requise'),
    numeroFacture: z.string().max(100).nullable().optional(),
    totalHt:       z.coerce.number(),
  })).min(1, 'Au moins une ligne').max(1000, 'Trop de lignes (max 1000)'),
})

export type BulkImportHeadersInput = z.infer<typeof bulkImportHeadersSchema>

// ── Reconciliation query ───────────────────────────────────────────────────
export const reconciliationQuerySchema = z.object({
  client_id: clientIdSchema,
})
