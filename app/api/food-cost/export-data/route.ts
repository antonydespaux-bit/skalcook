import { apiHandler } from '../../../../lib/apiHandler'
import { previewPeriodeSchema } from '../../../../lib/validators/foodCost.schema'
import { getExportData } from '../../../../lib/services/foodCost.service'

// GET   : data brute pour export Excel / impression PDF du rapport food cost.
//         Renvoie la liste détaillée des factures (date, fournisseur, n°, HT),
//         les ajustements, et les totaux CA HT + achats HT pour la période.
export const GET = apiHandler({
  schema: previewPeriodeSchema,
  guard: 'memberOfClient',
  clientIdFrom: 'body.clientId',
  handler: async ({ data, db }) => {
    const result = await getExportData(db, data)
    return Response.json(result)
  },
})
