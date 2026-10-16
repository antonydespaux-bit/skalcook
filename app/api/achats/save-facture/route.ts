import { apiHandler } from '../../../../lib/apiHandler'
import { logServeur } from '../../../../lib/serverLog'
import { saveFactureSchema } from '../../../../lib/validators/achats.schema'
import { saveFacture } from '../../../../lib/services/achats.service'
import { ConflictError } from '../../../../lib/errors'

export const POST = apiHandler({
  schema: saveFactureSchema,
  guard: 'adminOrSuperadmin',
  clientIdFrom: 'body.clientId',
  handler: async ({ data, user, db, request }) => {
    try {
      const result = await saveFacture(db, data, user!.id)
      await logServeur(db, {
        user, clientId: data.clientId, action: 'CREATION', entite: 'achats_factures', request,
        entiteId: result.facture_id, section: data.section,
        entiteNom: [data.fournisseur, data.numeroFacture].filter(Boolean).join(' · '),
        details: { statut: data.statut, lignes: data.lignes.length },
      })
      return Response.json(result)
    } catch (err) {
      if (err instanceof ConflictError) {
        // Retrieve duplicate info for the frontend
        const numTrimmed = data.numeroFacture?.trim() || ''
        const { data: rows } = await db
          .from('achats_factures')
          .select('id, date_facture, fournisseur, total_ht, created_at')
          .eq('client_id', data.clientId)
          .ilike('numero_facture', numTrimmed)
          .limit(1)

        const existing = rows?.[0] ?? null
        return Response.json(
          { error: 'DUPLICATE_FACTURE', existing },
          { status: 409 }
        )
      }
      throw err
    }
  },
})
