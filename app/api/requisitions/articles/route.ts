import { apiHandler } from '../../../../lib/apiHandler'
import { logServeur } from '../../../../lib/serverLog'
import { niveauUtilisateur } from '../../../../lib/apiGuards'
import {
  listArticlesQuerySchema,
  createArticleSchema,
  updateArticleSchema,
  deleteArticleSchema,
} from '../../../../lib/validators/requisitions.schema'
import {
  listCatalogues,
  verifierCatalogue,
  chargerArticle,
  createArticle,
  updateArticle,
  deleteArticle,
} from '../../../../lib/services/requisitions.service'

// Catalogue d'articles hors F&B (économat, entretien…) des services au stock
// « articles ». Lecture : « requisitions » en lecture. Écriture : guard
// « requisitions » en modification, puis le service vérifie que l'utilisateur
// est membre du service ou a « administration » en modification.

type Utilisateur = { id: string; email?: string }

async function niveaux(user: Utilisateur, clientId: string) {
  const [administration, requisitions] = await Promise.all([
    niveauUtilisateur(user, clientId, 'administration'),
    niveauUtilisateur(user, clientId, 'requisitions'),
  ])
  return { administration, requisitions }
}

export const GET = apiHandler({
  schema: listArticlesQuerySchema,
  guard: 'permission',
  permission: { fonctionnalite: 'requisitions', niveau: 'lecture' },
  clientIdFrom: 'body.client_id',
  handler: async ({ data, user, db }) => {
    const u = user as Utilisateur
    return Response.json(await listCatalogues(db, data.client_id, u.id, await niveaux(u, data.client_id), data.service_id))
  },
})

export const POST = apiHandler({
  schema: createArticleSchema,
  guard: 'permission',
  permission: { fonctionnalite: 'requisitions', niveau: 'modification' },
  clientIdFrom: 'body.client_id',
  handler: async ({ data, user, db, request }) => {
    const u = user as Utilisateur
    const { client_id, service_id, ...champs } = data
    await verifierCatalogue(db, client_id, service_id, u.id, await niveaux(u, client_id))
    const article = await createArticle(db, client_id, service_id, champs)
    await logServeur(db, {
      user, clientId: client_id, action: 'CREATION', entite: 'articles',
      entiteId: article.id, entiteNom: article.nom, request,
    })
    return Response.json({ article })
  },
})

export const PATCH = apiHandler({
  schema: updateArticleSchema,
  guard: 'permission',
  permission: { fonctionnalite: 'requisitions', niveau: 'modification' },
  clientIdFrom: 'body.client_id',
  handler: async ({ data, user, db, request }) => {
    const u = user as Utilisateur
    const { client_id, id, ...patch } = data
    const existant = await chargerArticle(db, client_id, id)
    await verifierCatalogue(db, client_id, existant.service_id, u.id, await niveaux(u, client_id))
    const article = await updateArticle(db, client_id, id, patch)
    await logServeur(db, {
      user, clientId: client_id, action: 'MODIFICATION', entite: 'articles',
      entiteId: article.id, entiteNom: article.nom, details: patch, request,
    })
    return Response.json({ article })
  },
})

export const DELETE = apiHandler({
  schema: deleteArticleSchema,
  guard: 'permission',
  permission: { fonctionnalite: 'requisitions', niveau: 'modification' },
  clientIdFrom: 'body.client_id',
  handler: async ({ data, user, db, request }) => {
    const u = user as Utilisateur
    const existant = await chargerArticle(db, data.client_id, data.id)
    await verifierCatalogue(db, data.client_id, existant.service_id, u.id, await niveaux(u, data.client_id))
    await deleteArticle(db, data.client_id, data.id)
    await logServeur(db, {
      user, clientId: data.client_id, action: 'SUPPRESSION', entite: 'articles',
      entiteId: existant.id, entiteNom: existant.nom, request,
    })
    return Response.json({ ok: true })
  },
})
