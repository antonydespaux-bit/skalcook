import { apiHandler } from '../../../../lib/apiHandler'
import { createInventaireSchema } from '../../../../lib/validators/inventaire.schema'
import { createInventaire } from '../../../../lib/services/inventaire.service'

export const POST = apiHandler({
  schema: createInventaireSchema,
  guard: 'memberOfClient',
  clientIdFrom: 'body.client_id',
  handler: async ({ data, db }) => {
    const result = await createInventaire(db, data.client_id, data.type, data.section, data.categorie_ids)
    return Response.json(result)
  },
})
