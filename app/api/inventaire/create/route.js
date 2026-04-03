import { getServiceClient, requireAdminOrSuperadmin } from '../../../../lib/apiGuards'
import { convertirUnite } from '../../../../lib/constants'

/**
 * POST /api/inventaire/create
 * Body: { client_id, type: 'tournant'|'complet', section: 'cuisine'|'bar'|'global' }
 *
 * Crée un nouvel inventaire avec ses lignes pré-remplies :
 * - Tournant : uniquement les ingrédients critiques (Pareto 80/20)
 * - Complet : 100% des ingrédients actifs
 * Pré-calcule le stock théorique et snapshotte le coût unitaire.
 */
export async function POST(request) {
  const body = await request.json()
  const { client_id, type, section = 'cuisine' } = body

  if (!client_id) return Response.json({ error: 'client_id requis.' }, { status: 400 })
  if (!['tournant', 'complet'].includes(type)) {
    return Response.json({ error: 'type doit être tournant ou complet.' }, { status: 400 })
  }
  if (!['cuisine', 'bar', 'global'].includes(section)) {
    return Response.json({ error: 'section invalide.' }, { status: 400 })
  }

  const { user, response: authError } = await requireAdminOrSuperadmin(request, client_id)
  if (authError) return authError

  const db = getServiceClient()

  // Sections à traiter
  const sections = section === 'global' ? ['cuisine', 'bar'] : [section]

  // Récupérer le stock théorique pour chaque section via l'API interne (ou recalculer ici)
  let allIngredients = []
  let periodeDebut = null

  for (const sec of sections) {
    const isBar = sec === 'bar'
    const ingredientTable = isBar ? 'ingredients_bar' : 'ingredients'

    // Charger les ingrédients
    const { data: ingredients } = await db
      .from(ingredientTable)
      .select('id, nom, unite, prix_kg')
      .eq('client_id', client_id)

    if (!ingredients) continue

    // Dernier inventaire validé
    const { data: dernierInv } = await db
      .from('inventaires')
      .select('id, date_inventaire')
      .eq('client_id', client_id)
      .eq('statut', 'valide')
      .in('section', [sec, 'global'])
      .order('date_inventaire', { ascending: false })
      .limit(1)
      .maybeSingle()

    const pd = dernierInv?.date_inventaire || null
    if (!periodeDebut || (pd && pd < periodeDebut)) periodeDebut = pd

    // Stock de départ
    let stockDepart = {}
    if (dernierInv) {
      const { data: lignesInv } = await db
        .from('inventaire_lignes')
        .select('ingredient_id, quantite_reelle, unite')
        .eq('inventaire_id', dernierInv.id)
        .eq('section', sec)

      for (const l of (lignesInv || [])) {
        if (l.ingredient_id && l.quantite_reelle != null) {
          stockDepart[l.ingredient_id] = Number(l.quantite_reelle)
        }
      }
    }

    // Achats
    let achats = {}
    let factureQuery = db.from('achats_factures').select('id').eq('client_id', client_id)
    if (pd) factureQuery = factureQuery.gt('date_facture', pd)
    const { data: factures } = await factureQuery
    if (factures && factures.length > 0) {
      const { data: lignesAchat } = await db
        .from('achats_lignes')
        .select('ingredient_id, quantite, unite')
        .eq('client_id', client_id)
        .not('ingredient_id', 'is', null)
        .in('facture_id', factures.map(f => f.id))

      for (const l of (lignesAchat || [])) {
        if (!l.ingredient_id) continue
        const ingRef = ingredients.find(i => i.id === l.ingredient_id)
        const qte = Number(l.quantite) || 0
        let converted = qte
        if (ingRef && l.unite !== ingRef.unite) {
          const c = convertirUnite(qte, l.unite, ingRef.unite)
          if (c != null) converted = c
        }
        achats[l.ingredient_id] = (achats[l.ingredient_id] || 0) + converted
      }
    }

    // Consommation
    let conso = {}
    const ficheTable = isBar ? 'fiches_bar' : 'fiches'
    const ficheIngTable = isBar ? 'fiche_bar_ingredients' : 'fiche_ingredients'
    const ficheFK = isBar ? 'fiche_bar_id' : 'fiche_id'

    let ventesQuery = db.from('ventes_journalieres').select('fiche_id, quantite_vendue').eq('client_id', client_id)
    if (pd) ventesQuery = ventesQuery.gt('jour', pd)
    const { data: ventes } = await ventesQuery

    if (ventes && ventes.length > 0) {
      const ventesParFiche = {}
      for (const v of ventes) {
        if (!v.fiche_id) continue
        ventesParFiche[v.fiche_id] = (ventesParFiche[v.fiche_id] || 0) + (Number(v.quantite_vendue) || 0)
      }
      const ficheIds = Object.keys(ventesParFiche)
      if (ficheIds.length > 0) {
        const { data: fiches } = await db.from(ficheTable).select('id, nb_portions').in('id', ficheIds)
        const ficheMap = Object.fromEntries((fiches || []).map(f => [f.id, f]))
        const { data: comps } = await db
          .from(ficheIngTable)
          .select(`ingredient_id, quantite, unite, ${ficheFK}`)
          .in(ficheFK, ficheIds)
          .eq('client_id', client_id)

        for (const comp of (comps || [])) {
          if (!comp.ingredient_id) continue
          const fId = comp[ficheFK]
          const nbP = ficheMap[fId]?.nb_portions || 1
          const qtV = ventesParFiche[fId] || 0
          const c2 = qtV * ((Number(comp.quantite) || 0) / nbP)
          const ingRef = ingredients.find(i => i.id === comp.ingredient_id)
          let consoC = c2
          if (ingRef && comp.unite !== ingRef.unite) {
            const cv = convertirUnite(c2, comp.unite, ingRef.unite)
            if (cv != null) consoC = cv
          }
          conso[comp.ingredient_id] = (conso[comp.ingredient_id] || 0) + consoC
        }
      }
    }

    for (const ing of ingredients) {
      const sd = stockDepart[ing.id] || 0
      const a = achats[ing.id] || 0
      const co = conso[ing.id] || 0
      allIngredients.push({
        ingredient_id: ing.id,
        section: sec,
        nom: ing.nom,
        unite: ing.unite,
        prix_kg: ing.prix_kg,
        quantite_theorique: Math.round((sd + a - co) * 1000) / 1000,
      })
    }
  }

  // Si tournant : filtrer via Pareto
  if (type === 'tournant') {
    // Calcul Pareto rapide sur les ingrédients récupérés
    const threeMonthsAgo = new Date()
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3)
    const dateLimit = threeMonthsAgo.toISOString().slice(0, 10)

    const { data: factures } = await db
      .from('achats_factures')
      .select('id')
      .eq('client_id', client_id)
      .gte('date_facture', dateLimit)

    let criticalIds = new Set()
    if (factures && factures.length > 0) {
      const { data: lignes } = await db
        .from('achats_lignes')
        .select('ingredient_id, montant_ht')
        .eq('client_id', client_id)
        .not('ingredient_id', 'is', null)
        .in('facture_id', factures.map(f => f.id))

      const totaux = {}
      for (const l of (lignes || [])) {
        if (!l.ingredient_id) continue
        totaux[l.ingredient_id] = (totaux[l.ingredient_id] || 0) + (Number(l.montant_ht) || 0)
      }

      const sorted = Object.entries(totaux)
        .map(([id, total]) => ({ id, total }))
        .sort((a, b) => b.total - a.total)

      const grandTotal = sorted.reduce((s, r) => s + r.total, 0)
      if (grandTotal > 0) {
        let cumul = 0
        for (const row of sorted) {
          if ((cumul / grandTotal) >= 0.80) break
          criticalIds.add(row.id)
          cumul += row.total
        }
      }
    }

    // Fallback 1 : aucun historique d'achats → classer par prix_kg (ingrédients les plus chers)
    if (criticalIds.size === 0) {
      const sortedByPrix = allIngredients
        .filter(ing => (ing.prix_kg || 0) > 0)
        .sort((a, b) => (b.prix_kg || 0) - (a.prix_kg || 0))

      if (sortedByPrix.length > 0) {
        const grandTotal = sortedByPrix.reduce((s, r) => s + (r.prix_kg || 0), 0)
        let cumul = 0
        for (const ing of sortedByPrix) {
          if (grandTotal > 0 && (cumul / grandTotal) >= 0.80) break
          criticalIds.add(ing.ingredient_id)
          cumul += (ing.prix_kg || 0)
        }
      }

      // Fallback 2 : aucun prix enregistré → tout inclure
      if (criticalIds.size === 0) {
        allIngredients.forEach(ing => criticalIds.add(ing.ingredient_id))
      }
    }

    const allIngredientsBeforeFilter = allIngredients
      .map(ing => ({ ...ing, est_critique: criticalIds.has(ing.ingredient_id) }))
    allIngredients = allIngredientsBeforeFilter.filter(ing => ing.est_critique)

    // Limiter le Flash à 20-25 ingrédients
    const FLASH_MIN = 20
    const FLASH_MAX = 25
    if (allIngredients.length > FLASH_MAX) {
      allIngredients = allIngredients
        .sort((a, b) => (b.prix_kg || 0) - (a.prix_kg || 0))
        .slice(0, FLASH_MAX)
    } else if (allIngredients.length < FLASH_MIN) {
      const includedIds = new Set(allIngredients.map(i => i.ingredient_id))
      const extras = allIngredientsBeforeFilter
        .filter(ing => !includedIds.has(ing.ingredient_id))
        .sort((a, b) => (b.prix_kg || 0) - (a.prix_kg || 0))
        .slice(0, FLASH_MIN - allIngredients.length)
        .map(ing => ({ ...ing, est_critique: false }))
      allIngredients = [...allIngredients, ...extras]
    }
  }

  // Créer l'inventaire
  const today = new Date().toISOString().slice(0, 10)
  const { data: inventaire, error: invErr } = await db
    .from('inventaires')
    .insert({
      client_id: client_id,
      type,
      section,
      statut: 'brouillon',
      date_inventaire: today,
      periode_debut: periodeDebut,
      periode_fin: today,
    })
    .select()
    .single()

  if (invErr) return Response.json({ error: invErr.message }, { status: 500 })

  // Insérer les lignes
  if (allIngredients.length > 0) {
    const lignes = allIngredients.map(ing => ({
      inventaire_id: inventaire.id,
      client_id: client_id,
      ingredient_id: ing.ingredient_id,
      section: ing.section,
      nom_ingredient: ing.nom,
      unite: ing.unite,
      quantite_theorique: ing.quantite_theorique,
      quantite_reelle: null,
      cout_unitaire: Number(ing.prix_kg) || 0,
      est_critique: ing.est_critique || false,
    }))

    const { error: ligErr } = await db
      .from('inventaire_lignes')
      .insert(lignes)

    if (ligErr) return Response.json({ error: ligErr.message }, { status: 500 })
  }

  return Response.json({
    inventaire,
    nb_lignes: allIngredients.length,
    message: `Inventaire ${type} créé avec ${allIngredients.length} ligne(s).`,
  })
}
