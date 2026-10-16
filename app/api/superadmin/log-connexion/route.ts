import { apiHandler } from '../../../../lib/apiHandler'
import { logServeur } from '../../../../lib/serverLog'

// Connexion du superadmin à l'écran superadmin (hors établissement), une fois
// par jour côté navigateur. Visible dans Superadmin › Activité.
export const POST = apiHandler({
  guard: 'superadmin',
  handler: async ({ user, db, request }) => {
    await logServeur(db, {
      user, clientId: null, sansEtablissement: true, action: 'CONNEXION', entite: 'session', entiteNom: 'Superadmin', request,
    })
    return Response.json({ ok: true })
  },
})
