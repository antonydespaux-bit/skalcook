import { apiHandler } from '../../../../lib/apiHandler'
import { groupeSyntheseSchema } from '../../../../lib/validators/groupe.schema'
import { getPrixGroupe } from '../../../../lib/services/groupe.service'

// Comparaison des prix d'achat d'un même produit entre les établissements du
// groupe. Même isolation que /api/groupe/synthese (établissements accessibles,
// module « groupe », rôle admin ou directeur).
export const GET = apiHandler({
  schema: groupeSyntheseSchema,
  guard: 'authenticated',
  handler: async ({ data, user, db }) => {
    const result = await getPrixGroupe(db, user!, data)
    return Response.json(result)
  },
})
