import { apiHandler } from '../../../../lib/apiHandler'
import { analysesQuerySchema } from '../../../../lib/validators/requisitions.schema'
import { analysesRequisitions } from '../../../../lib/services/requisitionsAnalyses.service'

// GET : consommation par service, par préparateur et par produit (bons livrés
// sur la période). Réservé à « Analyses des réquisitions ».
export const GET = apiHandler({
  schema: analysesQuerySchema,
  guard: 'permission',
  permission: { fonctionnalite: 'requisitions_analyses', niveau: 'lecture' },
  clientIdFrom: 'body.client_id',
  handler: async ({ data, db }) => {
    return Response.json(await analysesRequisitions(db, data.client_id, data.debut, data.fin, data.service_id))
  },
})
