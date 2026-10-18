import { apiHandler } from '../../../../lib/apiHandler'
import { createIngredientSchema } from '../../../../lib/validators/achats.schema'
import { createIngredient } from '../../../../lib/services/achats.service'

export const POST = apiHandler({
  schema: createIngredientSchema,
  guard: 'permission',
  permission: { fonctionnalite: 'achats', niveau: 'modification' },
  clientIdFrom: 'body.clientId',
  handler: async ({ data, db }) => {
    const ingredient = await createIngredient(db, data)
    return Response.json({ ingredient })
  },
})
