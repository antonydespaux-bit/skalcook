import { apiHandler } from '../../../../lib/apiHandler'
import { groupeSyntheseSchema } from '../../../../lib/validators/groupe.schema'
import { getSyntheseGroupe } from '../../../../lib/services/groupe.service'

// Indicateurs par établissement du groupe. L'isolation est faite dans le
// service : seuls les établissements accessibles à l'utilisateur (acces_clients)
// et ayant le module « groupe » sont agrégés.
export const GET = apiHandler({
  schema: groupeSyntheseSchema,
  guard: 'authenticated',
  handler: async ({ data, user, db }) => {
    const result = await getSyntheseGroupe(db, user!, data)
    return Response.json(result)
  },
})
