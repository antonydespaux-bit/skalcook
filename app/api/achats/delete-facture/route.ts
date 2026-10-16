import { apiHandler } from '../../../../lib/apiHandler'
import { logServeur } from '../../../../lib/serverLog'
import { deleteFactureSchema } from '../../../../lib/validators/achats.schema'
import { deleteFacture } from '../../../../lib/services/achats.service'

export const DELETE = apiHandler({
  schema: deleteFactureSchema,
  guard: 'adminOrSuperadmin',
  clientIdFrom: 'body.clientId',
  handler: async ({ data, user, db, request }) => {
    const result = await deleteFacture(db, data.factureId, data.clientId, user?.id)
    await logServeur(db, { user, clientId: data.clientId, action: 'SUPPRESSION', entite: 'achats_factures', entiteId: data.factureId, request })
    return Response.json(result)
  },
})
