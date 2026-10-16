import { apiHandler } from '../../../../lib/apiHandler'
import { logServeur } from '../../../../lib/serverLog'
import { updateFactureSchema } from '../../../../lib/validators/achats.schema'
import { updateFacture } from '../../../../lib/services/achats.service'

export const PATCH = apiHandler({
  schema: updateFactureSchema,
  guard: 'adminOrSuperadmin',
  clientIdFrom: 'body.clientId',
  handler: async ({ data, user, db, request }) => {
    const { factureId, clientId, ...updates } = data
    const result = await updateFacture(db, factureId, clientId, updates)
    await logServeur(db, {
      user, clientId, action: 'MODIFICATION', entite: 'achats_factures', entiteId: factureId, request,
      details: { champs: Object.keys(updates) },
    })
    return Response.json(result)
  },
})
