import { z } from 'zod'

// ── Shared primitives ──────────────────────────────────────────────────────
export const uuidSchema = z.string().uuid('UUID invalide')
export const clientIdSchema = uuidSchema
export const sectionSchema = z.enum(['cuisine', 'bar']).default('cuisine')

// ── Ligne de facture ───────────────────────────────────────────────────────
const ligneFactureSchema = z.object({
  designation:      z.string().min(1, 'Désignation requise'),
  ingredient_id:    z.string().uuid().nullable().optional(),
  quantite:         z.coerce.number().min(0, 'Quantité invalide'),
  unite:            z.string().nullable().optional(),
  // Conditionnement : nb d'unités d'utilisation par achat (ex : sac de 3 kg → 3).
  // Sert à la création de l'article : prix_kg = prix de la ligne / conditionnement.
  conditionnement:  z.coerce.number().positive().optional().default(1),
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
  section:        sectionSchema,
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
  section:        z.enum(['cuisine', 'bar']).optional(),
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
  section:       sectionSchema,
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
  // Unité optionnelle : si absente, le service applique une unité par défaut.
  unite:    z.string().max(20).optional().nullable(),
  prix_kg:  z.coerce.number().min(0).nullable().optional().default(0),
  // Conditionnement : nombre d'unités d'utilisation par achat (défaut 1).
  // Ex : poulpe vendu par unité de 10 tentacules → conditionnement = 10.
  conditionnement: z.coerce.number().positive().optional().default(1),
  section:  sectionSchema,
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
  section: sectionSchema,
  rows: z.array(z.object({
    fournisseur:   z.string().min(1, 'Fournisseur requis').max(255),
    dateFacture:   z.string().min(1, 'Date requise'),
    numeroFacture: z.string().max(100).nullable().optional(),
    totalHt:       z.coerce.number(),
  })).min(1, 'Au moins une ligne').max(1000, 'Trop de lignes (max 1000)'),
})

export type BulkImportHeadersInput = z.infer<typeof bulkImportHeadersSchema>

// ── Mercuriale query ───────────────────────────────────────────────────────
const dateIsoSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format YYYY-MM-DD attendu')

export const mercurialeQuerySchema = z.object({
  client_id:  clientIdSchema,
  date_debut: dateIsoSchema.optional(),
  date_fin:   dateIsoSchema.optional(),
  section:    sectionSchema,
})

// ── Reconciliation query ───────────────────────────────────────────────────
export const reconciliationQuerySchema = z.object({
  client_id: clientIdSchema,
  section:   sectionSchema,
})
