// Construction de l'export Excel multi-onglets pour la page Analyses CA.
//
// Stratégie : un onglet "Période & filtres" pour la traçabilité, un onglet
// "KPIs" pour les 5 cartes (sinon ce serait 5 mini-onglets), et un onglet
// par widget de section visible. Permet à l'user de retrouver ce qu'il a vu
// à l'écran, en chiffres bruts manipulables sous Excel.
//
// Pour rester testable, ce module ne fait QUE construire le workbook xlsx.
// L'écriture sur disque est faite côté caller (XLSX.writeFile) — autrement
// les tests devraient mocker l'API File. Voir buildAnalysesWorkbook + ses tests.

import * as XLSX from 'xlsx'

const PERIODE_LABELS = {
  'aujourdhui':     "Aujourd'hui",
  '7j':             '7 derniers jours',
  '30j':            '30 derniers jours',
  'mois-en-cours':  'Mois en cours',
  'mois-precedent': 'Mois précédent',
  'trimestre':      'Trimestre',
  'annee':          'Année',
  'custom':         'Personnalisé',
}

const COMPARAISON_LABELS = {
  'aucune':  'Aucune comparaison',
  'n-1':     'vs même période N-1',
  'budget':  'vs Budget',
}

const SERVICE_LABELS = {
  'tout':   'Tous services',
  'lunch':  'Déjeuner',
  'dinner': 'Dîner',
}

// ─── Builders d'onglets (purs : prennent les data brutes, renvoient
//     des arrays de records adaptés à XLSX.utils.json_to_sheet) ──────────────

export function buildPeriodSheetRows({ periode, dateDebut, dateFin, comparaison, lieuLabel, service, joursLabel, granularity, generatedAt = new Date() }) {
  return [
    { Champ: 'Date d\'export',   Valeur: formatDateTime(generatedAt) },
    { Champ: 'Période',          Valeur: PERIODE_LABELS[periode] || periode },
    { Champ: 'Date début',       Valeur: dateDebut },
    { Champ: 'Date fin',         Valeur: dateFin },
    { Champ: 'Comparaison',      Valeur: COMPARAISON_LABELS[comparaison] || comparaison },
    { Champ: 'Lieu',             Valeur: lieuLabel || 'Tous lieux' },
    { Champ: 'Service',          Valeur: SERVICE_LABELS[service] || service },
    { Champ: 'Jours de semaine', Valeur: joursLabel || 'Tous' },
    { Champ: 'Granularité auto', Valeur: granularity === 'day' ? 'Jour' : granularity === 'week' ? 'Semaine' : 'Mois' },
  ]
}

export function buildKpiSheetRows({ totals, comparisonTotals, comparisonLabel, periodBudget }) {
  const rows = []
  const push = (label, value, comparison = null) => rows.push({
    KPI: label,
    Valeur: value,
    'Comparaison': comparison?.label ?? '',
    'Δ': comparison?.delta ?? '',
    'Δ (%)': comparison?.pct != null ? `${comparison.pct.toFixed(1)} %` : '',
  })
  push('Couverts', totals.couverts || 0, computeDelta(totals.couverts, comparisonTotals?.couverts, comparisonLabel))
  push('CA TTC',   round(totals.caTtc),  computeDelta(totals.caTtc,   comparisonTotals?.caTtc,   comparisonLabel))
  push('CA HT',    round(totals.caHt),   computeDelta(totals.caHt,    comparisonTotals?.caHt,    comparisonLabel))
  push('Ticket moyen', totals.tm != null ? round2(totals.tm) : '', computeDelta(totals.tm, comparisonTotals?.tm, comparisonLabel))
  if (periodBudget > 0) {
    const ecart = ((totals.caTtc - periodBudget) / periodBudget) * 100
    push('Écart vs Budget (%)', `${ecart.toFixed(1)} %`)
  } else {
    push('Écart vs Budget (%)', 'Pas de budget cible')
  }
  return rows
}

export function buildEvolutionCaSheetRows(buckets) {
  return buckets.map((b) => ({
    Période: b.label,
    'CA TTC réel': round(b.caTot),
    'Budget cible': round(b.budget),
    'Δ Budget': round((b.caTot || 0) - (b.budget || 0)),
  }))
}

// PR 6 — Variante multi-séries : 1 ligne par (période, série) pour donner
// à l'user la même donnée que celle qu'il voit sur le line chart.
// `bucketsMulti` = { series: [...], buckets: [{ key, label, ['Salle']: …, ['Privat']: … }] }
export function buildEvolutionCaMultiSheetRows(bucketsMulti) {
  if (!bucketsMulti) return []
  const out = []
  for (const b of bucketsMulti.buckets) {
    for (const serie of bucketsMulti.series) {
      out.push({ Période: b.label, Série: serie, 'CA TTC réel': round(b[serie] || 0) })
    }
  }
  return out
}

