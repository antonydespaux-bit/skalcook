import { apiHandler } from '../../../../lib/apiHandler'
import { stockTheoriqueQuerySchema } from '../../../../lib/validators/inventaire.schema'
import { calculateStockTheorique } from '../../../../lib/services/inventaire.service'

export const GET = apiHandler({
  schema: stockTheoriqueQuerySchema,
  guard: 'memberOfClient',
  clientIdFrom: 'body.client_id',
  handler: async ({ data, db }) => {
    const result = await calculateStockTheorique(db, data.client_id, data.section)
    return Response.json({ data: result })
  },
})
