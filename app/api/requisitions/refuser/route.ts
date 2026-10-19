import { apiHandler } from '../../../../lib/apiHandler'
import { logServeur } from '../../../../lib/serverLog'
import { niveauxRequisitions } from '../../../../lib/requisitions/droits'
import { refusRequisitionSchema } from '../../../../lib/validators/requisitions.schema'
import { refuserRequisition } from '../../../../lib/services/requisitionsDemandes.service'

// POST : refus motivé d'une demande en attente de validation.
export const POST = apiHandler({
  schema: refusRequisitionSchema,
  guard: 'permission',
  permission: { fonctionnalite: 'requisitions', niveau: 'modification' },
  clientIdFrom: 'body.client_id',
  handler: async ({ data, user, db, request }) => {
    const u = user as { id: string; email?: string }
    const n = await niveauxRequisitions(u, data.client_id)
    const r = await refuserRequisition(db, data.client_id, u.id, n, data.id, data.motif)
    await logServeur(db, {
      user, clientId: data.client_id, action: 'MODIFICATION', entite: 'requisitions',
      entiteId: r.id, entiteNom: `R-${r.numero}`, details: { statut: 'refusee', motif: data.motif }, request,
    })
    return Response.json({ ok: true })
  },
})
