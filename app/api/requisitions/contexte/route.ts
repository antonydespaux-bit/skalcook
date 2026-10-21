import { apiHandler } from '../../../../lib/apiHandler'
import { niveauxRequisitions } from '../../../../lib/requisitions/droits'
import { contexteQuerySchema } from '../../../../lib/validators/requisitions.schema'
import { contexteUtilisateur } from '../../../../lib/services/requisitionsDemandes.service'

// GET : services de l'utilisateur, demandeurs et destinataires possibles,
// réglage de validation — de quoi construire l'écran de demande.
export const GET = apiHandler({
  schema: contexteQuerySchema,
  guard: 'permission',
  permission: { fonctionnalite: 'requisitions', niveau: 'lecture' },
  clientIdFrom: 'body.client_id',
  handler: async ({ data, user, db }) => {
    const u = user as { id: string; email?: string }
    const n = await niveauxRequisitions(u, data.client_id)
    return Response.json(await contexteUtilisateur(db, data.client_id, u.id, n))
  },
})
