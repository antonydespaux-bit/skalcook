import { apiHandler } from '../../../../lib/apiHandler'
import { logServeur } from '../../../../lib/serverLog'
import { importInventaireSchema } from '../../../../lib/validators/inventaire.schema'
import { importInventaire } from '../../../../lib/services/inventaire.service'

export const POST = apiHandler({
  schema: importInventaireSchema,
  guard: 'memberOfClient',
  clientIdFrom: 'body.client_id',
  handler: async ({ data, user, db, request }) => {
    const result = await importInventaire(
      db,
      data.client_id,
      data.section,
      data.date_inventaire,
      data.lignes
    )
    await logServeur(db, {
      user, clientId: data.client_id, action: 'IMPORT', entite: 'inventaires', section: data.section, request,
      details: { lignes: data.lignes.length, date: data.date_inventaire ?? null },
    })
    return Response.json(result)
  },
})
