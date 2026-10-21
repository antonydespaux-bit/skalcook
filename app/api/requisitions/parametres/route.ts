import { apiHandler } from '../../../../lib/apiHandler'
import { logServeur } from '../../../../lib/serverLog'
import { parametresRequisitionsSchema } from '../../../../lib/validators/requisitions.schema'
import { setValidationRequisitions } from '../../../../lib/services/requisitions.service'

// PATCH : réglage de l'établissement — validation obligatoire des demandes
// par le responsable du service demandeur avant préparation.
export const PATCH = apiHandler({
  schema: parametresRequisitionsSchema,
  guard: 'permission',
  permission: { fonctionnalite: 'administration', niveau: 'modification' },
  clientIdFrom: 'body.client_id',
  handler: async ({ data, user, db, request }) => {
    await setValidationRequisitions(db, data.client_id, data.validation)
    await logServeur(db, {
      user, clientId: data.client_id, action: 'MODIFICATION', entite: 'clients',
      entiteNom: 'requisitions_validation', details: { validation: data.validation }, request,
    })
    return Response.json({ ok: true })
  },
})
