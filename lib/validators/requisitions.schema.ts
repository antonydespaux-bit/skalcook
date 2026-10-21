import { z } from 'zod'
import { clientIdSchema, uuidSchema } from './achats.schema'

// Catalogue servi par un service quand il prépare une réquisition
// (miroir de la contrainte services_internes.stock).
export const STOCKS_SERVICE = ['aucun', 'cuisine', 'bar', 'articles'] as const

const nomService = z.string().trim().min(1, 'Nom requis').max(80, '80 caractères maximum')

const champsService = {
  nom:           nomService,
  emoji:         z.string().max(16).nullable().optional(),
  peut_demander: z.boolean(),
  peut_preparer: z.boolean(),
  stock:         z.enum(STOCKS_SERVICE),
}

// Mêmes règles que les contraintes SQL, pour un message clair avant l'insert.
function reglesService(d: { peut_demander?: boolean; peut_preparer?: boolean; stock?: string }, ctx: z.RefinementCtx) {
  if (d.peut_demander === false && d.peut_preparer === false) {
    ctx.addIssue({ code: 'custom', message: 'Le service doit pouvoir demander, préparer, ou les deux.', path: ['peut_demander'] })
  }
  if (d.peut_preparer && d.stock === 'aucun') {
    ctx.addIssue({ code: 'custom', message: 'Un service qui prépare doit avoir un stock.', path: ['stock'] })
  }
}

export const listServicesQuerySchema = z.object({
  client_id: clientIdSchema,
})

export const createServiceSchema = z.object({
  client_id: clientIdSchema,
  ...champsService,
}).superRefine(reglesService)

// PATCH : tous les champs sont optionnels, mais les règles portent sur la
// ligne complète (le service fusionne avec l'existant avant de vérifier).
export const updateServiceSchema = z.object({
  client_id:     clientIdSchema,
  id:            uuidSchema,
  nom:           nomService.optional(),
  emoji:         z.string().max(16).nullable().optional(),
  peut_demander: z.boolean().optional(),
  peut_preparer: z.boolean().optional(),
  stock:         z.enum(STOCKS_SERVICE).optional(),
  actif:         z.boolean().optional(),
})

export const deleteServiceSchema = z.object({
  client_id: clientIdSchema,
  id:        uuidSchema,
})

export const reordonnerServicesSchema = z.object({
  client_id: clientIdSchema,
  ids:       z.array(uuidSchema).min(1).max(200),
})

export const setMembresSchema = z.object({
  client_id:  clientIdSchema,
  service_id: uuidSchema,
  membres:    z.array(z.object({
    user_id:     uuidSchema,
    responsable: z.boolean().default(false),
  })).max(500).refine(
    (m) => new Set(m.map((x) => x.user_id)).size === m.length,
    'Un utilisateur figure deux fois.',
  ),
})

export const parametresRequisitionsSchema = z.object({
  client_id:  clientIdSchema,
  validation: z.boolean(),
})


// ── Catalogue d'articles (services au stock « articles ») ──────────────────

const texteOptionnel = (max: number) => z.string().trim().max(max).nullable().optional()
  // Absent → undefined (champ inchangé en PATCH) ; vide → null (effacé).
  .transform((v) => (v === undefined ? undefined : v || null))

const champsArticle = {
  nom:           z.string().trim().min(1, 'Nom requis').max(120, '120 caractères maximum'),
  categorie:     texteOptionnel(60),
  reference:     texteOptionnel(60),
  unite:         z.string().trim().min(1).max(20),
  prix_unitaire: z.coerce.number().min(0).max(1_000_000).nullable().optional(),
}

export const listArticlesQuerySchema = z.object({
  client_id:  clientIdSchema,
  service_id: uuidSchema.optional(),
})

export const createArticleSchema = z.object({
  client_id:  clientIdSchema,
  service_id: uuidSchema,
  ...champsArticle,
})

export const updateArticleSchema = z.object({
  client_id:     clientIdSchema,
  id:            uuidSchema,
  nom:           champsArticle.nom.optional(),
  categorie:     champsArticle.categorie,
  reference:     champsArticle.reference,
  unite:         champsArticle.unite.optional(),
  prix_unitaire: champsArticle.prix_unitaire,
  actif:         z.boolean().optional(),
})

