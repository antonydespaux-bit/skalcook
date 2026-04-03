import { requireAdminOrSuperadmin, getServiceClient } from '../../../../lib/apiGuards'

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const clientId = searchParams.get('clientId')

    if (!clientId) {
      return Response.json({ error: 'clientId requis.' }, { status: 400 })
    }

    const { response: authError } = await requireAdminOrSuperadmin(request, clientId)
    if (authError) return authError

    const db = getServiceClient()

    // Récupère toutes les factures + BL du client
    const { data: factures, error: fErr } = await db
      .from('achats_factures')
      .select('id, fournisseur, fournisseur_id, date_facture')
      .eq('client_id', clientId)
      .order('date_facture', { ascending: false })

    if (fErr) return Response.json({ error: fErr.message }, { status: 500 })
    if (!factures?.length) return Response.json({ rows: [], fournisseurs: [] })

    const factureIds = factures.map(f => f.id)
    const factureMap = Object.fromEntries(factures.map(f => [f.id, f]))

    // Récupère toutes les lignes ayant un ingrédient lié
    const { data: lignes, error: lErr } = await db
      .from('achats_lignes')
      .select('ingredient_id, designation, unite, prix_unitaire_ht, remise, facture_id')
      .in('facture_id', factureIds)
      .not('ingredient_id', 'is', null)

    if (lErr) return Response.json({ error: lErr.message }, { status: 500 })

    // Récupère les ingrédients pour avoir le nom canonique
    const ingredientIds = [...new Set((lignes ?? []).map(l => l.ingredient_id))]
    let ingredientsById = {}
    if (ingredientIds.length) {
      const { data: ings } = await db
        .from('ingredients')
        .select('id, nom, unite')
        .in('id', ingredientIds)
      if (ings) ingredientsById = Object.fromEntries(ings.map(i => [i.id, i]))
    }

    // Tous les ingrédients du client (pour la recherche "hors mercuriale")
    const { data: allIngs } = await db
      .from('ingredients')
      .select('id, nom, unite')
      .eq('client_id', clientId)
      .eq('est_sous_fiche', false)
      .order('nom')
    const allIngredients = (allIngs ?? []).map(i => ({ id: i.id, nom: i.nom, unite: i.unite ?? '' }))

    // Agrège par (ingredient_id, fournisseur)
    // Structure : { [ingredientId]: { [fournisseur]: [{ prix, date }] } }
    const agg = {}
    for (const l of lignes ?? []) {
      const f = factureMap[l.facture_id]
      if (!f) continue
      const prix = Number(l.prix_unitaire_ht) * (1 - (Number(l.remise) || 0) / 100)
      const fourn = f.fournisseur
      const fournId = f.fournisseur_id

      if (!agg[l.ingredient_id]) agg[l.ingredient_id] = {}
      if (!agg[l.ingredient_id][fourn]) agg[l.ingredient_id][fourn] = { fournisseur_id: fournId, achats: [] }
      agg[l.ingredient_id][fourn].achats.push({ prix, date: f.date_facture, unite: l.unite })
    }

    // Construit la liste des fournisseurs (triés alphabétiquement)
    const fournisseursSet = new Set()
    for (const ingData of Object.values(agg)) {
      for (const fourn of Object.keys(ingData)) fournisseursSet.add(fourn)
    }
    const fournisseurs = [...fournisseursSet].sort()

    // Construit les lignes de la mercuriale
    const rows = Object.entries(agg).map(([ingredientId, byFourn]) => {
      const ing = ingredientsById[ingredientId]
      const cols = {}
      let bestPrix = null

      for (const [fourn, data] of Object.entries(byFourn)) {
        const sorted = data.achats.sort((a, b) => b.date.localeCompare(a.date))
        const prixLast = sorted[0].prix
        const prixMoy = sorted.reduce((s, a) => s + a.prix, 0) / sorted.length
        const unite = sorted[0].unite
        cols[fourn] = {
          fournisseur_id: data.fournisseur_id,
          prix_last:      Math.round(prixLast * 10000) / 10000,
          prix_moy:       Math.round(prixMoy * 10000) / 10000,
          date_last:      sorted[0].date,
          nb_achats:      sorted.length,
          unite,
        }
        if (bestPrix === null || prixLast < bestPrix) bestPrix = prixLast
      }

      // Marque le fournisseur le moins cher
      for (const fourn of Object.keys(cols)) {
        cols[fourn].is_best = Math.abs(cols[fourn].prix_last - bestPrix) < 0.001
      }

      return {
        ingredient_id:  ingredientId,
        ingredient_nom: ing?.nom ?? '—',
        unite:          Object.values(byFourn)[0]?.achats[0]?.unite ?? ing?.unite ?? '—',
        cols,
      }
    }).sort((a, b) => a.ingredient_nom.localeCompare(b.ingredient_nom))

    return Response.json({ rows, fournisseurs, allIngredients })
  } catch (err) {
    console.error('mercuriale error:', err)
    return Response.json({ error: err.message }, { status: 500 })
  }
}
