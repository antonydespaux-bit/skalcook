import { apiHandler } from '../../../../lib/apiHandler'
import { createClientSchema } from '../../../../lib/validators/admin.schema'
import { createClient } from '../../../../lib/services/admin.service'

export const POST = apiHandler({
  schema: createClientSchema,
  guard: 'superadmin',
  handler: async ({ data, db }) => {
    const result = await createClient(db, data)
    return Response.json(result)
  },
})
