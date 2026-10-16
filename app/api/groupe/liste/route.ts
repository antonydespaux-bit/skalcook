import { apiHandler } from '../../../../lib/apiHandler'
import { listGroupesAccessibles } from '../../../../lib/services/groupe.service'

// Groupes dont l'utilisateur voit au moins un établissement avec la vue groupe.
export const GET = apiHandler({
  guard: 'authenticated',
  handler: async ({ user, db }) => {
    const result = await listGroupesAccessibles(db, user!)
    return Response.json(result)
  },
})