export function buildEvolutionCouvertsSheetRows(buckets) {
  return buckets.map((b) => ({
    Période: b.label,
    Couverts: b.couverts || 0,
  }))
}

export function buildEvolutionCouvertsMultiSheetRows(bucketsMulti) {
  if (!bucketsMulti) return []
  const out = []
  for (const b of bucketsMulti.buckets) {
    for (const serie of bucketsMulti.series) {
      out.push({ Période: b.label, Série: serie, Couverts: b[serie] || 0 })
    }
  }
  return out
}

export function buildPerfJourSemaineSheetRows(perf) {
  return perf.map((p) => ({
    Jour: p.label,
    'Jours observés': p.count,
    'CA TTC moyen': round(p.ca),
    'Couverts moyens': Math.round(p.cv),
    'Ticket moyen': p.tm != null ? round2(p.tm) : '',
  }))
}

export function buildPerfJourSemaineMultiSheetRows(perfMulti) {
  if (!perfMulti) return []
  const out = []
  for (const row of perfMulti.data) {
    for (const serie of perfMulti.series) {
      out.push({ Jour: row.label, Série: serie, 'CA TTC moyen': row[serie] || 0 })
    }
  }
  return out
}

// PR 6 — Mix détaillé service × catégorie en %
export function buildMixDetailleSheetRows(matrix, totalCaTtc) {
  if (!matrix) return []
  const out = matrix.map((m) => ({
    Service: m.label,
    'Food (€)': round(m.food),       'Food (%)': `${m.pctFood.toFixed(1)} %`,
    'Alcool (€)': round(m.bev20),    'Alcool (%)': `${m.pctBev20.toFixed(1)} %`,
    'Soft (€)': round(m.bev10),      'Soft (%)': `${m.pctBev10.toFixed(1)} %`,
    'Autres (€)': round(m.autre),    'Autres (%)': `${m.pctAutre.toFixed(1)} %`,
    'Total service (€)': round(m.ttc),
    'Total service (%)': `${m.pctTotal.toFixed(1)} %`,
  }))
  out.push({
    Service: 'Total',
    'Food (€)': round(matrix.reduce((s, m) => s + m.food, 0)),
    'Food (%)': `${matrix.reduce((s, m) => s + m.pctFood, 0).toFixed(1)} %`,
    'Alcool (€)': round(matrix.reduce((s, m) => s + m.bev20, 0)),
    'Alcool (%)': `${matrix.reduce((s, m) => s + m.pctBev20, 0).toFixed(1)} %`,
    'Soft (€)': round(matrix.reduce((s, m) => s + m.bev10, 0)),
    'Soft (%)': `${matrix.reduce((s, m) => s + m.pctBev10, 0).toFixed(1)} %`,
    'Autres (€)': round(matrix.reduce((s, m) => s + m.autre, 0)),
    'Autres (%)': `${matrix.reduce((s, m) => s + m.pctAutre, 0).toFixed(1)} %`,
    'Total service (€)': round(totalCaTtc),
    'Total service (%)': '100 %',
  })
  return out
}

// PR 6 — Tableau jour × série quand mode split actif
export function buildTableauJourJourSplitSheetRows(daysBySerieEntries, splitByLieu, splitByService) {
  if (!daysBySerieEntries) return []
  // daysBySerieEntries = [[serieKey, days[]], …] — agrège chaque day déjà
  // dérivé par série. On reconstruit une row par (date × série).
  const out = []
  for (const [serie, days] of daysBySerieEntries) {
    for (const d of days) {
      if (!d.hasData) continue
      out.push({
        Date: d.iso,
        ...(splitByLieu || splitByService ? { Série: serie } : {}),
        Couverts: d.couvertsTot || 0,
        'CA Food': round(d.food),
        'CA Alcool': round(d.bev_20),
        'CA Soft': round(d.bev_10),
        Autres: round(d.autre),
        'CA Total': round(d.caTot),
        'Ticket moyen': d.tm != null ? round2(d.tm) : '',
      })
    }
  }
  return out.sort((a, b) => {
    if (a.Date !== b.Date) return a.Date.localeCompare(b.Date)
    return (a['Série'] || '').localeCompare(b['Série'] || '', 'fr')
  })
}

export function buildMixSheetRows(segments) {
  return segments.map((s) => ({
    Catégorie: s.label,
    'CA TTC': round(s.value),
    'Part (%)': `${s.pct.toFixed(1)} %`,
  }))
}

