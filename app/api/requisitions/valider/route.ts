import { apiHandler } from '../../../../lib/apiHandler'
import { logServeur } from '../../../../lib/serverLog'
import { niveauxRequisitions } from '../../../../lib/requisitions/droits'
import { requisitionIdSchema } from '../../../../lib/validators/requisitions.schema'
import { validerRequisition } from '../../../../lib/services/requisitionsDemandes.service'
import { notifierRequisition } from '../../../../lib/services/requisitionsNotifications.service'

// POST : validation d'une demande en attente par le responsable du service
// demandeur (ou l'administration) — elle part en préparation.
export const POST = apiHandler({
  schema: requisitionIdSchema,
  guard: 'permission',
  permission: { fonctionnalite: 'requisitions', niveau: 'modification' },
  clientIdFrom: 'body.client_id',
  handler: async ({ data, user, db, request }) => {
    const u = user as { id: string; email?: string }
    const n = await niveauxRequisitions(u, data.client_id)
    const r = await validerRequisition(db, data.client_id, u.id, n, data.id)
    await logServeur(db, {
      user, clientId: data.client_id, action: 'VALIDATION', entite: 'requisitions',
      entiteId: r.id, entiteNom: `R-${r.numero}`, details: { statut: 'a_preparer' }, request,
    })
    await notifierRequisition(db, { clientId: data.client_id, requisitionId: r.id, acteurId: u.id, evenement: 'validee' })
    return Response.json({ ok: true })
  },
})
