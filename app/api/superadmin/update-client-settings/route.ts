import { apiHandler } from '../../../../lib/apiHandler'
import { logServeur } from '../../../../lib/serverLog'
import { updateClientSettingsSchema } from '../../../../lib/validators/admin.schema'
import { updateClientSettings } from '../../../../lib/services/admin.service'

export const POST = apiHandler({
  schema: updateClientSettingsSchema,
  guard: 'superadmin',
  handler: async ({ data, user, db, request }) => {
    const result = await updateClientSettings(db, data)
    const { id, ...champs } = data
    await logServeur(db, {
      user, clientId: id, action: 'MODIFICATION', entite: 'clients', request,
      entiteNom: data.nom_etablissement ?? null,
      details: { champs: Object.keys(champs).filter((k) => (champs as Record<string, unknown>)[k] !== undefined) },
    })
    return Response.json(result)
  },
})