export function buildTopBottomSheetRows(topBottom) {
  const fmt = (d, group) => ({
    Groupe: group,
    Date: d.iso,
    Couverts: d.couvertsTot || 0,
    'CA TTC': round(d.caTot),
    'Ticket moyen': d.tm != null ? round2(d.tm) : '',
  })
  return [
    ...topBottom.top.map((d) => fmt(d, 'Top')),
    ...topBottom.bottom.map((d) => fmt(d, 'Bottom')),
  ]
}

export function buildTableauJourJourSheetRows(daysWithBudget) {
  return daysWithBudget.map((d) => ({
    Date: d.iso,
    'Couv. midi': d.lunchCouverts || 0,
    'Couv. soir': d.dinnerCouverts || 0,
    'CA Food': round(d.food),
    'CA Alcool': round(d.bev_20),
    'CA Soft': round(d.bev_10),
    Autres: round(d.autre),
    'CA Total': round(d.caTot),
    'Budget': round(d.budget || 0),
    'Δ Budget': round((d.caTot || 0) - (d.budget || 0)),
    'Ticket moyen': d.tm != null ? round2(d.tm) : '',
  }))
}

// ── Builders Marges (PR 5) ──────────────────────────────────────────────────

export function buildMargesKpisSheetRows({ margesTotals, nbFichesAvecCout }) {
  return [
    { KPI: 'Food cost moyen (pondéré ventes)', Valeur: margesTotals.foodCostPct != null ? `${margesTotals.foodCostPct.toFixed(1)} %` : '—' },
    { KPI: 'Marge brute (€)',                  Valeur: margesTotals.margeBrute != null ? round(margesTotals.margeBrute) : '—' },
    { KPI: 'Marge brute (%)',                  Valeur: margesTotals.margePct != null ? `${margesTotals.margePct.toFixed(1)} %` : '—' },
    { KPI: 'Coût matière (€)',                 Valeur: margesTotals.coutMatiere != null ? round(margesTotals.coutMatiere) : '—' },
    { KPI: 'CA HT couvert par les fiches',     Valeur: round(margesTotals.caAvecCout || 0) },
    { KPI: 'Fiches avec coût matière',         Valeur: nbFichesAvecCout },
  ]
}

export function buildCaParFicheSheetRows(margesLignes) {
  return margesLignes.map((L) => ({
    Désignation: L.designation,
    Catégorie: L.categorie ?? '',
    'Qté vendue': L.quantiteVendue,
    'CA HT': round(L.caNet),
    'Coût matière': L.coutMatiere != null ? round(L.coutMatiere) : '',
    'Marge brute': L.margeBrute != null ? round(L.margeBrute) : '',
    'Marge (%)': L.margePct != null ? `${L.margePct.toFixed(1)} %` : '',
  }))
}

export function buildConsoIngredientSheetRows(consoLignes) {
  return consoLignes.map((L) => ({
    Ingrédient: L.nom,
    'Qté théorique': round2(L.qteTotale),
    Unité: L.unite,
  }))
}

export function buildChartsMargesSheetRows(margesChartData) {
  return margesChartData.map((d) => ({
    Date: d.date,
    'CA HT': d.ca,
    'Coût matière': d.cout,
    Marge: round((d.ca || 0) - (d.cout || 0)),
  }))
}

// ─── Assemblage du workbook ─────────────────────────────────────────────────

