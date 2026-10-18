import { apiHandler } from '../../../../lib/apiHandler'
import { listUsersQuerySchema } from '../../../../lib/validators/admin.schema'
import { listClientUsers } from '../../../../lib/services/admin.service'

export const GET = apiHandler({
  schema: listUsersQuerySchema,
  guard: 'permission',
  permission: { fonctionnalite: 'administration', niveau: 'lecture' },
  clientIdFrom: 'body.client_id',
  handler: async ({ data, db }) => {
    const users = await listClientUsers(db, data.client_id)
    return Response.json({ users })
  },
})
