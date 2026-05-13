import { apiHandler } from '../../../../lib/apiHandler'
import { bulkImportHeadersSchema } from '../../../../lib/validators/achats.schema'
import { bulkImportHeaders } from '../../../../lib/services/achats.service'

export const POST = apiHandler({
  schema: bulkImportHeadersSchema,
  guard: 'adminOrSuperadmin',
  clientIdFrom: 'body.clientId',
  handler: async ({ data, user, db }) => {
    const result = await bulkImportHeaders(db, data, user!.id)
    return Response.json(result)
  },
})
