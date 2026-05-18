import { apiHandler } from '../../../../lib/apiHandler'
import { fusionnerBlsSchema } from '../../../../lib/validators/achats.schema'
import { fusionnerBls } from '../../../../lib/services/achats.service'

export const POST = apiHandler({
  schema: fusionnerBlsSchema,
  guard: 'adminOrSuperadmin',
  clientIdFrom: 'body.clientId',
  handler: async ({ data, user, db }) => {
    const result = await fusionnerBls(db, data, user!.id)
    return Response.json(result)
  },
})
