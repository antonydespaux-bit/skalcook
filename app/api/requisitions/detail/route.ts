import { apiHandler } from '../../../../lib/apiHandler'
import { niveauxRequisitions } from '../../../../lib/requisitions/droits'
import { requisitionIdSchema } from '../../../../lib/validators/requisitions.schema'
import { detailRequisition } from '../../../../lib/services/requisitionsDemandes.service'

// GET : en-tête et lignes d'une réquisition visible par l'utilisateur.
export const GET = apiHandler({
  schema: requisitionIdSchema,
  guard: 'permission',
  permission: { fonctionnalite: 'requisitions', niveau: 'lecture' },
  clientIdFrom: 'body.client_id',
  handler: async ({ data, user, db }) => {
    const u = user as { id: string; email?: string }
    const n = await niveauxRequisitions(u, data.client_id)
    return Response.json(await detailRequisition(db, data.client_id, u.id, n, data.id))
  },
})
