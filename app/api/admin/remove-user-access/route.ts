/**
 * Admin d'un client peut retirer l'accès d'un utilisateur à *son*
 * établissement. Supprime la ligne `acces_clients` correspondante.
 * L'utilisateur (auth.users + profils) reste intact — il perd juste
 * l'accès à ce client.
 */

import { apiHandler } from '../../../../lib/apiHandler'
import { z } from 'zod'

const schema = z.object({
  client_id: z.string().uuid(),
  user_id:   z.string().uuid(),
})

export const POST = apiHandler({
  schema,
  guard: 'adminOrSuperadmin',
  clientIdFrom: 'body.client_id',
  handler: async ({ data, db }) => {
    const { error } = await db
      .from('acces_clients')
      .delete()
      .eq('user_id', data.user_id)
      .eq('client_id', data.client_id)

    if (error) throw new Error(error.message)
    return Response.json({ ok: true })
  },
})