// `visibleIds` : Set des ids de widgets effectivement affichés (le bouton
// export ne dump que ce que l'user voit).
//
// Renvoie un objet XLSX workbook (testable) — le caller fait XLSX.writeFile.
export function buildAnalysesWorkbook(opts) {
  const {
    visibleIds, periode, dateDebut, dateFin, comparaison, lieuLabel, service, joursLabel,
    totals, comparisonTotals, comparisonLabel, periodBudget,
    buckets, granularity, perfWeekday, mix, topBottom, daysWithBudget,
    // PR 5 — données marges (peuvent être absentes si aucun widget marges visible)
    margesTotals, margesLignes, consoLignes, margesChartData,
    // PR 6 — split lieu/service
    isSplit, splitByLieu, splitByService,
    bucketsMultiCa, bucketsMultiCouverts, perfMulti,
    mixServiceMatrix, daysBySerieEntries,
  } = opts

  const wb = XLSX.utils.book_new()

  // Onglet 1 : Période & filtres (toujours présent)
  const periodSheet = XLSX.utils.json_to_sheet(buildPeriodSheetRows({
    periode, dateDebut, dateFin, comparaison, lieuLabel, service, joursLabel, granularity,
  }))
  XLSX.utils.book_append_sheet(wb, periodSheet, 'Période & filtres')

  // Onglet 2 : KPIs (si au moins un KPI visible)
  const anyKpiVisible = ['kpi-couverts', 'kpi-ca-ttc', 'kpi-ca-ht', 'kpi-tm', 'kpi-ecart-budget-pct']
    .some((id) => visibleIds.has(id))
  if (anyKpiVisible) {
    const sheet = XLSX.utils.json_to_sheet(buildKpiSheetRows({
      totals, comparisonTotals, comparisonLabel, periodBudget,
    }))
    XLSX.utils.book_append_sheet(wb, sheet, 'KPIs')
  }

  // Onglet "Marges KPIs" si au moins un KPI marges visible
  const anyMargesKpi = ['kpi-food-cost-moyen', 'kpi-marge-brute'].some((id) => visibleIds.has(id))
  if (anyMargesKpi && margesTotals) {
    const nbFichesAvecCout = (margesLignes || []).filter((L) => L.coutMatiere != null).length
    const sheet = XLSX.utils.json_to_sheet(buildMargesKpisSheetRows({ margesTotals, nbFichesAvecCout }))
    XLSX.utils.book_append_sheet(wb, sheet, 'Marges KPIs')
  }

  // Sections : un onglet par widget visible. En mode split, on bascule sur
  // les variantes multi-séries qui ajoutent une colonne "Série" plutôt que
  // de dupliquer l'onglet — l'user récupère exactement ce qu'il voit à l'écran.
  const sectionBuilders = [
    { id: 'section-evolution-ca',       name: 'Évolution CA',
      build: () => isSplit ? buildEvolutionCaMultiSheetRows(bucketsMultiCa) : buildEvolutionCaSheetRows(buckets) },
    { id: 'section-evolution-couverts', name: 'Évolution couverts',
      build: () => isSplit ? buildEvolutionCouvertsMultiSheetRows(bucketsMultiCouverts) : buildEvolutionCouvertsSheetRows(buckets) },
    { id: 'section-perf-jour-semaine',  name: 'Perf jour semaine',
      build: () => isSplit ? buildPerfJourSemaineMultiSheetRows(perfMulti) : buildPerfJourSemaineSheetRows(perfWeekday) },
    { id: 'section-mix-food-bev',       name: 'Mix Food-Bev',
      build: () => buildMixSheetRows(mix) },
    // PR 6 — onglet Mix détaillé ajouté en sus quand le mode est utile
    { id: 'section-mix-food-bev',       name: 'Mix détaillé service',
      build: () => buildMixDetailleSheetRows(mixServiceMatrix, totals.caTtc) },
    { id: 'section-top-bottom-jours',   name: 'Top et Bottom jours',
      build: () => buildTopBottomSheetRows(topBottom) },
    { id: 'section-tableau-jour-jour',  name: 'Tableau jour par jour',
      build: () => isSplit
        ? buildTableauJourJourSplitSheetRows(daysBySerieEntries, splitByLieu, splitByService)
        : buildTableauJourJourSheetRows(daysWithBudget) },
    // PR 5 — sections marges
    { id: 'section-charts-marges',      name: 'Marges - Évolution',    build: () => buildChartsMargesSheetRows(margesChartData || []) },
    { id: 'section-ca-par-fiche',       name: 'CA par plat',           build: () => buildCaParFicheSheetRows(margesLignes || []) },
    { id: 'section-conso-ingredient',   name: 'Conso ingrédients',     build: () => buildConsoIngredientSheetRows(consoLignes || []) },
  ]
  for (const b of sectionBuilders) {
    if (!visibleIds.has(b.id)) continue
    const rows = b.build()
    if (!rows || rows.length === 0) continue
    const sheet = XLSX.utils.json_to_sheet(rows)
    XLSX.utils.book_append_sheet(wb, sheet, b.name)
  }

  return wb
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function round(n) {
  if (n == null || isNaN(n)) return 0
  return Math.round(n * 100) / 100
}

function round2(n) {
  if (n == null || isNaN(n)) return 0
  return Math.round(n * 100) / 100
}

function computeDelta(current, target, label) {
  if (target == null || current == null) return null
  const delta = current - target
  const pct = target !== 0 ? (delta / target) * 100 : null
  return { delta: round(delta), pct, label: label || '' }
}

function formatDateTime(d) {
  return d.toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

// Construit un nom de fichier safe avec dates de la période.
export function buildFilename(dateDebut, dateFin) {
  return `analyses-ca_${dateDebut}_${dateFin}.xlsx`
}
