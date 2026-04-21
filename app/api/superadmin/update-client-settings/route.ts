import { apiHandler } from '../../../../lib/apiHandler'
import { updateClientSettingsSchema } from '../../../../lib/validators/admin.schema'
import { updateClientSettings } from '../../../../lib/services/admin.service'

export const POST = apiHandler({
  schema: updateClientSettingsSchema,
  guard: 'superadmin',
  handler: async ({ data, db }) => {
    const result = await updateClientSettings(db, data)
    return Response.json(result)
  },
})
