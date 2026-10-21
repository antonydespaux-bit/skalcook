import { apiHandler } from '../../../../lib/apiHandler'
import { catalogueQuerySchema } from '../../../../lib/validators/requisitions.schema'
import { rechercherCatalogue } from '../../../../lib/services/requisitionsDemandes.service'

// GET : recherche dans le catalogue servi par un service préparateur
// (ingrédients cuisine/bar ou articles). Passe par l'API car un rôle
// « service » ne lit pas les ingrédients en accès direct.
export const GET = apiHandler({
  schema: catalogueQuerySchema,
  guard: 'permission',
  permission: { fonctionnalite: 'requisitions', niveau: 'lecture' },
  clientIdFrom: 'body.client_id',
  handler: async ({ data, db }) => {
    return Response.json(await rechercherCatalogue(db, data.client_id, data.service_id, data.q))
  },
})
