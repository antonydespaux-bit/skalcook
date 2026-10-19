import { apiHandler } from '../../../../lib/apiHandler'
import { niveauxRequisitions } from '../../../../lib/requisitions/droits'
import { requisitionIdSchema } from '../../../../lib/validators/requisitions.schema'
import { prendreEnCharge } from '../../../../lib/services/requisitionsPreparation.service'

// POST : le préparateur prend la commande en charge (« en préparation ») ;
// le demandeur ne peut plus l'annuler.
export const POST = apiHandler({
  schema: requisitionIdSchema,
  guard: 'permission',
  permission: { fonctionnalite: 'requisitions', niveau: 'modification' },
  clientIdFrom: 'body.client_id',
  handler: async ({ data, user, db }) => {
    const u = user as { id: string; email?: string }
    const n = await niveauxRequisitions(u, data.client_id)
    await prendreEnCharge(db, data.client_id, u.id, n, data.id)
    return Response.json({ ok: true })
  },
})
