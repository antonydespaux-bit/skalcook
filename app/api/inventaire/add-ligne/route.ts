import { apiHandler } from '../../../../lib/apiHandler'
import { addLigneSchema } from '../../../../lib/validators/inventaire.schema'
import { addLigne } from '../../../../lib/services/inventaire.service'

export const POST = apiHandler({
  schema: addLigneSchema,
  guard: 'memberOfClient',
  clientIdFrom: 'body.clientId',
  handler: async ({ data, db }) => {
    const result = await addLigne(
      db,
      data.inventaireId,
      data.clientId,
      data.ingredientId,
      data.section
    )
    return Response.json(result)
  },
})
