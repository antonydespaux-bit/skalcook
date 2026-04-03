import { getServiceClient, requireAdminOrSuperadmin } from '../../../../lib/apiGuards'

/**
 * PATCH /api/inventaire/save-ligne
 * Body: { ligne_id, quantite_reelle, client_id }
 *
 * Met à jour la quantité réelle d'une ligne d'inventaire.
 * L'écart est recalculé automatiquement (colonne GENERATED).
 */
export async function PATCH(request) {
  const body = await request.json()
  const { ligne_id, quantite_reelle, client_id } = body

  if (!ligne_id || !client_id) {
    return Response.json({ error: 'ligne_id et client_id requis.' }, { status: 400 })
  }

  const { user, response: authError } = await requireAdminOrSuperadmin(request, client_id)
  if (authError) return authError

  const db = getServiceClient()

  const { data, error } = await db
    .from('inventaire_lignes')
    .update({ quantite_reelle: quantite_reelle != null ? Number(quantite_reelle) : null })
    .eq('id', ligne_id)
    .eq('client_id', client_id)
    .select()
    .single()

  if (error) return Response.json({ error: error.message }, { status: 500 })

  return Response.json({ ligne: data })
}
