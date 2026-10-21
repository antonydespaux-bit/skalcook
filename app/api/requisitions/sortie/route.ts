import { apiHandler } from '../../../../lib/apiHandler'
import { logServeur } from '../../../../lib/serverLog'
import { niveauxRequisitions } from '../../../../lib/requisitions/droits'
import { sortieDirecteSchema } from '../../../../lib/validators/requisitions.schema'
import { sortieDirecte } from '../../../../lib/services/requisitionsPreparation.service'

// POST : sortie de stock sans commande vers un service receveur (bon de type
// « sortie_directe », livré d'office, prix figés).
export const POST = apiHandler({
  schema: sortieDirecteSchema,
  guard: 'permission',
  permission: { fonctionnalite: 'requisitions', niveau: 'modification' },
  clientIdFrom: 'body.client_id',
  handler: async ({ data, user, db, request }) => {
    const u = user as { id: string; email?: string }
    const { client_id, ...sortie } = data
    const n = await niveauxRequisitions(u, client_id)
    const r = await sortieDirecte(db, client_id, u.id, n, sortie)
    await logServeur(db, {
      user, clientId: client_id, action: 'CREATION', entite: 'requisitions',
      entiteId: r.id, entiteNom: `R-${r.numero}`,
      details: { type: 'sortie_directe', de: r.preparateur.nom, vers: r.receveur.nom, lignes: sortie.lignes.length, valeur_ht: r.valeur },
      request,
    })
    return Response.json({ id: r.id, numero: r.numero })
  },
})
