import { apiHandler } from '../../../../lib/apiHandler'
import { logServeur } from '../../../../lib/serverLog'
import { validerInventaireSchema } from '../../../../lib/validators/inventaire.schema'
import { validerInventaire } from '../../../../lib/services/inventaire.service'

export const POST = apiHandler({
  schema: validerInventaireSchema,
  guard: 'memberOfClient',
  clientIdFrom: 'body.clientId',
  handler: async ({ data, user, db, request }) => {
    const result = await validerInventaire(db, data.inventaireId, data.clientId, user!.id)
    await logServeur(db, { user, clientId: data.clientId, action: 'VALIDATION', entite: 'inventaires', entiteId: data.inventaireId, request })
    return Response.json(result)
  },
})
