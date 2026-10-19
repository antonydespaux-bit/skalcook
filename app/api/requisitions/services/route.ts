import { apiHandler } from '../../../../lib/apiHandler'
import { logServeur } from '../../../../lib/serverLog'
import {
  listServicesQuerySchema,
  createServiceSchema,
  updateServiceSchema,
  deleteServiceSchema,
} from '../../../../lib/validators/requisitions.schema'
import {
  listServicesEtMembres,
  createService,
  updateService,
  deleteService,
} from '../../../../lib/services/requisitions.service'

// Paramètres › Services : services internes qui passent et préparent les
// réquisitions. Réservé à « Utilisateurs et paramètres » (administration).

// GET : services, membres, utilisateurs de l'établissement et réglage de validation
export const GET = apiHandler({
  schema: listServicesQuerySchema,
  guard: 'permission',
  permission: { fonctionnalite: 'administration', niveau: 'lecture' },
  clientIdFrom: 'body.client_id',
  handler: async ({ data, db }) => {
    return Response.json(await listServicesEtMembres(db, data.client_id))
  },
})

export const POST = apiHandler({
  schema: createServiceSchema,
  guard: 'permission',
  permission: { fonctionnalite: 'administration', niveau: 'modification' },
  clientIdFrom: 'body.client_id',
  handler: async ({ data, user, db, request }) => {
    const { client_id, ...champs } = data
    const service = await createService(db, client_id, champs)
    await logServeur(db, {
      user, clientId: client_id, action: 'CREATION', entite: 'services_internes',
      entiteId: service.id, entiteNom: service.nom, request,
    })
    return Response.json({ service })
  },
})

export const PATCH = apiHandler({
  schema: updateServiceSchema,
  guard: 'permission',
  permission: { fonctionnalite: 'administration', niveau: 'modification' },
  clientIdFrom: 'body.client_id',
  handler: async ({ data, user, db, request }) => {
    const { client_id, id, ...patch } = data
    const service = await updateService(db, client_id, id, patch)
    await logServeur(db, {
      user, clientId: client_id, action: 'MODIFICATION', entite: 'services_internes',
      entiteId: service.id, entiteNom: service.nom, details: patch, request,
    })
    return Response.json({ service })
  },
})

export const DELETE = apiHandler({
  schema: deleteServiceSchema,
  guard: 'permission',
  permission: { fonctionnalite: 'administration', niveau: 'modification' },
  clientIdFrom: 'body.client_id',
  handler: async ({ data, user, db, request }) => {
    const service = await deleteService(db, data.client_id, data.id)
    await logServeur(db, {
      user, clientId: data.client_id, action: 'SUPPRESSION', entite: 'services_internes',
      entiteId: service.id, entiteNom: service.nom, request,
    })
    return Response.json({ ok: true })
  },
})
