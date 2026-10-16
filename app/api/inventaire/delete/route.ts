import { apiHandler } from '../../../../lib/apiHandler'
import { logServeur } from '../../../../lib/serverLog'
import { deleteInventaireSchema } from '../../../../lib/validators/inventaire.schema'
import { deleteInventaire } from '../../../../lib/services/inventaire.service'

export const DELETE = apiHandler({
  schema: deleteInventaireSchema,
  guard: 'adminOrSuperadmin',
  clientIdFrom: 'body.clientId',
  handler: async ({ data, user, db, request }) => {
    const result = await deleteInventaire(db, data.inventaireId, data.clientId)
    await logServeur(db, { user, clientId: data.clientId, action: 'SUPPRESSION', entite: 'inventaires', entiteId: data.inventaireId, request })
    return Response.json(result)
  },
})
