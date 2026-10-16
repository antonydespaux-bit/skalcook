import { apiHandler } from '../../../../lib/apiHandler'
import { logServeur } from '../../../../lib/serverLog'
import { createGroupeSchema } from '../../../../lib/validators/admin.schema'
import { createGroupe } from '../../../../lib/services/admin.service'

export const POST = apiHandler({
  schema: createGroupeSchema,
  guard: 'superadmin',
  handler: async ({ data, user, db, request }) => {
    const result = await createGroupe(db, data)
    await logServeur(db, {
      user, clientId: null, sansEtablissement: true, action: 'CREATION', entite: 'groupes', request,
      entiteId: result.groupe?.id ?? null, entiteNom: data.nom,
    })
    return Response.json(result)
  },
})
