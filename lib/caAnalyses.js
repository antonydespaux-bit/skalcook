// Helpers purs pour la page /controle-gestion/analyses :
// - calcul des bornes de période ("mois en cours", "7j", etc.)
// - agrégation de lignes ca_journalier en totaux (TTC + HT + TM)
// - calcul du budget agrégé sur une plage de dates depuis ca_budgets
//
// Tout est testable sans Supabase ni React : les fonctions prennent les rows
// en entrée et renvoient des objets dérivés.

// ── Constantes ─────────────────────────────────────────────────────────────
// Conversion TTC → HT par catégorie. TVA Food/Soft 10 %, TVA Alcool 20 %.
// "Autre" : TVA inconnue → on assume 10 % (catégorie boutique/divers, le
// plus souvent restauration). Validé pragmatique avec l'utilisateur.
export const TVA_FOOD = 1.10
export const TVA_BEV_20 = 1.20
export const TVA_BEV_10 = 1.10
export const TVA_AUTRE = 1.10

// ── Périodes ────────────────────────────────────────────────────────────────

export function toIsoDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function fromIsoDate(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

// Renvoie { debut, fin } en ISO (YYYY-MM-DD) pour un identifiant de période.
// Périodes ouvertes (mois-en-cours, trimestre, annee) : finissent à `today`
// (le futur n'existe pas en BDD, et ça donne une comparaison budget juste).
// Périodes fermées (mois-precedent) : couvrent l'intégralité du mois.
export function getPeriodDates(periode, today = new Date()) {
  const t = today
  if (periode === 'aujourdhui') {
    return { debut: toIsoDate(t), fin: toIsoDate(t) }
  }
  if (periode === '7j') {
    const start = new Date(t)
    start.setDate(start.getDate() - 6)
    return { debut: toIsoDate(start), fin: toIsoDate(t) }
  }
  if (periode === '30j') {
    const start = new Date(t)
    start.setDate(start.getDate() - 29)
    return { debut: toIsoDate(start), fin: toIsoDate(t) }
  }
  if (periode === 'mois-en-cours') {
    const start = new Date(t.getFullYear(), t.getMonth(), 1)
    return { debut: toIsoDate(start), fin: toIsoDate(t) }
  }
  if (periode === 'mois-precedent') {
    const firstOfThisMonth = new Date(t.getFullYear(), t.getMonth(), 1)
    const lastOfPrevMonth = new Date(firstOfThisMonth.getTime() - 24 * 60 * 60 * 1000)
    const firstOfPrevMonth = new Date(lastOfPrevMonth.getFullYear(), lastOfPrevMonth.getMonth(), 1)
    return { debut: toIsoDate(firstOfPrevMonth), fin: toIsoDate(lastOfPrevMonth) }
  }
  if (periode === 'trimestre') {
    const q = Math.floor(t.getMonth() / 3)
    const start = new Date(t.getFullYear(), q * 3, 1)
    return { debut: toIsoDate(start), fin: toIsoDate(t) }
  }
  if (periode === 'annee') {
    const start = new Date(t.getFullYear(), 0, 1)
    return { debut: toIsoDate(start), fin: toIsoDate(t) }
  }
  // 'custom' : géré par l'appelant (les dates viennent du form)
  return null
}

// Décale une plage de dates d'un nombre d'années (négatif = passé).
export function shiftPeriodByYears({ debut, fin }, years) {
  const shift = (iso) => {
    const d = fromIsoDate(iso)
    d.setFullYear(d.getFullYear() + years)
    return toIsoDate(d)
  }
  return { debut: shift(debut), fin: shift(fin) }
}

// Itère chaque jour ISO de [debut, fin] inclus.
export function* eachDayIso(debut, fin) {
  const start = fromIsoDate(debut)
  const end = fromIsoDate(fin)
  const cur = new Date(start)
  while (cur <= end) {
    yield {
      iso: toIsoDate(cur),
      jsWeekday: cur.getDay(),
      isoJds: cur.getDay() === 0 ? 7 : cur.getDay(),
    }
    cur.setDate(cur.getDate() + 1)
  }
}

// ── Agrégation des ventes ───────────────────────────────────────────────────

// rows : lignes ca_journalier filtrées (par lieu/service côté SQL ou JS).
// Chaque ligne a couverts, ca_food, ca_bev_20, ca_bev_10, ca_autre.
export function aggregateTotals(rows) {
  let couverts = 0, food = 0, bev20 = 0, bev10 = 0, autre = 0
  for (const r of rows) {
    couverts += Number(r.couverts || 0)
    food += Number(r.ca_food || 0)
    bev20 += Number(r.ca_bev_20 || 0)
    bev10 += Number(r.ca_bev_10 || 0)
    autre += Number(r.ca_autre || 0)
  }
  const caTtc = food + bev20 + bev10 + autre
  const caHt = food / TVA_FOOD + bev20 / TVA_BEV_20 + bev10 / TVA_BEV_10 + autre / TVA_AUTRE
  const tm = couverts > 0 ? caTtc / couverts : null
  return { couverts, food, bev20, bev10, autre, caTtc, caHt, tm }
}

// ── Agrégation par jour pour le tableau jour-par-jour ───────────────────────

export function aggregateByDay(rows, debut, fin) {
  const byDay = new Map()
  for (const r of rows) {
    const key = r.jour
    if (!byDay.has(key)) {
      byDay.set(key, {
        lunchCouverts: 0, dinnerCouverts: 0,
        food: 0, bev_20: 0, bev_10: 0, autre: 0,
      })
    }
    const acc = byDay.get(key)
    const cv = Number(r.couverts || 0)
    if (r.service === 'lunch') acc.lunchCouverts += cv
    else acc.dinnerCouverts += cv
    acc.food += Number(r.ca_food || 0)
    acc.bev_20 += Number(r.ca_bev_20 || 0)
    acc.bev_10 += Number(r.ca_bev_10 || 0)
    acc.autre += Number(r.ca_autre || 0)
  }
  const result = []
  for (const d of eachDayIso(debut, fin)) {
    const agg = byDay.get(d.iso) || {
      lunchCouverts: 0, dinnerCouverts: 0,
      food: 0, bev_20: 0, bev_10: 0, autre: 0,
    }
    const couvertsTot = agg.lunchCouverts + agg.dinnerCouverts
    const caTot = agg.food + agg.bev_20 + agg.bev_10 + agg.autre
    result.push({
      iso: d.iso,
      jsWeekday: d.jsWeekday,
      isoJds: d.isoJds,
      ...agg,
      couvertsTot,
      caTot,
      tm: couvertsTot > 0 ? caTot / couvertsTot : null,
      hasData: caTot > 0 || couvertsTot > 0,
    })
  }
  return result
}

// ── Budget ──────────────────────────────────────────────────────────────────

// budgetRows : ca_budgets sur l'année concernée, filtrés (par lieu/service
// côté SQL ou JS), avec mois NULL (défaut) ou mois = monthNum (override).
//
// Renvoie un Map<isoJds (1..7), totalBudgetCible> calculé pour `monthNum`.
// Override prioritaire sur défaut au niveau (jds, lieu, service).
export function budgetByIsoJdsForMonth(budgetRows, monthNum) {
  const cellMap = new Map() // key = `${jds}_${lieu}_${svc}`
  for (const b of budgetRows) {
    const key = `${b.jour_semaine}_${b.lieu_service_id}_${b.service}`
    if (b.mois === monthNum) {
      cellMap.set(key, b)
    } else if (!cellMap.has(key)) {
      cellMap.set(key, b)
    }
  }
  const out = new Map()
  for (const cell of cellMap.values()) {
    const total =
      Number(cell.ca_food_cible || 0) +
      Number(cell.ca_bev_20_cible || 0) +
      Number(cell.ca_bev_10_cible || 0) +
      Number(cell.ca_autre_cible || 0)
    out.set(cell.jour_semaine, (out.get(cell.jour_semaine) || 0) + total)
  }
  return out
}

// Somme des budgets journaliers sur la période [debut, fin].
// budgetRowsByYear : map { [annee]: rows[] } pour gérer les périodes
// chevauchant deux années (ex: décembre → janvier).
export function periodBudgetTotal(budgetRowsByYear, debut, fin) {
  // Cache du Map par (annee, mois) pour éviter de recalculer à chaque jour
  const cache = new Map()
  const getMap = (annee, mois) => {
    const key = `${annee}_${mois}`
    if (!cache.has(key)) {
      cache.set(key, budgetByIsoJdsForMonth(budgetRowsByYear[annee] || [], mois))
    }
    return cache.get(key)
  }
  let total = 0
  for (const d of eachDayIso(debut, fin)) {
    const date = fromIsoDate(d.iso)
    const annee = date.getFullYear()
    const mois = date.getMonth() + 1
    const map = getMap(annee, mois)
    total += map.get(d.isoJds) || 0
  }
  return total
}

// ── Formatters partagés ─────────────────────────────────────────────────────

export function formatEur(n) {
  if (n == null || isNaN(n) || n === 0) return '—'
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
}

export function formatEur2(n) {
  if (n == null || isNaN(n) || n === 0) return '—'
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n)
}

