import { apiHandler } from '../../../../lib/apiHandler'
import { saveLigneSchema } from '../../../../lib/validators/inventaire.schema'
import { saveLigne } from '../../../../lib/services/inventaire.service'

export const PATCH = apiHandler({
  schema: saveLigneSchema,
  guard: 'memberOfClient',
  clientIdFrom: 'body.clientId',
  handler: async ({ data, db }) => {
    const result = await saveLigne(db, data.ligneId, data.clientId, data.quantite_reelle)
    return Response.json(result)
  },
})
