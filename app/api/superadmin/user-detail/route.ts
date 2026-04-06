import { apiHandler } from '../../../../lib/apiHandler'
import { z } from 'zod'
import { getUserDetail } from '../../../../lib/services/admin.service'

const querySchema = z.object({
  user_id: z.string().uuid(),
})

export const GET = apiHandler({
  schema: querySchema,
  guard: 'superadmin',
  handler: async ({ data, db }) => {
    const result = await getUserDetail(db, data.user_id)
    return Response.json(result)
  },
})
