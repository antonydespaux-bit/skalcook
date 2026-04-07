import { apiHandler } from '../../../../lib/apiHandler'
import { validerInventaireSchema } from '../../../../lib/validators/inventaire.schema'
import { validerInventaire } from '../../../../lib/services/inventaire.service'

export const POST = apiHandler({
  schema: validerInventaireSchema,
  guard: 'memberOfClient',
  clientIdFrom: 'body.clientId',
  handler: async ({ data, user, db }) => {
    const result = await validerInventaire(db, data.inventaireId, data.clientId, user!.id)
    return Response.json(result)
  },
})
