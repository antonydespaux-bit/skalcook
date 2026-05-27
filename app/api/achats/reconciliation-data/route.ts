import { apiHandler } from '../../../../lib/apiHandler'
import { reconciliationQuerySchema } from '../../../../lib/validators/achats.schema'
import { getReconciliationData } from '../../../../lib/services/achats.service'

export const GET = apiHandler({
  schema: reconciliationQuerySchema,
  guard: 'memberOfClient',
  clientIdFrom: 'body.client_id',
  handler: async ({ data, db }) => {
    const result = await getReconciliationData(db, data.client_id, data.section)
    return Response.json(result)
  },
})
