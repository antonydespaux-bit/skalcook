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

// ── Split par dimension (lieu, service, lieu × service) ────────────────────

// Construit la clé d'agrégation d'une row selon les dimensions actives.
// `lieuxLabels` = Map<lieu_service_id, nomAffichable>
function rowSeriesKey(row, splitDims, lieuxLabels) {
  const parts = []
  for (const dim of splitDims) {
    if (dim === 'lieu') parts.push(lieuxLabels?.get(row.lieu_service_id) || row.lieu_service_id || '—')
    else if (dim === 'service') parts.push(row.service === 'lunch' ? 'Déjeuner' : 'Dîner')
  }
  return parts.join(' / ')
}

// Renvoie une Map<serieLabel, totals>. Permet aux widgets de rendre une
// série par dimension active. Si splitDims est vide, renvoie une Map à 1
// entrée (clé '__all__') pour rester homogène avec les widgets multi-séries.
export function aggregateBySerie(rows, splitDims, lieuxLabels) {
  const out = new Map()
  for (const r of rows) {
    const key = splitDims.length === 0 ? '__all__' : rowSeriesKey(r, splitDims, lieuxLabels)
    if (!out.has(key)) out.set(key, { couverts: 0, food: 0, bev20: 0, bev10: 0, autre: 0 })
    const acc = out.get(key)
    acc.couverts += Number(r.couverts || 0)
    acc.food += Number(r.ca_food || 0)
    acc.bev20 += Number(r.ca_bev_20 || 0)
    acc.bev10 += Number(r.ca_bev_10 || 0)
    acc.autre += Number(r.ca_autre || 0)
  }
  // Calcul dérivés (caTtc, caHt, tm) sur chaque entrée
  for (const v of out.values()) {
    v.caTtc = v.food + v.bev20 + v.bev10 + v.autre
    v.caHt = v.food / TVA_FOOD + v.bev20 / TVA_BEV_20 + v.bev10 / TVA_BEV_10 + v.autre / TVA_AUTRE
    v.tm = v.couverts > 0 ? v.caTtc / v.couverts : null
  }
  return out
}

// Construit un breakdown { serie, value, pct } trié sur une métrique donnée.
// `metric` parmi: 'couverts', 'caTtc', 'caHt', 'food', 'bev20', 'bev10', 'autre'
export function buildBreakdown(seriesByGroup, metric) {
  const entries = Array.from(seriesByGroup.entries())
    .map(([serie, totals]) => ({ serie, value: totals[metric] || 0 }))
  const total = entries.reduce((s, e) => s + e.value, 0)
  if (total === 0) return entries.map((e) => ({ ...e, pct: 0 }))
  return entries
    .map((e) => ({ ...e, pct: (e.value / total) * 100 }))
    .sort((a, b) => b.value - a.value)
}

// Mix Food/Bev "détaillé" : matrice (service × catégorie) en %.
// Renvoie [{ service, food, bev20, bev10, autre, ttc, pctFood, pctBev20, ... }]
// + un total pct par cellule par rapport au CA TTC global.
export function mixByService(rows) {
  const totals = { lunch: { food: 0, bev20: 0, bev10: 0, autre: 0 }, dinner: { food: 0, bev20: 0, bev10: 0, autre: 0 } }
  for (const r of rows) {
    const svc = r.service === 'lunch' ? 'lunch' : 'dinner'
    totals[svc].food += Number(r.ca_food || 0)
    totals[svc].bev20 += Number(r.ca_bev_20 || 0)
    totals[svc].bev10 += Number(r.ca_bev_10 || 0)
    totals[svc].autre += Number(r.ca_autre || 0)
  }
  const grandTotal = ['lunch', 'dinner'].reduce(
    (s, svc) => s + totals[svc].food + totals[svc].bev20 + totals[svc].bev10 + totals[svc].autre, 0
  )
  const pct = (v) => grandTotal > 0 ? (v / grandTotal) * 100 : 0
  return ['lunch', 'dinner'].map((svc) => {
    const t = totals[svc]
    const ttc = t.food + t.bev20 + t.bev10 + t.autre
    return {
      service: svc,
      label: svc === 'lunch' ? 'Déjeuner' : 'Dîner',
      food: t.food, bev20: t.bev20, bev10: t.bev10, autre: t.autre, ttc,
      pctFood: pct(t.food), pctBev20: pct(t.bev20),
      pctBev10: pct(t.bev10), pctAutre: pct(t.autre),
      pctTotal: pct(ttc),
    }
  })
}

