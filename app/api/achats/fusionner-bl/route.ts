import { apiHandler } from '../../../../lib/apiHandler'
import { logServeur } from '../../../../lib/serverLog'
import { fusionnerBlsSchema } from '../../../../lib/validators/achats.schema'
import { fusionnerBls } from '../../../../lib/services/achats.service'

export const POST = apiHandler({
  schema: fusionnerBlsSchema,
  guard: 'adminOrSuperadmin',
  clientIdFrom: 'body.clientId',
  handler: async ({ data, user, db, request }) => {
    const result = await fusionnerBls(db, data, user!.id)
    await logServeur(db, {
      user, clientId: data.clientId, action: 'FUSION', entite: 'achats_factures', request,
      entiteId: result.facture_id, entiteNom: data.numeroFacture ?? null, section: data.section ?? null,
      details: { bls_fusionnes: result.bls_fusionnes },
    })
    return Response.json(result)
  },
})
