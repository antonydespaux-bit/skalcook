import { apiHandler } from '../../../../lib/apiHandler'
import { checkDuplicateSchema } from '../../../../lib/validators/achats.schema'
import { checkDuplicateFacture } from '../../../../lib/services/achats.service'

export const GET = apiHandler({
  schema: checkDuplicateSchema,
  guard: 'permission',
  permission: { fonctionnalite: 'achats', niveau: 'modification' },
  clientIdFrom: 'body.clientId',
  handler: async ({ data, db }) => {
    const existing = await checkDuplicateFacture(db, data.clientId, data.numeroFacture)
    if (existing) {
      return Response.json({ duplicate: true, existing }, { status: 409 })
    }
    return Response.json({ duplicate: false })
  },
})