// Bucket par jour ET par série : utile pour les line charts multi-séries.
// Retourne { buckets: [{ key, label, ['Salle']: 100, ['Privat']: 80, … }], series: [...] }
// où chaque ligne du buckets agrège les jours de tous les groupes au même
// timestamp puis colle une valeur par série dans le même point.
//
// `daysBySerie` : Map<serieLabel, days[]> où days[] est la sortie de aggregateByDay.
export function bucketDaysMultiSeries(daysBySerie, granularity, metric = 'caTot') {
  const series = Array.from(daysBySerie.keys())
  // Pour chaque série, calculer ses buckets
  const seriesBuckets = new Map()
  for (const [serie, days] of daysBySerie.entries()) {
    seriesBuckets.set(serie, bucketDays(days, granularity))
  }
  // Fusionner par bucket key
  const merged = new Map()
  for (const [serie, buckets] of seriesBuckets.entries()) {
    for (const b of buckets) {
      if (!merged.has(b.key)) {
        merged.set(b.key, { key: b.key, label: b.label })
      }
      const value = metric === 'couverts' ? b.couverts : b[metric]
      merged.get(b.key)[serie] = value
    }
  }
  return {
    series,
    buckets: Array.from(merged.values()).sort((a, b) => a.key.localeCompare(b.key)),
  }
}

// Tableau "split" : 1 ligne par (jour × série). Renvoie un array trié par
// (date, série) avec colonnes lieu/service explicites quand applicable.
export function rowsByDayAndSerie(filteredRows, debut, fin, splitDims, lieuxLabels) {
  const map = new Map() // key = `${iso}__${serieKey}`
  for (const r of filteredRows) {
    const parts = []
    if (splitDims.includes('lieu')) parts.push(lieuxLabels.get(r.lieu_service_id) || r.lieu_service_id || '—')
    if (splitDims.includes('service')) parts.push(r.service === 'lunch' ? 'Déjeuner' : 'Dîner')
    const serieKey = parts.join(' / ') || '—'
    const lieuLabel = lieuxLabels.get(r.lieu_service_id) || r.lieu_service_id || '—'
    const serviceLabel = r.service === 'lunch' ? 'Déjeuner' : 'Dîner'
    const key = `${r.jour}__${serieKey}`
    if (!map.has(key)) {
      map.set(key, {
        iso: r.jour, serie: serieKey,
        lieu: lieuLabel, service: serviceLabel,
        couverts: 0, food: 0, bev_20: 0, bev_10: 0, autre: 0,
      })
    }
    const acc = map.get(key)
    acc.couverts += Number(r.couverts || 0)
    acc.food += Number(r.ca_food || 0)
    acc.bev_20 += Number(r.ca_bev_20 || 0)
    acc.bev_10 += Number(r.ca_bev_10 || 0)
    acc.autre += Number(r.ca_autre || 0)
  }
  for (const v of map.values()) {
    v.caTot = v.food + v.bev_20 + v.bev_10 + v.autre
    v.tm = v.couverts > 0 ? v.caTot / v.couverts : null
    const date = fromIsoDate(v.iso)
    v.jsWeekday = date.getDay()
    v.isoJds = v.jsWeekday === 0 ? 7 : v.jsWeekday
    v.hasData = v.caTot > 0 || v.couverts > 0
  }
  // Tri : date ASC puis série ASC
  return Array.from(map.values()).sort((a, b) => {
    if (a.iso !== b.iso) return a.iso.localeCompare(b.iso)
    return a.serie.localeCompare(b.serie, 'fr')
  })
}

