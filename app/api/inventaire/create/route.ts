import { apiHandler } from '../../../../lib/apiHandler'
import { logServeur } from '../../../../lib/serverLog'
import { createInventaireSchema } from '../../../../lib/validators/inventaire.schema'
import { createInventaire } from '../../../../lib/services/inventaire.service'

export const POST = apiHandler({
  schema: createInventaireSchema,
  guard: 'memberOfClient',
  clientIdFrom: 'body.client_id',
  handler: async ({ data, user, db, request }) => {
    const result = await createInventaire(db, data.client_id, data.type, data.section, data.categorie_ids, data.date_inventaire)
    await logServeur(db, {
      user, clientId: data.client_id, action: 'CREATION', entite: 'inventaires', section: data.section, request,
      entiteId: (result as { id?: string })?.id ?? null, details: { type: data.type, date: data.date_inventaire ?? null },
    })
    return Response.json(result)
  },
})
