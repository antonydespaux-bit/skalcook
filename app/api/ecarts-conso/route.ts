import { apiHandler } from '../../../lib/apiHandler'
import { ecartsConsoQuerySchema } from '../../../lib/validators/achats.schema'
import { getEcartsConsommation } from '../../../lib/services/ecartsConso.service'

// Rapport d'écarts de consommation (théorique vs réel) sur une période, cuisine.
export const GET = apiHandler({
  schema: ecartsConsoQuerySchema,
  guard: 'memberOfClient',
  clientIdFrom: 'body.client_id',
  handler: async ({ data, db }) => {
    const result = await getEcartsConsommation(db, data.client_id, data.date_debut, data.date_fin)
    return Response.json(result)
  },
})
