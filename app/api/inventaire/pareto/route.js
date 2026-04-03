import { getServiceClient, requireAdminOrSuperadmin } from '../../../../lib/apiGuards'

/**
 * GET /api/inventaire/pareto?client_id=...&section=cuisine|bar
 *
 * Analyse Pareto 80/20 : identifie les ~20% d'ingrédients représentant ~80% des achats (en valeur)
 * sur les 3 derniers mois de factures.
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const clientId = searchParams.get('client_id')
  const section = searchParams.get('section') || 'cuisine'

  if (!clientId) {
    return Response.json({ error: 'client_id requis.' }, { status: 400 })
  }

  const { user, response: authError } = await requireAdminOrSuperadmin(request, clientId)
  if (authError) return authError

  const db = getServiceClient()

  // Table d'ingrédients selon la section
  const ingredientTable = section === 'bar' ? 'ingredients_bar' : 'ingredients'

  // Récupérer toutes les lignes d'achat rattachées à un ingrédient, sur les 3 derniers mois
  const threeMonthsAgo = new Date()
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3)
  const dateLimit = threeMonthsAgo.toISOString().slice(0, 10)

  // 1) Factures des 3 derniers mois
  const { data: factures, error: fErr } = await db
    .from('achats_factures')
    .select('id')
    .eq('client_id', clientId)
    .gte('date_facture', dateLimit)

  if (fErr) {
    return Response.json({ error: fErr.message }, { status: 500 })
  }

  if (!factures || factures.length === 0) {
    return Response.json({
      ingredients: [],
      message: 'Aucune facture sur les 3 derniers mois — analyse Pareto impossible.',
      grand_total: 0,
    })
  }

  const factureIds = factures.map(f => f.id)

  // 2) Lignes d'achat groupées par ingredient_id
  const { data: lignes, error: lErr } = await db
    .from('achats_lignes')
    .select('ingredient_id, montant_ht')
    .eq('client_id', clientId)
    .not('ingredient_id', 'is', null)
    .in('facture_id', factureIds)

  if (lErr) {
    return Response.json({ error: lErr.message }, { status: 500 })
  }

  // Agrégation par ingredient_id
  const totaux = {}
  for (const l of (lignes || [])) {
    if (!l.ingredient_id) continue
    totaux[l.ingredient_id] = (totaux[l.ingredient_id] || 0) + (Number(l.montant_ht) || 0)
  }

  // Trier par montant décroissant
  const sorted = Object.entries(totaux)
    .map(([id, total]) => ({ ingredient_id: id, total_ht: total }))
    .sort((a, b) => b.total_ht - a.total_ht)

  const grandTotal = sorted.reduce((s, r) => s + r.total_ht, 0)

  if (grandTotal === 0) {
    return Response.json({ ingredients: [], message: 'Montant total des achats = 0.', grand_total: 0 })
  }

  // Calcul du cumul et seuil 80%
  let cumul = 0
  const result = sorted.map(row => {
    cumul += row.total_ht
    const pctCumule = (cumul / grandTotal) * 100
    const estCritique = (cumul - row.total_ht) / grandTotal < 0.80
    return {
      ingredient_id: row.ingredient_id,
      total_ht: Math.round(row.total_ht * 100) / 100,
      pct_cumule: Math.round(pctCumule * 10) / 10,
      est_critique: estCritique,
    }
  })

  // Enrichir avec le nom de l'ingrédient
  const criticalIds = result.filter(r => r.est_critique).map(r => r.ingredient_id)
  const allIds = result.map(r => r.ingredient_id)

  const { data: ingredients } = await db
    .from(ingredientTable)
    .select('id, nom, unite, prix_kg, categorie_id')
    .in('id', allIds)

  const ingMap = Object.fromEntries((ingredients || []).map(i => [i.id, i]))

  const enriched = result.map(r => ({
    ...r,
    nom: ingMap[r.ingredient_id]?.nom || '—',
    unite: ingMap[r.ingredient_id]?.unite || '—',
  }))

  return Response.json({
    ingredients: enriched,
    grand_total: Math.round(grandTotal * 100) / 100,
    nb_critiques: criticalIds.length,
    nb_total: result.length,
  })
}
