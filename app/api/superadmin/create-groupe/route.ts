import { apiHandler } from '../../../../lib/apiHandler'
import { createGroupeSchema } from '../../../../lib/validators/admin.schema'
import { createGroupe } from '../../../../lib/services/admin.service'

export const POST = apiHandler({
  schema: createGroupeSchema,
  guard: 'superadmin',
  handler: async ({ data, db }) => {
    const result = await createGroupe(db, data)
    return Response.json(result)
  },
})
