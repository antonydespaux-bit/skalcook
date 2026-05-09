// Helpers purs pour le calcul des marges sur ventes (rapatriés depuis
// app/controle-gestion/marges/page.js). Consommés par les widgets marges
// de la page Analyses CA.
//
// Découplage volontaire React / Supabase : ces fonctions prennent les rows
// brutes en entrée et renvoient les données dérivées. Testables isolément
// (cf. lib/__tests__/margesData.test.ts).

// ── Agrégation par fiche : 1 ligne par plat vendu ──────────────────────────

export function aggregateByFiche(rawVentes, ficheById) {
  const map = new Map()
  for (const row of rawVentes) {
    const fid = row.fiche_id
    const q = Number(row.quantite_vendue) || 0
    const pu = Number(row.prix_vente_net) || 0
    const fiche = ficheById[fid] ?? null
    const nom = fiche?.nom ?? (fid ? `Fiche non trouvée (${fid})` : '—')
    const coutPortion = fiche?.cout_portion != null ? Number(fiche.cout_portion) : null
    const categorie = fiche?.categorie ?? null

    if (!map.has(fid)) {
      map.set(fid, { fiche_id: fid, designation: nom, categorie, quantiteVendue: 0, caNet: 0, coutPortion })
    }
    const agg = map.get(fid)
    agg.quantiteVendue += q
    agg.caNet += q * pu
    if (nom && fid) agg.designation = nom
    if (agg.coutPortion == null && coutPortion != null) agg.coutPortion = coutPortion
    if (agg.categorie == null && categorie != null) agg.categorie = categorie
  }

  return Array.from(map.values())
    .map((r) => {
      const coutMatiere = r.coutPortion != null ? r.quantiteVendue * r.coutPortion : null
      const margeBrute = coutMatiere != null ? r.caNet - coutMatiere : null
      const margePct = margeBrute != null && r.caNet > 0 ? (margeBrute / r.caNet) * 100 : null
      return { ...r, coutMatiere, margeBrute, margePct }
    })
    .sort((a, b) => a.designation.localeCompare(b.designation, 'fr'))
}

// ── Totaux marges sur la période ────────────────────────────────────────────

export function computeMargesTotals(lignes) {
  let q = 0, ca = 0, cout = 0, caAvecCout = 0
  for (const L of lignes) {
    q += L.quantiteVendue
    ca += L.caNet
    if (L.coutMatiere != null) { cout += L.coutMatiere; caAvecCout += L.caNet }
  }
  const margeBrute = ca > 0 && caAvecCout > 0 ? caAvecCout - cout : null
  const margePct = margeBrute != null && caAvecCout > 0 ? (margeBrute / caAvecCout) * 100 : null
  const foodCostPct = caAvecCout > 0 ? (cout / caAvecCout) * 100 : null
  return {
    quantiteVendue: q,
    caNet: ca,
    coutMatiere: cout > 0 ? cout : null,
    margeBrute,
    margePct,
    caAvecCout,
    foodCostPct,
  }
}

export function computeCoveragePct(totals) {
  if (!totals.caNet || totals.caNet === 0) return null
  return (totals.caAvecCout / totals.caNet) * 100
}

// ── Chart CA vs Coût (jour par jour) ────────────────────────────────────────

export function buildMargesChartData(rawVentes, ficheById) {
  const byDay = new Map()
  for (const row of rawVentes) {
    const jour = row.jour
    if (!jour) continue
    const q = Number(row.quantite_vendue) || 0
    const pu = Number(row.prix_vente_net) || 0
    const fiche = ficheById[row.fiche_id] ?? null
    const coutPortion = fiche?.cout_portion != null ? Number(fiche.cout_portion) : 0
    if (!byDay.has(jour)) byDay.set(jour, { ca: 0, cout: 0 })
    const d = byDay.get(jour)
    d.ca += q * pu
    d.cout += q * coutPortion
  }
  return Array.from(byDay.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([jour, vals]) => ({
      date: jour.slice(5).replace('-', '/'),
      ca: Math.round(vals.ca * 100) / 100,
      cout: Math.round(vals.cout * 100) / 100,
    }))
}

// ── Consommation théorique d'ingrédients ────────────────────────────────────

export function computeConsoTheorique(lignes, ficheIngsMap, ficheNbPortions) {
  const map = new Map()
  for (const ligne of lignes) {
    const nbPortions = ficheNbPortions[ligne.fiche_id]
    if (!nbPortions || nbPortions <= 0) continue
    for (const fi of (ficheIngsMap[ligne.fiche_id] || [])) {
      const conso = (ligne.quantiteVendue * (Number(fi.quantite) || 0)) / nbPortions
      const ingId = fi.ingredient_id
      if (!map.has(ingId)) {
        map.set(ingId, {
          ingredient_id: ingId,
          nom: fi.ingredients?.nom ?? `Ingrédient (${ingId})`,
          unite: fi.unite ?? '—',
          qteTotale: 0,
        })
      }
      map.get(ingId).qteTotale += conso
    }
  }
  return Array.from(map.values()).sort((a, b) => a.nom.localeCompare(b.nom, 'fr'))
}

// ── Menu Engineering (matrice popularité × marge) ───────────────────────────

export function computeMenuEngineering(lignes) {
  const withData = lignes.filter((L) => L.margePct != null && L.quantiteVendue > 0)
  if (withData.length === 0) return { points: [], avgQte: 0, avgMarge: 0 }
  const avgQte = withData.reduce((s, L) => s + L.quantiteVendue, 0) / withData.length
  const avgMarge = withData.reduce((s, L) => s + L.margePct, 0) / withData.length
  const points = withData.map((L) => {
    const isPopular = L.quantiteVendue >= avgQte
    const isProfitable = L.margePct >= avgMarge
    const quadrant = isPopular && isProfitable ? 'Star'
      : isPopular ? 'Vache à lait'
      : isProfitable ? 'Dilemme'
      : 'Poids mort'
    const quadrantColor = quadrant === 'Star' ? '#3B6D11'
      : quadrant === 'Vache à lait' ? '#6366F1'
      : quadrant === 'Dilemme' ? '#D97706'
      : '#A32D2D'
    return { x: L.quantiteVendue, y: L.margePct, nom: L.designation, quadrant, quadrantColor, ca: L.caNet }
  })
  return { points, avgQte, avgMarge }
}
