import { apiHandler } from '../../../../../lib/apiHandler'
import { reordonnerServicesSchema } from '../../../../../lib/validators/requisitions.schema'
import { reordonnerServices } from '../../../../../lib/services/requisitions.service'

// PUT : nouvel ordre d'affichage des services (liste complète des ids).
export const PUT = apiHandler({
  schema: reordonnerServicesSchema,
  guard: 'permission',
  permission: { fonctionnalite: 'administration', niveau: 'modification' },
  clientIdFrom: 'body.client_id',
  handler: async ({ data, db }) => {
    await reordonnerServices(db, data.client_id, data.ids)
    return Response.json({ ok: true })
  },
})
