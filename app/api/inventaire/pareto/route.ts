import { apiHandler } from '../../../../lib/apiHandler'
import { paretoQuerySchema } from '../../../../lib/validators/inventaire.schema'
import { computePareto } from '../../../../lib/services/inventaire.service'

export const GET = apiHandler({
  schema: paretoQuerySchema,
  guard: 'memberOfClient',
  clientIdFrom: 'body.client_id',
  handler: async ({ data, db }) => {
    const result = await computePareto(db, data.client_id, data.section)
    return Response.json(result)
  },
})
