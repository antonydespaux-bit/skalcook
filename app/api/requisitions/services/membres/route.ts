import { apiHandler } from '../../../../../lib/apiHandler'
import { logServeur } from '../../../../../lib/serverLog'
import { setMembresSchema } from '../../../../../lib/validators/requisitions.schema'
import { setMembres } from '../../../../../lib/services/requisitions.service'

// PUT : remplace les membres d'un service (et leur statut de responsable).
// Seuls les utilisateurs ayant accès à l'établissement sont acceptés.
export const PUT = apiHandler({
  schema: setMembresSchema,
  guard: 'permission',
  permission: { fonctionnalite: 'administration', niveau: 'modification' },
  clientIdFrom: 'body.client_id',
  handler: async ({ data, user, db, request }) => {
    const { service, membres } = await setMembres(db, data.client_id, data.service_id, data.membres)
    await logServeur(db, {
      user, clientId: data.client_id, action: 'MODIFICATION', entite: 'service_membres',
      entiteId: service.id, entiteNom: service.nom, details: { membres }, request,
    })
    return Response.json({ ok: true, membres })
  },
})
