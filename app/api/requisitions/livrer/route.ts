import { apiHandler } from '../../../../lib/apiHandler'
import { logServeur } from '../../../../lib/serverLog'
import { niveauxRequisitions } from '../../../../lib/requisitions/droits'
import { livraisonSchema } from '../../../../lib/validators/requisitions.schema'
import { livrerRequisition } from '../../../../lib/services/requisitionsPreparation.service'
import { notifierRequisition } from '../../../../lib/services/requisitionsNotifications.service'

// POST : livraison par le service préparateur — quantités servies (0 si le
// stock manque), produits ajoutés « à la voix », prix HT figés.
export const POST = apiHandler({
  schema: livraisonSchema,
  guard: 'permission',
  permission: { fonctionnalite: 'requisitions', niveau: 'modification' },
  clientIdFrom: 'body.client_id',
  handler: async ({ data, user, db, request }) => {
    const u = user as { id: string; email?: string }
    const n = await niveauxRequisitions(u, data.client_id)
    const r = await livrerRequisition(db, data.client_id, u.id, n, data.id, { lignes: data.lignes, ajouts: data.ajouts })
    await logServeur(db, {
      user, clientId: data.client_id, action: 'VALIDATION', entite: 'requisitions',
      entiteId: r.id, entiteNom: `R-${r.numero}`,
      details: { statut: 'livree', lignes: r.lignes, ajouts: r.ajouts, valeur_ht: r.valeur }, request,
    })
    await notifierRequisition(db, { clientId: data.client_id, requisitionId: r.id, acteurId: u.id, evenement: 'livree' })
    return Response.json({ ok: true, valeur: r.valeur })
  },
})
