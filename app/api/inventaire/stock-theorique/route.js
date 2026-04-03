import { getServiceClient, requireAdminOrSuperadmin } from '../../../../lib/apiGuards'
import { convertirUnite } from '../../../../lib/constants'

/**
 * GET /api/inventaire/stock-theorique?client_id=...&section=cuisine|bar
 *
 * Calcule le stock théorique de chaque ingrédient :
 *   Stock théorique = dernier inventaire validé + achats - consommation (ventes × fiches techniques)
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

  const isBar = section === 'bar'
  const ingredientTable = isBar ? 'ingredients_bar' : 'ingredients'
  const ficheIngTable = isBar ? 'fiche_bar_ingredients' : 'fiche_ingredients'
  const ficheTable = isBar ? 'fiches_bar' : 'fiches'
  const ficheFK = isBar ? 'fiche_bar_id' : 'fiche_id'

  // 1) Charger tous les ingrédients actifs
  const { data: ingredients, error: iErr } = await db
    .from(ingredientTable)
    .select('id, nom, unite, prix_kg, categorie_id')
    .eq('client_id', clientId)

  if (iErr) return Response.json({ error: iErr.message }, { status: 500 })
  if (!ingredients || ingredients.length === 0) {
    return Response.json({ stock: [], periode_debut: null })
  }

  // 2) Trouver le dernier inventaire validé pour cette section
  const { data: dernierInv } = await db
    .from('inventaires')
    .select('id, date_inventaire')
    .eq('client_id', clientId)
    .eq('statut', 'valide')
    .in('section', [section, 'global'])
    .order('date_inventaire', { ascending: false })
    .limit(1)
    .maybeSingle()

  const periodeDebut = dernierInv?.date_inventaire || null

  // Stock de départ depuis le dernier inventaire
  let stockDepart = {}
  if (dernierInv) {
    const { data: lignesInv } = await db
      .from('inventaire_lignes')
      .select('ingredient_id, quantite_reelle, unite')
      .eq('inventaire_id', dernierInv.id)
      .eq('section', section)

    for (const l of (lignesInv || [])) {
      if (l.ingredient_id && l.quantite_reelle != null) {
        stockDepart[l.ingredient_id] = { qte: Number(l.quantite_reelle), unite: l.unite }
      }
    }
  }

  // 3) Achats depuis le dernier inventaire
  let achatsParIngredient = {}
  const factureFilter = db
    .from('achats_factures')
    .select('id')
    .eq('client_id', clientId)

  if (periodeDebut) {
    factureFilter.gt('date_facture', periodeDebut)
  }

  const { data: factures } = await factureFilter
  if (factures && factures.length > 0) {
    const factureIds = factures.map(f => f.id)
    const { data: lignesAchat } = await db
      .from('achats_lignes')
      .select('ingredient_id, quantite, unite')
      .eq('client_id', clientId)
      .not('ingredient_id', 'is', null)
      .in('facture_id', factureIds)

    for (const l of (lignesAchat || [])) {
      if (!l.ingredient_id) continue
      if (!achatsParIngredient[l.ingredient_id]) {
        achatsParIngredient[l.ingredient_id] = 0
      }
      // Tenter conversion vers l'unité de l'ingrédient
      const ingRef = ingredients.find(i => i.id === l.ingredient_id)
      const qte = Number(l.quantite) || 0
      if (ingRef && l.unite !== ingRef.unite) {
        const converted = convertirUnite(qte, l.unite, ingRef.unite)
        achatsParIngredient[l.ingredient_id] += converted != null ? converted : qte
      } else {
        achatsParIngredient[l.ingredient_id] += qte
      }
    }
  }

  // 4) Consommation : ventes × fiche_ingredients / nb_portions
  let consoParIngredient = {}

  // Charger les ventes sur la période
  const ventesFilter = db
    .from('ventes_journalieres')
    .select('fiche_id, quantite_vendue')
    .eq('client_id', clientId)

  if (periodeDebut) {
    ventesFilter.gt('jour', periodeDebut)
  }

  const { data: ventes } = await ventesFilter
  if (ventes && ventes.length > 0) {
    // Agréger les ventes par fiche
    const ventesParFiche = {}
    for (const v of ventes) {
      if (!v.fiche_id) continue
      ventesParFiche[v.fiche_id] = (ventesParFiche[v.fiche_id] || 0) + (Number(v.quantite_vendue) || 0)
    }

    const ficheIds = Object.keys(ventesParFiche)
    if (ficheIds.length > 0) {
      // Charger les nb_portions des fiches
      const { data: fiches } = await db
        .from(ficheTable)
        .select('id, nb_portions')
        .in('id', ficheIds)

      const ficheMap = Object.fromEntries((fiches || []).map(f => [f.id, f]))

      // Charger les compositions fiche_ingredients
      const { data: compositions } = await db
        .from(ficheIngTable)
        .select(`ingredient_id, quantite, unite, ${ficheFK}`)
        .in(ficheFK, ficheIds)
        .eq('client_id', clientId)

      for (const comp of (compositions || [])) {
        if (!comp.ingredient_id) continue
        const ficheId = comp[ficheFK]
        const nbPortions = ficheMap[ficheId]?.nb_portions || 1
        const qtVendue = ventesParFiche[ficheId] || 0
        const qtParPortion = (Number(comp.quantite) || 0) / nbPortions
        const conso = qtVendue * qtParPortion

        // Conversion d'unité si nécessaire
        const ingRef = ingredients.find(i => i.id === comp.ingredient_id)
        let consoConvertie = conso
        if (ingRef && comp.unite !== ingRef.unite) {
          const converted = convertirUnite(conso, comp.unite, ingRef.unite)
          if (converted != null) consoConvertie = converted
        }

        if (!consoParIngredient[comp.ingredient_id]) consoParIngredient[comp.ingredient_id] = 0
        consoParIngredient[comp.ingredient_id] += consoConvertie
      }
    }
  }

  // 5) Calcul final : stock_depart + achats - consommation
  const stock = ingredients.map(ing => {
    const sd = stockDepart[ing.id]?.qte || 0
    const achats = achatsParIngredient[ing.id] || 0
    const conso = consoParIngredient[ing.id] || 0
    const theorique = sd + achats - conso

    return {
      ingredient_id: ing.id,
      nom: ing.nom,
      unite: ing.unite,
      prix_kg: ing.prix_kg,
      categorie_id: ing.categorie_id,
      stock_depart: Math.round(sd * 1000) / 1000,
      achats: Math.round(achats * 1000) / 1000,
      consommation: Math.round(conso * 1000) / 1000,
      quantite_theorique: Math.round(theorique * 1000) / 1000,
    }
  })

  return Response.json({
    stock,
    periode_debut: periodeDebut,
    nb_ingredients: stock.length,
  })
}