export const deleteArticleSchema = z.object({
  client_id: clientIdSchema,
  id:        uuidSchema,
})

// ── Demandes ───────────────────────────────────────────────────────────────

const dateIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date attendue au format YYYY-MM-DD')
const quantite = z.coerce.number().positive('Quantité > 0').max(100_000)

export const contexteQuerySchema = z.object({
  client_id: clientIdSchema,
})

export const catalogueQuerySchema = z.object({
  client_id:  clientIdSchema,
  service_id: uuidSchema,
  q:          z.string().trim().max(80).optional(),
})

export const createRequisitionSchema = z.object({
  client_id:              clientIdSchema,
  service_demandeur_id:   uuidSchema,
  service_preparateur_id: uuidSchema,
  date_souhaitee:         dateIso.nullable().optional(),
  commentaire:            z.string().trim().max(1000).nullable().optional(),
  lignes: z.array(z.object({
    produit_id:  uuidSchema,
    quantite,
    commentaire: z.string().trim().max(300).nullable().optional(),
  })).min(1, 'Ajoutez au moins un produit.').max(200).refine(
    (l) => new Set(l.map((x) => x.produit_id)).size === l.length,
    'Un produit figure deux fois.',
  ),
}).refine((d) => d.service_demandeur_id !== d.service_preparateur_id, {
  message: 'Le service destinataire doit être différent du service demandeur.',
  path: ['service_preparateur_id'],
})

export const VUES_REQUISITIONS = ['mes_demandes', 'a_valider', 'a_preparer', 'toutes'] as const

export const listRequisitionsQuerySchema = z.object({
  client_id: clientIdSchema,
  vue:       z.enum(VUES_REQUISITIONS).default('mes_demandes'),
})

export const requisitionIdSchema = z.object({
  client_id: clientIdSchema,
  id:        uuidSchema,
})

export const refusRequisitionSchema = z.object({
  client_id: clientIdSchema,
  id:        uuidSchema,
  motif:     z.string().trim().min(1, 'Motif requis').max(500),
})

// ── Préparation et livraison ───────────────────────────────────────────────

const quantiteLivree = z.coerce.number().min(0, 'Quantité ≥ 0').max(100_000)

export const livraisonSchema = z.object({
  client_id: clientIdSchema,
  id:        uuidSchema,
  // Quantité livrée de chaque ligne du bon (0 si le stock manque).
  lignes: z.array(z.object({
    id:              uuidSchema,
    quantite_livree: quantiteLivree,
  })).max(300),
  // Produits sortis en plus, demandés « à la voix ».
  ajouts: z.array(z.object({
    produit_id:      uuidSchema,
    quantite_livree: quantite,
    commentaire:     z.string().trim().max(300).nullable().optional(),
  })).max(100).default([]),
})

export const sortieDirecteSchema = z.object({
  client_id:              clientIdSchema,
  service_preparateur_id: uuidSchema,
  service_receveur_id:    uuidSchema,
  commentaire:            z.string().trim().max(1000).nullable().optional(),
  lignes: z.array(z.object({
    produit_id:  uuidSchema,
    quantite,
    commentaire: z.string().trim().max(300).nullable().optional(),
  })).min(1, 'Ajoutez au moins un produit.').max(200).refine(
    (l) => new Set(l.map((x) => x.produit_id)).size === l.length,
    'Un produit figure deux fois.',
  ),
}).refine((d) => d.service_preparateur_id !== d.service_receveur_id, {
  message: 'Le service receveur doit être différent du service qui sort le stock.',
  path: ['service_receveur_id'],
})

// ── Analyses ───────────────────────────────────────────────────────────────

export const analysesQuerySchema = z.object({
  client_id:  clientIdSchema,
  debut:      dateIso,
  fin:        dateIso,
  service_id: uuidSchema.optional(),
}).refine((d) => d.fin >= d.debut, { message: 'La fin doit suivre le début.', path: ['fin'] })
  .refine((d) => (Date.parse(d.fin) - Date.parse(d.debut)) / 86_400_000 <= 400, {
    message: 'Période limitée à 400 jours.', path: ['debut'],
  })
