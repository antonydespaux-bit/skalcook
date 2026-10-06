import { apiHandler } from '../../../lib/apiHandler'
import { createUserSchema } from '../../../lib/validators/admin.schema'
import { createUser } from '../../../lib/services/admin.service'

export const POST = apiHandler({
  schema: createUserSchema,
  guard: 'adminOrSuperadmin',
  clientIdFrom: 'body.client_id',
  handler: async ({ data, db, request }) => {
    // Origin de la requête = fallback du lien d'invitation si
    // NEXT_PUBLIC_SITE_URL n'est pas défini (cf. app/api/invite-admin).
    const result = await createUser(db, data, new URL(request.url).origin)
    return Response.json(result, { status: 201 })
  },
})
