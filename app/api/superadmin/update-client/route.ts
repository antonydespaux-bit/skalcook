import { apiHandler } from '../../../../lib/apiHandler'
import { updateClientSchema } from '../../../../lib/validators/admin.schema'
import { updateClient } from '../../../../lib/services/admin.service'
import { z } from 'zod'

// GET: retrieve client legal info
const getSchema = z.object({ id: z.string().uuid() })

export const GET = apiHandler({
  schema: getSchema,
  guard: 'superadmin',
  handler: async ({ data, db }) => {
    const { data: client, error } = await db
      .from('clients')
      .select('*')
      .eq('id', data.id)
      .maybeSingle()

    if (error) throw new Error(error.message)
    return Response.json({ client })
  },
})

// POST: update client legal info
export const POST = apiHandler({
  schema: updateClientSchema,
  guard: 'superadmin',
  handler: async ({ data, db }) => {
    const result = await updateClient(db, data)
    return Response.json(result)
  },
})
