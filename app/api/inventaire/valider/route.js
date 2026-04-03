import { getServiceClient, requireAdminOrSuperadmin } from '../../../../lib/apiGuards'

/**
 * POST /api/inventaire/valider
 * Body: { inventaire_id, client_id }
 *
 * Valide (clôture) un inventaire brouillon.
 * Met à jour le statut, la date de validation et le user qui valide.
 * Si c'est un tournant, met à jour inventaire_tournant_dernier sur clients.
 */
export async function POST(request) {
  const body = await request.json()
  const { inventaire_id, client_id } = body

  if (!inventaire_id || !client_id) {
    return Response.json({ error: 'inventaire_id et client_id requis.' }, { status: 400 })
  }

  const { user, response: authError } = await requireAdminOrSuperadmin(request, client_id)
  if (authError) return authError

  const db = getServiceClient()

  // Vérifier que l'inventaire existe et est en brouillon
  const { data: inv, error: invErr } = await db
    .from('inventaires')
    .select('id, type, statut')
    .eq('id', inventaire_id)
    .eq('client_id', client_id)
    .single()

  if (invErr || !inv) {
    return Response.json({ error: 'Inventaire introuvable.' }, { status: 404 })
  }
  if (inv.statut === 'valide') {
    return Response.json({ error: 'Cet inventaire est déjà validé.' }, { status: 409 })
  }

  // Compter les lignes non saisies
  const { count: nonSaisies } = await db
    .from('inventaire_lignes')
    .select('*', { count: 'exact', head: true })
    .eq('inventaire_id', inventaire_id)
    .is('quantite_reelle', null)

  // Valider l'inventaire
  const { data: updated, error: updErr } = await db
    .from('inventaires')
    .update({
      statut: 'valide',
      date_validation: new Date().toISOString(),
      valide_par: user.id,
    })
    .eq('id', inventaire_id)
    .eq('client_id', client_id)
    .select()
    .single()

  if (updErr) return Response.json({ error: updErr.message }, { status: 500 })

  // Si tournant, mettre à jour la date du dernier inventaire tournant
  if (inv.type === 'tournant') {
    await db
      .from('clients')
      .update({ inventaire_tournant_dernier: new Date().toISOString().slice(0, 10) })
      .eq('id', client_id)
  }

  return Response.json({
    inventaire: updated,
    lignes_non_saisies: nonSaisies || 0,
    message: nonSaisies > 0
      ? `Inventaire validé avec ${nonSaisies} ligne(s) non saisie(s).`
      : 'Inventaire validé avec succès.',
  })
}
