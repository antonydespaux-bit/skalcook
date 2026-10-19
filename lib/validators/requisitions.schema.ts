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
