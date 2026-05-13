import { apiHandler } from '../../../../lib/apiHandler'
import {
  createAjustementSchema,
  patchAjustementSchema,
  deleteAjustementSchema,
} from '../../../../lib/validators/foodCost.schema'
import {
  createAjustement,
  patchAjustement,
  deleteAjustement,
} from '../../../../lib/services/foodCost.service'

// POST  : crée une ligne d'ajustement rattachée à un rapport
export const POST = apiHandler({
  schema: createAjustementSchema,
  guard: 'memberOfClient',
  clientIdFrom: 'body.clientId',
  handler: async ({ data, user, db }) => {
    const result = await createAjustement(db, data, user!.id)
    return Response.json(result)
  },
})

// PATCH : met à jour libellé / montant / commentaire
export const PATCH = apiHandler({
  schema: patchAjustementSchema,
  guard: 'memberOfClient',
  clientIdFrom: 'body.clientId',
  handler: async ({ data, db }) => {
    const result = await patchAjustement(db, data)
    return Response.json(result)
  },
})

// DELETE : suppression définitive d'une ligne d'ajustement
export const DELETE = apiHandler({
  schema: deleteAjustementSchema,
  guard: 'memberOfClient',
  clientIdFrom: 'body.clientId',
  handler: async ({ data, db }) => {
    const result = await deleteAjustement(db, data)
    return Response.json(result)
  },
})
