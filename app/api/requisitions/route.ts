import { apiHandler } from '../../../lib/apiHandler'
import { logServeur } from '../../../lib/serverLog'
import { niveauxRequisitions } from '../../../lib/requisitions/droits'
import { createRequisitionSchema, listRequisitionsQuerySchema } from '../../../lib/validators/requisitions.schema'
import { creerDemande, listerRequisitions } from '../../../lib/services/requisitionsDemandes.service'
import { notifierRequisition } from '../../../lib/services/requisitionsNotifications.service'

// GET  : liste des réquisitions (vue « mes_demandes » ou « toutes »).
// POST : nouvelle demande, envoyée au service préparateur (ou au responsable
//        du service demandeur si la validation est activée).
type Utilisateur = { id: string; email?: string }

export const GET = apiHandler({
  schema: listRequisitionsQuerySchema,
  guard: 'permission',
  permission: { fonctionnalite: 'requisitions', niveau: 'lecture' },
  clientIdFrom: 'body.client_id',
  handler: async ({ data, user, db }) => {
    const u = user as Utilisateur
    const n = await niveauxRequisitions(u, data.client_id)
    return Response.json(await listerRequisitions(db, data.client_id, u.id, n, data.vue))
  },
})

export const POST = apiHandler({
  schema: createRequisitionSchema,
  guard: 'permission',
  permission: { fonctionnalite: 'requisitions', niveau: 'modification' },
  clientIdFrom: 'body.client_id',
  handler: async ({ data, user, db, request }) => {
    const u = user as Utilisateur
    const { client_id, ...demande } = data
    const n = await niveauxRequisitions(u, client_id)
    const cree = await creerDemande(db, client_id, u.id, n, demande)
    await logServeur(db, {
      user, clientId: client_id, action: 'CREATION', entite: 'requisitions',
      entiteId: cree.id, entiteNom: `R-${cree.numero}`,
      details: { de: cree.demandeur.nom, vers: cree.preparateur.nom, lignes: demande.lignes.length, statut: cree.statut },
      request,
    })
    await notifierRequisition(db, {
      clientId: client_id, requisitionId: cree.id, acteurId: u.id,
      evenement: cree.statut === 'a_valider' ? 'a_valider' : 'a_preparer',
    })
    return Response.json({ id: cree.id, numero: cree.numero, statut: cree.statut })
  },
})
