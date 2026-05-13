import { apiHandler } from '../../../../lib/apiHandler'
import {
  upsertRapportSchema,
  getRapportSchema,
  patchRapportSchema,
  deleteRapportSchema,
} from '../../../../lib/validators/foodCost.schema'
import {
  upsertRapport,
  getRapport,
  patchRapport,
  deleteRapport,
} from '../../../../lib/services/foodCost.service'

// POST  : upsert d'un rapport pour une période (idempotent)
export const POST = apiHandler({
  schema: upsertRapportSchema,
  guard: 'memberOfClient',
  clientIdFrom: 'body.clientId',
  handler: async ({ data, user, db }) => {
    const result = await upsertRapport(db, data, user!.id)
    return Response.json(result)
  },
})

// GET   : récupère un rapport + ajustements + totaux calculés live
export const GET = apiHandler({
  schema: getRapportSchema,
  guard: 'memberOfClient',
  clientIdFrom: 'body.clientId',
  handler: async ({ data, db }) => {
    const result = await getRapport(db, data)
    if (!result) return Response.json({ error: 'Rapport introuvable' }, { status: 404 })
    return Response.json(result)
  },
})

// PATCH : maj inventaires + notes
export const PATCH = apiHandler({
  schema: patchRapportSchema,
  guard: 'memberOfClient',
  clientIdFrom: 'body.clientId',
  handler: async ({ data, db }) => {
    const result = await patchRapport(db, data)
    return Response.json(result)
  },
})

// DELETE : soft-delete du rapport
export const DELETE = apiHandler({
  schema: deleteRapportSchema,
  guard: 'adminOrSuperadmin',
  clientIdFrom: 'body.clientId',
  handler: async ({ data, db }) => {
    const result = await deleteRapport(db, data)
    return Response.json(result)
  },
})
