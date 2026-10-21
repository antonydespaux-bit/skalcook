import { apiHandler } from '../../../../lib/apiHandler'
import { logServeur } from '../../../../lib/serverLog'
import { niveauxRequisitions } from '../../../../lib/requisitions/droits'
import { requisitionIdSchema } from '../../../../lib/validators/requisitions.schema'
import { annulerRequisition } from '../../../../lib/services/requisitionsDemandes.service'

// POST : annulation par le service demandeur, tant que la préparation n'a
// pas commencé.
export const POST = apiHandler({
  schema: requisitionIdSchema,
  guard: 'permission',
  permission: { fonctionnalite: 'requisitions', niveau: 'modification' },
  clientIdFrom: 'body.client_id',
  handler: async ({ data, user, db, request }) => {
    const u = user as { id: string; email?: string }
    const n = await niveauxRequisitions(u, data.client_id)
    const r = await annulerRequisition(db, data.client_id, u.id, n, data.id)
    await logServeur(db, {
      user, clientId: data.client_id, action: 'MODIFICATION', entite: 'requisitions',
      entiteId: r.id, entiteNom: `R-${r.numero}`, details: { statut: 'annulee' }, request,
    })
    return Response.json({ ok: true })
  },
})
