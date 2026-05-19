import { apiHandler } from '../../../../lib/apiHandler'
import { importInventaireSchema } from '../../../../lib/validators/inventaire.schema'
import { importInventaire } from '../../../../lib/services/inventaire.service'

export const POST = apiHandler({
  schema: importInventaireSchema,
  guard: 'memberOfClient',
  clientIdFrom: 'body.client_id',
  handler: async ({ data, db }) => {
    const result = await importInventaire(
      db,
      data.client_id,
      data.section,
      data.date_inventaire,
      data.lignes
    )
    return Response.json(result)
  },
})