export function formatDeltaEur(n) {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency', currency: 'EUR',
    maximumFractionDigits: 0, signDisplay: 'always',
  }).format(n)
}

export function formatDeltaPct(pct) {
  if (pct == null || !isFinite(pct)) return '—'
  return new Intl.NumberFormat('fr-FR', {
    style: 'percent', maximumFractionDigits: 1, signDisplay: 'always',
  }).format(pct / 100)
}

export function formatNombre(n) {
  if (n == null || isNaN(n)) return '—'
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(n)
}

// ── Construction des objets `comparison` consommés par <KpiCard /> ──────────
// `mode` :
//   - 'success'  → delta favorable (au-dessus de la cible) → vert
//   - 'danger'   → delta défavorable → rouge
//   - 'neutral'  → delta légèrement en-dessous (zone orange)
//   - 'none'     → équivalent / pas d'info → gris
export function buildComparison({ current, target, formatValue, formatDelta, label, higherIsBetter = true }) {
  if (target == null || current == null) return null
  const delta = current - target
  let pct = null
  if (target !== 0) pct = (delta / target) * 100
  const better = higherIsBetter ? delta > 0 : delta < 0
  const worse = higherIsBetter ? delta < 0 : delta > 0
  let mode = 'none'
  if (better) mode = 'success'
  else if (worse) mode = pct != null && pct < -5 ? 'danger' : 'neutral'

  const deltaText = formatDelta(delta)
  const pctText = pct == null ? '' : ` (${formatDeltaPct(pct)})`
  return {
    delta,
    pct,
    deltaLabel: `${deltaText}${pctText} ${label}`,
    mode,
    formattedValue: formatValue ? formatValue(target) : null,
  }
}
