import { apiHandler } from '../../../../lib/apiHandler'
import { listRapportsSchema } from '../../../../lib/validators/foodCost.schema'
import { listAllAjustements } from '../../../../lib/services/foodCost.service'

// GET   : liste de tous les ajustements food cost du client (ordre chrono
//         décroissant, limit 1000). Utilisé par l'accordéon "Tous les
//         ajustements" sur la page food cost.
export const GET = apiHandler({
  schema: listRapportsSchema,
  guard: 'memberOfClient',
  clientIdFrom: 'body.clientId',
  handler: async ({ data, db }) => {
    const result = await listAllAjustements(db, data)
    return Response.json(result)
  },
})
