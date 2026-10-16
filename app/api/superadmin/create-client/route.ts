import { apiHandler } from '../../../../lib/apiHandler'
import { logServeur } from '../../../../lib/serverLog'
import { createClientSchema } from '../../../../lib/validators/admin.schema'
import { createClient } from '../../../../lib/services/admin.service'

export const POST = apiHandler({
  schema: createClientSchema,
  guard: 'superadmin',
  handler: async ({ data, user, db, request }) => {
    const result = await createClient(db, data)
    const nouveau = (result as { client?: { id?: string } }).client
    if (nouveau?.id) {
      await logServeur(db, { user, clientId: nouveau.id, action: 'CREATION', entite: 'clients', entiteNom: data.nom_etablissement, request })
    }
    return Response.json(result)
  },
})
