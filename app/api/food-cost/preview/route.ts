import { apiHandler } from '../../../../lib/apiHandler'
import { previewPeriodeSchema } from '../../../../lib/validators/foodCost.schema'
import { previewPeriode } from '../../../../lib/services/foodCost.service'

// GET   : aperçu live d'une période (ajustements datés + totaux), sans rapport
//         sauvegardé. Permet de visualiser un ratio avant de cliquer Sauvegarder.
export const GET = apiHandler({
  schema: previewPeriodeSchema,
  guard: 'memberOfClient',
  clientIdFrom: 'body.clientId',
  handler: async ({ data, db }) => {
    const result = await previewPeriode(db, data)
    return Response.json(result)
  },
})
