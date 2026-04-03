import { getServiceClient, requireAdminOrSuperadmin } from '../../../../lib/apiGuards'

/**
 * DELETE /api/inventaire/delete
 * Body: { inventaire_id, client_id }
 *
 * Supprime un inventaire en statut "brouillon" (et ses lignes par cascade FK).
 */
export async function DELETE(request) {
  const body = await request.json()
  const { inventaire_id, client_id } = body

  if (!inventaire_id || !client_id) {
    return Response.json({ error: 'inventaire_id et client_id requis.' }, { status: 400 })
  }

  const { response: authError } = await requireAdminOrSuperadmin(request, client_id)
  if (authError) return authError

  const db = getServiceClient()

  const { data: inv, error: fetchErr } = await db
    .from('inventaires')
    .select('id, statut, client_id')
    .eq('id', inventaire_id)
    .eq('client_id', client_id)
    .maybeSingle()

  if (fetchErr) return Response.json({ error: fetchErr.message }, { status: 500 })
  if (!inv) return Response.json({ error: 'Inventaire introuvable.' }, { status: 404 })

  const { error: delErr } = await db
    .from('inventaires')
    .delete()
    .eq('id', inventaire_id)
    .eq('client_id', client_id)

  if (delErr) return Response.json({ error: delErr.message }, { status: 500 })

  return Response.json({ success: true })
}
