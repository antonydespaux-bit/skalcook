/**
 * Admin d'un client peut changer le rôle d'un utilisateur *au sein de son
 * établissement*. Écrit dans `acces_clients` via service role (RLS bloque
 * les writes depuis le client anonyme).
 */

import { apiHandler } from '../../../../lib/apiHandler'
import { z } from 'zod'

const schema = z.object({
  client_id: z.string().uuid(),
  user_id:   z.string().uuid(),
  role:      z.enum(['admin', 'cuisine', 'bar', 'directeur', 'consultant']),
})

export const POST = apiHandler({
  schema,
  guard: 'adminOrSuperadmin',
  clientIdFrom: 'body.client_id',
  handler: async ({ data, db }) => {
    const { error } = await db
      .from('acces_clients')
      .update({ role: data.role })
      .eq('user_id', data.user_id)
      .eq('client_id', data.client_id)

    if (error) throw new Error(error.message)
    return Response.json({ ok: true })
  },
})
