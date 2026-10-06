import { apiHandler } from '../../../lib/apiHandler'
import { inviteAdminSchema } from '../../../lib/validators/admin.schema'
import { inviteAdmin } from '../../../lib/services/admin.service'

export const POST = apiHandler({
  schema: inviteAdminSchema,
  guard: 'adminOrSuperadmin',
  clientIdFrom: 'body.client_id',
  handler: async ({ data, db, request }) => {
    // Lien d'invitation : NEXT_PUBLIC_SITE_URL en priorité (résolu dans le
    // service), sinon l'origin de la requête (couvre preview + prod).
    const result = await inviteAdmin(db, data.email, data.nom_complet, data.client_id, new URL(request.url).origin)
    return Response.json(result, { status: 201 })
  },
})
