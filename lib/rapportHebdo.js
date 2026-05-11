// Helpers de calcul pour le rapport hebdomadaire (page /controle-gestion/
// ventes/rapport-hebdo). Reproduit les sections du mail récap historique :
// CA TTC réel vs budget, tickets moyens par lieu × service, mix Food/Bev,
// couverts par service, tableau couverts jour-par-jour.
//
// Pas de React ni Supabase ici : on prend les rows brutes en entrée et on
// renvoie des objets dérivés (testable, réutilisable côté export HTML).

import { TVA_FOOD, TVA_BEV_20, TVA_BEV_10, TVA_AUTRE } from './caAnalyses'

// ── Constantes ─────────────────────────────────────────────────────────────

const JOURS_FR_LONG = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi']
const MOIS_LABEL_FR = [
  '', 'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
]

function jsWeekdayToIso(jsWeekday) {
  return jsWeekday === 0 ? 7 : jsWeekday
}

function fromIso(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function toIso(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

// Itère chaque date ISO entre debut et fin inclus.
function* eachDayIso(debut, fin) {
  const start = fromIso(debut)
  const end = fromIso(fin)
  const cur = new Date(start)
  while (cur <= end) {
    yield {
      iso: toIso(cur),
      jsWeekday: cur.getDay(),
      isoJds: jsWeekdayToIso(cur.getDay()),
      day: cur.getDate(),
    }
    cur.setDate(cur.getDate() + 1)
  }
}

// ── Filtrage ────────────────────────────────────────────────────────────────

export function filterCaJournalier(rows, debut, fin) {
  return (rows || []).filter((r) => r.jour >= debut && r.jour <= fin)
}

// ── Section 1 : CA TTC réel vs budget ──────────────────────────────────────

// Construit le budget journalier total par jour ISO pour le mois donné.
// Override mensuel (mois = m) prioritaire sur le défaut (mois = NULL) au
// niveau de la cellule (jds, lieu, service). Mêmes règles que PR 1.
function budgetByIsoJdsForMonth(budgetRows, annee, mois) {
  const cellMap = new Map() // key = `${jds}_${lieu}_${svc}`
  for (const b of (budgetRows || [])) {
    if (b.annee != null && Number(b.annee) !== Number(annee)) continue
    const key = `${b.jour_semaine}_${b.lieu_service_id}_${b.service}`
    const isOverride = b.mois === mois
    const existing = cellMap.get(key)
    if (isOverride) {
      cellMap.set(key, b)
    } else if (!existing) {
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

// Renvoie le budget cumulé sur [debut, fin] (itération calendaire stricte,
// on n'applique pas les overrides nb_jours par souci de simplicité PR A).
export function periodBudget(budgetRows, debut, fin) {
  // Cache par mois pour éviter le calcul N fois
  const cache = new Map()
  const getMap = (annee, mois) => {
    const key = `${annee}_${mois}`
    if (!cache.has(key)) cache.set(key, budgetByIsoJdsForMonth(budgetRows, annee, mois))
    return cache.get(key)
  }
  let total = 0
  for (const d of eachDayIso(debut, fin)) {
    const date = fromIso(d.iso)
    const map = getMap(date.getFullYear(), date.getMonth() + 1)
    total += map.get(d.isoJds) || 0
  }
  return total
}

// Sommes réel et budget sur une période. Renvoie { real, budget, ratio }.
export function caTtcVsBudget(caRows, budgetRows, debut, fin) {
  const filtered = filterCaJournalier(caRows, debut, fin)
  let real = 0
  for (const r of filtered) {
    real += Number(r.ca_food || 0) + Number(r.ca_bev_20 || 0) + Number(r.ca_bev_10 || 0) + Number(r.ca_autre || 0)
  }
  const budget = periodBudget(budgetRows, debut, fin)
  const delta = real - budget
  const ratio = budget > 0 ? (delta / budget) * 100 : null
  return { real, budget, delta, ratio }
}

// Cumul mois (1er du mois au jour de fin). Utilise le mois de `fin`.
export function caTtcCumulMois(caRows, budgetRows, fin) {
  const finDate = fromIso(fin)
  const debut = `${finDate.getFullYear()}-${String(finDate.getMonth() + 1).padStart(2, '0')}-01`
  return caTtcVsBudget(caRows, budgetRows, debut, fin)
}

// ── Section 2 : Tickets moyens par lieu × service ──────────────────────────

// Renvoie [{ lieu_label, service, real_tm, budget_tm, ratio }] trié.
// `lieuxMap` : Map<lieu_service_id, label>
export function tmParLieuService(caRows, budgetRows, lieuxMap, debut, fin) {
  const filtered = filterCaJournalier(caRows, debut, fin)
  // Réel : agrège couverts et CA par (lieu, service)
  const realMap = new Map()
  for (const r of filtered) {
    const key = `${r.lieu_service_id}_${r.service}`
    if (!realMap.has(key)) realMap.set(key, { couverts: 0, ca: 0 })
    const acc = realMap.get(key)
    acc.couverts += Number(r.couverts || 0)
    acc.ca += Number(r.ca_food || 0) + Number(r.ca_bev_20 || 0) + Number(r.ca_bev_10 || 0) + Number(r.ca_autre || 0)
  }
  // Budget : agrège sur chaque jour ouvré du période × jds matchant
  const budgetMap = new Map() // key = `${lieu}_${svc}` → { couverts_cible, ca_cible }
  const cacheBudgetByMonth = new Map()
  const getCellsForMonth = (annee, mois) => {
    const key = `${annee}_${mois}`
    if (!cacheBudgetByMonth.has(key)) {
      const cells = new Map() // key = `${jds}_${lieu}_${svc}`
      for (const b of (budgetRows || [])) {
        if (b.annee != null && Number(b.annee) !== Number(annee)) continue
        const ck = `${b.jour_semaine}_${b.lieu_service_id}_${b.service}`
        const isOverride = b.mois === mois
        if (isOverride) cells.set(ck, b)
        else if (!cells.has(ck)) cells.set(ck, b)
      }
      cacheBudgetByMonth.set(key, cells)
    }
    return cacheBudgetByMonth.get(key)
  }
  for (const d of eachDayIso(debut, fin)) {
    const date = fromIso(d.iso)
    const cells = getCellsForMonth(date.getFullYear(), date.getMonth() + 1)
    for (const cell of cells.values()) {
      if (cell.jour_semaine !== d.isoJds) continue
      const key = `${cell.lieu_service_id}_${cell.service}`
      if (!budgetMap.has(key)) budgetMap.set(key, { couverts_cible: 0, ca_cible: 0 })
      const acc = budgetMap.get(key)
      acc.couverts_cible += Number(cell.couverts_cible || 0)
      acc.ca_cible +=
        Number(cell.ca_food_cible || 0) +
        Number(cell.ca_bev_20_cible || 0) +
        Number(cell.ca_bev_10_cible || 0) +
        Number(cell.ca_autre_cible || 0)
    }
  }
  // Construit la sortie : 1 ligne par (lieu, service) qui apparaît dans
  // réel ou budget.
  const keys = new Set([...realMap.keys(), ...budgetMap.keys()])
  const out = []
  for (const key of keys) {
    const [lieuId, service] = key.split('_')
    const real = realMap.get(key) || { couverts: 0, ca: 0 }
    const budget = budgetMap.get(key) || { couverts_cible: 0, ca_cible: 0 }
    const realTm = real.couverts > 0 ? real.ca / real.couverts : null
    const budgetTm = budget.couverts_cible > 0 ? budget.ca_cible / budget.couverts_cible : null
    const delta = realTm != null && budgetTm != null ? realTm - budgetTm : null
    const ratio = realTm != null && budgetTm != null && budgetTm > 0 ? (delta / budgetTm) * 100 : null
    out.push({
      lieu_id: lieuId,
      lieu_label: lieuxMap.get(lieuId) || lieuId,
      service,
      real_couverts: real.couverts,
      real_ca: real.ca,
      real_tm: realTm,
      budget_couverts: budget.couverts_cible,
      budget_ca: budget.ca_cible,
      budget_tm: budgetTm,
      delta_tm: delta,
      ratio_tm: ratio,
    })
  }
  // Tri : par label lieu puis service (lunch < dinner)
  out.sort((a, b) => {
    const cmp = (a.lieu_label || '').localeCompare(b.lieu_label || '', 'fr')
    if (cmp !== 0) return cmp
    return a.service === 'lunch' ? -1 : 1
  })
  return out
}

// ── Section 3 : Tickets moyens Food/Beverage par service ───────────────────

// Renvoie { midi: { food, bev, total }, soir: {...}, total: {...} }
// où chaque objet contient { real_tm, budget_tm, ratio }
export function tmFoodBevParService(caRows, budgetRows, debut, fin) {
  const filtered = filterCaJournalier(caRows, debut, fin)
  // Réel par service
  const real = {
    lunch: { couverts: 0, food: 0, bev: 0 },
    dinner: { couverts: 0, food: 0, bev: 0 },
  }
  for (const r of filtered) {
    const svc = r.service === 'lunch' ? 'lunch' : 'dinner'
    real[svc].couverts += Number(r.couverts || 0)
    real[svc].food += Number(r.ca_food || 0)
    real[svc].bev += Number(r.ca_bev_20 || 0) + Number(r.ca_bev_10 || 0)
  }
  // Budget par service — on parcourt les jours du période et on agrège
  const budget = {
    lunch: { couverts: 0, food: 0, bev: 0 },
    dinner: { couverts: 0, food: 0, bev: 0 },
  }
  const cache = new Map()
  for (const d of eachDayIso(debut, fin)) {
    const date = fromIso(d.iso)
    const annee = date.getFullYear()
    const mois = date.getMonth() + 1
    const ck = `${annee}_${mois}`
    let cells = cache.get(ck)
    if (!cells) {
      cells = new Map()
      for (const b of (budgetRows || [])) {
        if (b.annee != null && Number(b.annee) !== Number(annee)) continue
        const k = `${b.jour_semaine}_${b.lieu_service_id}_${b.service}`
        const isOverride = b.mois === mois
        if (isOverride) cells.set(k, b)
        else if (!cells.has(k)) cells.set(k, b)
      }
      cache.set(ck, cells)
    }
    for (const cell of cells.values()) {
      if (cell.jour_semaine !== d.isoJds) continue
      const svc = cell.service === 'lunch' ? 'lunch' : 'dinner'
      budget[svc].couverts += Number(cell.couverts_cible || 0)
      budget[svc].food += Number(cell.ca_food_cible || 0)
      budget[svc].bev += Number(cell.ca_bev_20_cible || 0) + Number(cell.ca_bev_10_cible || 0)
    }
  }
  const make = (real, budget) => {
    const realTmFood = real.couverts > 0 ? real.food / real.couverts : null
    const realTmBev = real.couverts > 0 ? real.bev / real.couverts : null
    const budgetTmFood = budget.couverts > 0 ? budget.food / budget.couverts : null
    const budgetTmBev = budget.couverts > 0 ? budget.bev / budget.couverts : null
    return {
      real_tm_food: realTmFood,
      real_tm_bev: realTmBev,
      budget_tm_food: budgetTmFood,
      budget_tm_bev: budgetTmBev,
      delta_food: realTmFood != null && budgetTmFood != null ? realTmFood - budgetTmFood : null,
      delta_bev: realTmBev != null && budgetTmBev != null ? realTmBev - budgetTmBev : null,
      ratio_food: realTmFood != null && budgetTmFood != null && budgetTmFood > 0
        ? ((realTmFood - budgetTmFood) / budgetTmFood) * 100 : null,
      ratio_bev: realTmBev != null && budgetTmBev != null && budgetTmBev > 0
        ? ((realTmBev - budgetTmBev) / budgetTmBev) * 100 : null,
    }
  }
  const midi = make(real.lunch, budget.lunch)
  const soir = make(real.dinner, budget.dinner)
  const total = make(
    { couverts: real.lunch.couverts + real.dinner.couverts, food: real.lunch.food + real.dinner.food, bev: real.lunch.bev + real.dinner.bev },
    { couverts: budget.lunch.couverts + budget.dinner.couverts, food: budget.lunch.food + budget.dinner.food, bev: budget.lunch.bev + budget.dinner.bev },
  )
  return { midi, soir, total }
}

// ── Section 4 : Mix Food/Bev en % du TM ────────────────────────────────────

// Renvoie { midi: { food_pct, bev_pct }, soir, total } basé sur le réel.
export function mixFoodBev(tmFoodBev) {
  const calcPct = (svc) => {
    const food = svc.real_tm_food || 0
    const bev = svc.real_tm_bev || 0
    const total = food + bev
    if (total === 0) return { food_pct: null, bev_pct: null }
    return { food_pct: (food / total) * 100, bev_pct: (bev / total) * 100 }
  }
  return {
    midi: calcPct(tmFoodBev.midi),
    soir: calcPct(tmFoodBev.soir),
    total: calcPct(tmFoodBev.total),
  }
}

// ── Section 5 : Couverts midi/soir ─────────────────────────────────────────

export function couvertsParService(caRows, budgetRows, debut, fin) {
  const filtered = filterCaJournalier(caRows, debut, fin)
  let realLunch = 0
  let realDinner = 0
  for (const r of filtered) {
    if (r.service === 'lunch') realLunch += Number(r.couverts || 0)
    else realDinner += Number(r.couverts || 0)
  }
  // Budget : somme couverts_cible par service sur la période
  let budgetLunch = 0
  let budgetDinner = 0
  const cache = new Map()
  for (const d of eachDayIso(debut, fin)) {
    const date = fromIso(d.iso)
    const annee = date.getFullYear()
    const mois = date.getMonth() + 1
    const ck = `${annee}_${mois}`
    let cells = cache.get(ck)
    if (!cells) {
      cells = new Map()
      for (const b of (budgetRows || [])) {
        if (b.annee != null && Number(b.annee) !== Number(annee)) continue
        const k = `${b.jour_semaine}_${b.lieu_service_id}_${b.service}`
        const isOverride = b.mois === mois
        if (isOverride) cells.set(k, b)
        else if (!cells.has(k)) cells.set(k, b)
      }
      cache.set(ck, cells)
    }
    for (const cell of cells.values()) {
      if (cell.jour_semaine !== d.isoJds) continue
      if (cell.service === 'lunch') budgetLunch += Number(cell.couverts_cible || 0)
      else budgetDinner += Number(cell.couverts_cible || 0)
    }
  }
  const make = (real, budget) => ({
    real,
    budget,
    delta: real - budget,
    ratio: budget > 0 ? ((real - budget) / budget) * 100 : null,
  })
  return {
    midi: make(realLunch, budgetLunch),
    soir: make(realDinner, budgetDinner),
    total: make(realLunch + realDinner, budgetLunch + budgetDinner),
  }
}

// ── Section 6 : Couverts jour-par-jour (tableau) ───────────────────────────

// Renvoie [{ iso, jour_fr, midi: {real, budget, delta, ratio}, soir: {...} }, ...]
export function couvertsJourParJour(caRows, budgetRows, debut, fin) {
  const filtered = filterCaJournalier(caRows, debut, fin)
  // Par jour, par service : couverts réels
  const realByDay = new Map()
  for (const r of filtered) {
    if (!realByDay.has(r.jour)) realByDay.set(r.jour, { lunch: 0, dinner: 0 })
    const acc = realByDay.get(r.jour)
    if (r.service === 'lunch') acc.lunch += Number(r.couverts || 0)
    else acc.dinner += Number(r.couverts || 0)
  }
  // Budget par jour : agrège tous les lieux pour ce jour-de-semaine
  const out = []
  const cache = new Map()
  for (const d of eachDayIso(debut, fin)) {
    const date = fromIso(d.iso)
    const annee = date.getFullYear()
    const mois = date.getMonth() + 1
    const ck = `${annee}_${mois}`
    let cells = cache.get(ck)
    if (!cells) {
      cells = new Map()
      for (const b of (budgetRows || [])) {
        if (b.annee != null && Number(b.annee) !== Number(annee)) continue
        const k = `${b.jour_semaine}_${b.lieu_service_id}_${b.service}`
        const isOverride = b.mois === mois
        if (isOverride) cells.set(k, b)
        else if (!cells.has(k)) cells.set(k, b)
      }
      cache.set(ck, cells)
    }
    let budgetLunch = 0
    let budgetDinner = 0
    for (const cell of cells.values()) {
      if (cell.jour_semaine !== d.isoJds) continue
      if (cell.service === 'lunch') budgetLunch += Number(cell.couverts_cible || 0)
      else budgetDinner += Number(cell.couverts_cible || 0)
    }
    const real = realByDay.get(d.iso) || { lunch: 0, dinner: 0 }
    out.push({
      iso: d.iso,
      jour_fr: JOURS_FR_LONG[d.jsWeekday],
      isoJds: d.isoJds,
      midi: {
        real: real.lunch,
        budget: budgetLunch,
        delta: real.lunch - budgetLunch,
        ratio: budgetLunch > 0 ? ((real.lunch - budgetLunch) / budgetLunch) * 100 : null,
      },
      soir: {
        real: real.dinner,
        budget: budgetDinner,
        delta: real.dinner - budgetDinner,
        ratio: budgetDinner > 0 ? ((real.dinner - budgetDinner) / budgetDinner) * 100 : null,
      },
    })
  }
  return out
}

// ── Agrégateur : construit tout le rapport en un appel ─────────────────────

export function buildRapportData({ caRows, budgetRows, lieuxMap, debut, fin }) {
  const ca = caTtcVsBudget(caRows, budgetRows, debut, fin)
  const caMois = caTtcCumulMois(caRows, budgetRows, fin)
  const tmLieux = tmParLieuService(caRows, budgetRows, lieuxMap, debut, fin)
  const tmFb = tmFoodBevParService(caRows, budgetRows, debut, fin)
  const mix = mixFoodBev(tmFb)
  const couverts = couvertsParService(caRows, budgetRows, debut, fin)
  const couvertsJpJ = couvertsJourParJour(caRows, budgetRows, debut, fin)
  return { ca, caMois, tmLieux, tmFb, mix, couverts, couvertsJpJ }
}

// ── Formatters ──────────────────────────────────────────────────────────────

export function formatEur(n) {
  if (n == null || isNaN(n) || n === 0) return '0 €'
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
}

export function formatEur2(n) {
  if (n == null || isNaN(n)) return '—'
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(Math.round(n))
}

export function formatPct(pct) {
  if (pct == null || !isFinite(pct)) return '—'
  const sign = pct > 0 ? '+ ' : pct < 0 ? '- ' : ''
  return `${sign}${Math.abs(pct).toFixed(pct < 1 && pct > -1 ? 1 : 1)} %`
}

export function formatPctSimple(pct) {
  if (pct == null || !isFinite(pct)) return '—'
  return `${pct.toFixed(0)} %`
}

export function formatNombre(n) {
  if (n == null || isNaN(n)) return '0'
  return new Intl.NumberFormat('fr-FR').format(Math.round(n))
}

export function formatDateFr(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return `${String(d).padStart(2, '0')} ${MOIS_LABEL_FR[m]}`
}

export function formatPeriode(debut, fin) {
  if (debut === fin) return `du ${formatDateFr(debut)}`
  const dDeb = fromIso(debut).getDate()
  const dFin = fromIso(fin).getDate()
  const mDeb = fromIso(debut).getMonth() + 1
  const mFin = fromIso(fin).getMonth() + 1
  if (mDeb === mFin) {
    return `du ${String(dDeb).padStart(2, '0')} au ${String(dFin).padStart(2, '0')} ${MOIS_LABEL_FR[mFin]}`
  }
  return `du ${formatDateFr(debut)} au ${formatDateFr(fin)}`
}

// Lundi-dimanche de la semaine courante (ISO : lundi=début)
export function semaineEnCours(today = new Date()) {
  const d = new Date(today)
  const jsWeekday = d.getDay() // 0=dim, 1=lun, ..., 6=sam
  // Lundi de la semaine courante
  const offsetToMonday = jsWeekday === 0 ? -6 : 1 - jsWeekday
  const lundi = new Date(d)
  lundi.setDate(d.getDate() + offsetToMonday)
  const dimanche = new Date(lundi)
  dimanche.setDate(lundi.getDate() + 6)
  return { debut: toIso(lundi), fin: toIso(dimanche) }
}

// Semaine précédente (lundi-dimanche)
export function semainePrecedente(today = new Date()) {
  const { debut, fin } = semaineEnCours(today)
  const debutPrev = new Date(fromIso(debut)); debutPrev.setDate(debutPrev.getDate() - 7)
  const finPrev = new Date(fromIso(fin)); finPrev.setDate(finPrev.getDate() - 7)
  return { debut: toIso(debutPrev), fin: toIso(finPrev) }
}

export { TVA_FOOD, TVA_BEV_20, TVA_BEV_10, TVA_AUTRE, JOURS_FR_LONG, MOIS_LABEL_FR }
