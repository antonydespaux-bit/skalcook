import { apiHandler } from '../../../../lib/apiHandler'
import { listRapportsSchema } from '../../../../lib/validators/foodCost.schema'
import { listRapports } from '../../../../lib/services/foodCost.service'

// GET   : liste des rapports food cost sauvegardés du client
export const GET = apiHandler({
  schema: listRapportsSchema,
  guard: 'memberOfClient',
  clientIdFrom: 'body.clientId',
  handler: async ({ data, db }) => {
    const result = await listRapports(db, data)
    return Response.json(result)
  },
})
