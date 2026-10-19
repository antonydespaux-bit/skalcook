import { z } from 'zod'
import { apiHandler } from '../../../../lib/apiHandler'
import { clientIdSchema, uuidSchema } from '../../../../lib/validators/achats.schema'
import { listerNotifications, marquerLues } from '../../../../lib/services/requisitionsNotifications.service'

// GET  : notifications de l'utilisateur dans l'établissement (pop-up et pastille).
// POST : marque comme lues (les ids donnés, ou toutes).
export const GET = apiHandler({
  schema: z.object({ client_id: clientIdSchema }),
  guard: 'permission',
  permission: { fonctionnalite: 'requisitions', niveau: 'lecture' },
  clientIdFrom: 'body.client_id',
  handler: async ({ data, user, db }) => {
    return Response.json(await listerNotifications(db, data.client_id, (user as { id: string }).id))
  },
})

export const POST = apiHandler({
  schema: z.object({ client_id: clientIdSchema, ids: z.array(uuidSchema).max(100).optional() }),
  guard: 'permission',
  permission: { fonctionnalite: 'requisitions', niveau: 'lecture' },
  clientIdFrom: 'body.client_id',
  handler: async ({ data, user, db }) => {
    await marquerLues(db, data.client_id, (user as { id: string }).id, data.ids)
    return Response.json({ ok: true })
  },
})
