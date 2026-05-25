import { apiHandler } from '../../../../lib/apiHandler'
import { mercurialeQuerySchema } from '../../../../lib/validators/achats.schema'
import { getMercuriale } from '../../../../lib/services/achats.service'

export const GET = apiHandler({
  schema: mercurialeQuerySchema,
  guard: 'memberOfClient',
  clientIdFrom: 'body.client_id',
  handler: async ({ data, db }) => {
    const result = await getMercuriale(db, data.client_id, data.date_debut, data.date_fin)
    return Response.json(result)
  },
})
