import { apiHandler } from '../../../../lib/apiHandler'
import { updateClientSchema } from '../../../../lib/validators/admin.schema'
import { updateClient } from '../../../../lib/services/admin.service'

export const POST = apiHandler({
  schema: updateClientSchema,
  guard: 'adminOrSuperadmin',
  // Le client édité EST identifié par `id` (updateClient fait `.eq('id', id)`).
  // On lie donc l'autorisation admin à ce même `id` : un admin de A ne peut
  // pas éditer les infos légales de B en passant id=B. (Avant : 'body.clientId'
  // — champ inexistant dans le schéma → guard résolvait undefined → 400.)
  clientIdFrom: 'body.id',
  handler: async ({ data, db }) => {
    const result = await updateClient(db, data)
    return Response.json(result)
  },
})
