import { apiHandler } from '../../../../lib/apiHandler'
import { mercurialeQuerySchema } from '../../../../lib/validators/achats.schema'
import { getAchatsParProduit } from '../../../../lib/services/achats.service'

// Volumes achetés par produit sur une période (mêmes paramètres que la
// mercuriale : client_id, date_debut, date_fin, section).
export const GET = apiHandler({
  schema: mercurialeQuerySchema,
  guard: 'memberOfClient',
  clientIdFrom: 'body.client_id',
  handler: async ({ data, db }) => {
    const result = await getAchatsParProduit(db, data.client_id, data.date_debut, data.date_fin, data.section)
    return Response.json(result)
  },
})
