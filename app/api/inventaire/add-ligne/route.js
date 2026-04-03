import { getServiceClient, requireAdminOrSuperadmin } from '../../../../lib/apiGuards'

/**
 * POST /api/inventaire/add-ligne
 * Body: { inventaire_id, ingredient_id, client_id }
 *
 * Ajoute manuellement un ingrédient à un inventaire en cours (brouillon).
 * Utilisé depuis la page saisie pour les ingrédients qui n'ont pas été
 * pré-remplis lors de la création.
 */
export async function POST(request) {
  const body = await request.json()
  const { inventaire_id, ingredient_id, client_id } = body

  if (!inventaire_id || !ingredient_id || !client_id) {
    return Response.json({ error: 'inventaire_id, ingredient_id et client_id requis.' }, { status: 400 })
  }

  const { response: authError } = await requireAdminOrSuperadmin(request, client_id)
  if (authError) return authError

  const db = getServiceClient()

  // Vérifier que l'inventaire existe, appartient au client, et est encore en brouillon
  const { data: inv, error: invErr } = await db
    .from('inventaires')
    .select('id, statut, section, client_id')
    .eq('id', inventaire_id)
    .eq('client_id', client_id)
    .maybeSingle()

  if (invErr) return Response.json({ error: invErr.message }, { status: 500 })
  if (!inv) return Response.json({ error: 'Inventaire introuvable.' }, { status: 404 })
  if (inv.statut === 'valide') {
    return Response.json({ error: 'Impossible d\'ajouter un ingrédient à un inventaire validé.' }, { status: 403 })
  }

  // Vérifier l'absence de doublon
  const { data: existing } = await db
    .from('inventaire_lignes')
    .select('id')
    .eq('inventaire_id', inventaire_id)
    .eq('ingredient_id', ingredient_id)
    .maybeSingle()

  if (existing) {
    return Response.json({ error: 'Cet ingrédient est déjà dans l\'inventaire.' }, { status: 409 })
  }

  // Récupérer les infos de l'ingrédient (cuisine d'abord, puis bar, puis global)
  let ing = null
  let ingSection = 'cuisine'

  const sections = inv.section === 'global' ? ['cuisine', 'bar'] : [inv.section]

  for (const sec of sections) {
    const table = sec === 'bar' ? 'ingredients_bar' : 'ingredients'
    const { data } = await db
      .from(table)
      .select('id, nom, unite, prix_kg')
      .eq('id', ingredient_id)
      .eq('client_id', client_id)
      .maybeSingle()
    if (data) { ing = data; ingSection = sec; break }
  }

  if (!ing) return Response.json({ error: 'Ingrédient introuvable.' }, { status: 404 })

  // Insérer la nouvelle ligne
  const { data: newLigne, error: insertErr } = await db
    .from('inventaire_lignes')
    .insert({
      inventaire_id,
      client_id,
      ingredient_id,
      section: ingSection,
      nom_ingredient: ing.nom,
      unite: ing.unite || 'kg',
      quantite_theorique: null,
      quantite_reelle: null,
      cout_unitaire: Number(ing.prix_kg) || 0,
      est_critique: false,
    })
    .select()
    .single()

  if (insertErr) return Response.json({ error: insertErr.message }, { status: 500 })

  return Response.json({ ligne: newLigne })
}