// Perf jour-de-semaine multi-séries : pour chaque jour ouvré, valeur moyenne
// par série. Retourne [{ label: 'Lundi', ['Salle']: 150, ['Privat']: 80 }, …]
export function perfByWeekdayMultiSeries(daysBySerie, metric = 'ca') {
  const JOURS_LABELS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']
  const series = Array.from(daysBySerie.keys())
  const result = JOURS_LABELS.map((label, i) => ({ label, isoJds: i + 1 }))
  for (const [serie, days] of daysBySerie.entries()) {
    const perf = perfByWeekday(days)
    perf.forEach((p, i) => {
      const v = metric === 'cv' ? p.cv : p.ca
      result[i][serie] = Math.round(v)
    })
  }
  return { series, data: result }
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

// ── Granularité auto + bucketisation pour les charts d'évolution ───────────

// Choix de granularité automatique selon la longueur de la période :
//   ≤ 31 j  → 'day'    (1 point par jour)
//   ≤ 183 j → 'week'   (1 point par semaine ISO, lundi → dimanche)
//   sinon   → 'month'  (1 point par mois calendaire)
export function pickGranularity(debut, fin) {
  const start = fromIsoDate(debut)
  const end = fromIsoDate(fin)
  const days = Math.floor((end - start) / (24 * 60 * 60 * 1000)) + 1
  if (days <= 31) return 'day'
  if (days <= 183) return 'week'
  return 'month'
}

const MOIS_FR_SHORT = ['Janv.', 'Févr.', 'Mars', 'Avr.', 'Mai', 'Juin', 'Juil.', 'Août', 'Sept.', 'Oct.', 'Nov.', 'Déc.']

// Renvoie la clé ISO du lundi (semaine ISO) du jour donné.
export function isoWeekStart(iso) {
  const d = fromIsoDate(iso)
  const jsWeekday = d.getDay()
  // ISO week starts Monday : reculer (jsWeekday - 1), traiter dimanche=0 comme jour 7
  const offset = jsWeekday === 0 ? 6 : jsWeekday - 1
  d.setDate(d.getDate() - offset)
  return toIsoDate(d)
}

// Agrège la sortie de aggregateByDay() (+ optionnellement un budget journalier
// déjà calculé sur chaque jour via day.budget) en buckets selon la granularité.
//
// Renvoie [{ key, label, caTot, couverts, budget, count }] ordonnés par date.
export function bucketDays(days, granularity) {
  const map = new Map()
  for (const d of days) {
    let key, label
    if (granularity === 'day') {
      key = d.iso
      label = `${d.iso.slice(8)}/${d.iso.slice(5, 7)}`
    } else if (granularity === 'week') {
      key = isoWeekStart(d.iso)
      label = `Sem. ${key.slice(8)}/${key.slice(5, 7)}`
    } else {
      key = d.iso.slice(0, 7) // YYYY-MM
      const monthIdx = Number(key.slice(5, 7)) - 1
      label = MOIS_FR_SHORT[monthIdx] || key
    }
    if (!map.has(key)) {
      map.set(key, { key, label, caTot: 0, couverts: 0, budget: 0, count: 0 })
    }
    const acc = map.get(key)
    acc.caTot += d.caTot || 0
    acc.couverts += d.couvertsTot || 0
    acc.budget += d.budget || 0
    acc.count += 1
  }
  return Array.from(map.values()).sort((a, b) => a.key.localeCompare(b.key))
}

// ── Performance par jour de la semaine ──────────────────────────────────────

const JOURS_LABELS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']

// Moyennes CA / couverts / TM par jour-de-semaine sur la période.
// Ne compte que les jours avec data (hasData) pour éviter de tirer la moyenne
// vers 0 sur les jours fermés.
export function perfByWeekday(days) {
  const buckets = Array.from({ length: 7 }, (_, i) => ({
    isoJds: i + 1,                 // 1 = lundi
    label: JOURS_LABELS[i],
    caTot: 0, couverts: 0, count: 0, ca: 0, cv: 0, tm: null,
  }))
  for (const d of days) {
    if (!d.hasData) continue
    const b = buckets[d.isoJds - 1]
    b.caTot += d.caTot
    b.couverts += d.couvertsTot
    b.count += 1
  }
  for (const b of buckets) {
    b.ca = b.count > 0 ? b.caTot / b.count : 0
    b.cv = b.count > 0 ? b.couverts / b.count : 0
    b.tm = b.couverts > 0 ? b.caTot / b.couverts : null
  }
  return buckets
}

// ── Mix Food / Boissons / Autres ────────────────────────────────────────────

// Renvoie les segments du camembert avec couleurs fixes (palette skalcook
// alignée sur la sémantique du module : Food = principal, Alcool = violet,
// Soft = accent, Autre = orange).
export function mixSegments(totals, c) {
  const total = (totals.food || 0) + (totals.bev20 || 0) + (totals.bev10 || 0) + (totals.autre || 0)
  if (total === 0) return []
  const segments = [
    { id: 'food',  label: 'Food',   value: totals.food  || 0, color: c.principal },
    { id: 'bev20', label: 'Alcool', value: totals.bev20 || 0, color: c.violet },
    { id: 'bev10', label: 'Soft',   value: totals.bev10 || 0, color: c.accent },
    { id: 'autre', label: 'Autres', value: totals.autre || 0, color: c.orange },
  ]
  return segments
    .filter((s) => s.value > 0)
    .map((s) => ({ ...s, pct: (s.value / total) * 100 }))
}

// ── Top / Bottom jours ──────────────────────────────────────────────────────

// Retourne les n meilleurs et n pires jours par CA TTC (ignore les jours
// sans data). `n` peut être surchargé.
export function topBottomDays(days, n = 5) {
  const withData = days.filter((d) => d.hasData)
  const sorted = [...withData].sort((a, b) => b.caTot - a.caTot)
  const top = sorted.slice(0, n)
  const bottom = sorted.slice(-n).reverse() // n derniers, du moins bon vers le moins bon
  return { top, bottom }
}

// ── Budget ──────────────────────────────────────────────────────────────────

// budgetRows : ca_budgets sur l'année concernée, filtrés (par lieu/service
// côté SQL ou JS). Chaque row a soit `mois = null` (défaut annuel) soit
// `mois ∈ 1..12` (override pour ce mois précis).
//
// Renvoie un Map<isoJds (1..7), totalBudgetCible> calculé pour `monthNum`.
// Override mensuel prioritaire sur défaut annuel au niveau (jds, lieu, service).
// Les rows avec un mois différent de monthNum sont ignorées (elles ne
// concernent pas le mois demandé, pas même comme défaut — la version d'avant
// pouvait les attraper accidentellement selon l'ordre d'itération).
export function budgetByIsoJdsForMonth(budgetRows, monthNum) {
  const cellMap = new Map() // key = `${jds}_${lieu}_${svc}` → row choisie

  // Pass 1 : défauts annuels (mois = null). Sert de base.
  for (const b of budgetRows) {
    if (b.mois != null) continue
    const key = `${b.jour_semaine}_${b.lieu_service_id}_${b.service}`
    cellMap.set(key, b)
  }
  // Pass 2 : override pour `monthNum`. Écrase le défaut sur la même clé.
  for (const b of budgetRows) {
    if (b.mois !== monthNum) continue
    const key = `${b.jour_semaine}_${b.lieu_service_id}_${b.service}`
    cellMap.set(key, b)
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

// Budget journalier pour un (iso, [lieu_service_id], [service]). Si une des
// dimensions est null, somme toutes les valeurs sur cette dimension.
// Respecte la priorité override mensuel > défaut au niveau de chaque cellule
// (jds, lieu, service), puis applique le ratio nb_jours_override.
// Utilisé par le tableau jour-par-jour en mode split.
export function dailyBudgetForCell(
  budgetRowsByYear,
  iso,
  lieuServiceId = null,
  service = null,
  overridesByYearMonth = null,
) {
  const date = fromIsoDate(iso)
  const annee = date.getFullYear()
  const mois = date.getMonth() + 1
  const dow = date.getDay()
  const isoJds = dow === 0 ? 7 : dow
  const yearRows = budgetRowsByYear[annee] || []

  // Filtre par jds + lieu (optionnel) + service (optionnel).
  // Comme budgetByIsoJdsForMonth, on fait 2 passes pour qu'une row override
  // d'un autre mois ne pollue pas la cellule par accident.
  const cellMap = new Map() // key = `${lieu}_${service}` → row choisie
  // Pass 1 : défauts annuels
  for (const b of yearRows) {
    if (b.jour_semaine !== isoJds) continue
    if (lieuServiceId != null && b.lieu_service_id !== lieuServiceId) continue
    if (service != null && b.service !== service) continue
    if (b.mois != null) continue
    cellMap.set(`${b.lieu_service_id}_${b.service}`, b)
  }
  // Pass 2 : override pour ce mois précis
  for (const b of yearRows) {
    if (b.jour_semaine !== isoJds) continue
    if (lieuServiceId != null && b.lieu_service_id !== lieuServiceId) continue
    if (service != null && b.service !== service) continue
    if (b.mois !== mois) continue
    cellMap.set(`${b.lieu_service_id}_${b.service}`, b)
  }

  // 3. Somme des cellules sélectionnées
  let budgetParJour = 0
  for (const cell of cellMap.values()) {
    budgetParJour +=
      Number(cell.ca_food_cible || 0) +
      Number(cell.ca_bev_20_cible || 0) +
      Number(cell.ca_bev_10_cible || 0) +
      Number(cell.ca_autre_cible || 0)
  }

  // 4. Ratio override nb_jours si présent
  if (overridesByYearMonth) {
    const override = overridesByYearMonth.get(`${annee}_${mois}_${isoJds}`)
    if (override != null) {
      const naturel = countIsoJdsInMonth(annee, mois, isoJds)
      if (naturel > 0) return budgetParJour * (override / naturel)
    }
  }
  return budgetParJour
}

// Compte le nombre d'occurrences naturel d'un jour-de-semaine (isoJds 1..7)
// dans un mois calendaire entier. Utilisé pour calculer le ratio d'override.
export function countIsoJdsInMonth(annee, mois, isoJds) {
  const daysInMonth = new Date(annee, mois, 0).getDate() // dernier jour
  let count = 0
  for (let d = 1; d <= daysInMonth; d++) {
    const dow = new Date(annee, mois - 1, d).getDay() // 0=dim..6=sam
    const iso = dow === 0 ? 7 : dow
    if (iso === isoJds) count++
  }
  return count
}

// Somme des budgets journaliers sur la période [debut, fin].
// budgetRowsByYear : map { [annee]: rows[] } pour gérer les périodes
// chevauchant deux années (ex: décembre → janvier).
// `isoJdsFilter` (optionnel) : Set<number 1..7> — ne sommer que ces jours-de-semaine.
// `overridesByYearMonth` (optionnel) : Map<`${annee}_${mois}_${jds}`, nb_jours>
//   pour appliquer les fermetures exceptionnelles configurées dans /budgets.
//   Si fourni, scale le budget de chaque (mois, jds) par
//   (override_nb_jours / nb_jours_naturel_du_mois). Quand la plage ne couvre
//   pas le mois entier, le ratio s'applique proportionnellement au nombre de
//   jours du jds présents dans la plage (approximation : on ignore quelle
//   occurrence précise est fermée — pour ça il faudrait un calendrier de
//   fermetures à la date, chantier séparé).
export function periodBudgetTotal(budgetRowsByYear, debut, fin, isoJdsFilter = null, overridesByYearMonth = null) {
  // Cache du Map par (annee, mois) pour éviter de recalculer à chaque jour
  const cache = new Map()
  const getMap = (annee, mois) => {
    const key = `${annee}_${mois}`
    if (!cache.has(key)) {
      cache.set(key, budgetByIsoJdsForMonth(budgetRowsByYear[annee] || [], mois))
    }
    return cache.get(key)
  }

  // Cache du ratio override par (annee, mois, jds). 1 si pas d'override.
  const ratioCache = new Map()
  const getRatio = (annee, mois, jds) => {
    if (!overridesByYearMonth) return 1
    const key = `${annee}_${mois}_${jds}`
    if (ratioCache.has(key)) return ratioCache.get(key)
    const override = overridesByYearMonth.get(key)
    if (override == null) { ratioCache.set(key, 1); return 1 }
    const naturel = countIsoJdsInMonth(annee, mois, jds)
    const r = naturel > 0 ? override / naturel : 1
    ratioCache.set(key, r)
    return r
  }

  let total = 0
  for (const d of eachDayIso(debut, fin)) {
    if (isoJdsFilter && !isoJdsFilter.has(d.isoJds)) continue
    const date = fromIsoDate(d.iso)
    const annee = date.getFullYear()
    const mois = date.getMonth() + 1
    const map = getMap(annee, mois)
    const budgetParJour = map.get(d.isoJds) || 0
    total += budgetParJour * getRatio(annee, mois, d.isoJds)
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
