import { apiHandler } from '../../../lib/apiHandler'
import { inviteAdminSchema } from '../../../lib/validators/admin.schema'
import { inviteAdmin } from '../../../lib/services/admin.service'

export const POST = apiHandler({
  schema: inviteAdminSchema,
  guard: 'adminOrSuperadmin',
  clientIdFrom: 'body.client_id',
  handler: async ({ data, db, request }) => {
    // Pour le redirectTo : priorité NEXT_PUBLIC_SITE_URL (config explicite),
    // sinon on utilise l'origin de la requête entrante (couvre preview + prod
    // sans avoir à tenir l'env var à jour partout).
    const envOrigin = (process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '')
    const reqOrigin = new URL(request.url).origin
    const siteOrigin = envOrigin || reqOrigin

    const result = await inviteAdmin(db, data.email, data.nom_complet, data.client_id, siteOrigin)
    return Response.json(result, { status: 201 })
  },
})
