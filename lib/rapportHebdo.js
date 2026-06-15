// Helpers de calcul pour le rapport hebdomadaire (page /controle-gestion/
// ventes/rapport-hebdo). Reproduit les sections du mail récap historique :
// CA TTC réel vs budget, tickets moyens par lieu × service, mix Food/Bev,
// couverts par service, tableau couverts jour-par-jour.
//
// Pas de React ni Supabase ici : on prend les rows brutes en entrée et on
// renvoie des objets dérivés (testable, réutilisable côté export HTML).

import { TVA_FOOD, TVA_BEV_20, TVA_BEV_10, TVA_AUTRE } from './caAnalyses'
import { buildElectedDatesMap, isCellElectedForDate } from './caJoursHelpers'

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

// Construit le cache cellMap par mois (cellules résolues : override mensuel
// prioritaire sur défaut mois=NULL, au niveau de chaque cellule jds/lieu/svc).
// Réutilisé par toutes les fonctions ci-dessous pour éviter de re-parcourir
// budgetRows à chaque appel.
function buildMonthCellMap(budgetRows, annee, mois) {
  const cellMap = new Map() // key = `${jds}_${lieu}_${svc}`
  for (const b of (budgetRows || [])) {
    if (b.annee != null && Number(b.annee) !== Number(annee)) continue
    // Seule une cellule du mois courant (override) ou un défaut annuel
    // (mois = null) est retenue. Une cellule d'un AUTRE mois précis ne doit
    // jamais servir de fallback, sinon le budget d'un mois fuite sur un autre
    // (ex : budget « Privat » de mai compté en juin).
    if (b.mois !== mois && b.mois != null) continue
    const key = `${b.jour_semaine}_${b.lieu_service_id}_${b.service}`
    const isOverride = b.mois === mois
    const existing = cellMap.get(key)
    if (isOverride) cellMap.set(key, b)
    else if (!existing) cellMap.set(key, b)
  }
  return cellMap
}


// Renvoie le budget cumulé sur [debut, fin].
// `joursFermesIso` (optionnel) : Set<string> de dates ISO à exclure.
// `joursOverrideRows` (optionnel) : rows ca_budget_jours_override. Toutes
// les overrides (par lieu, par service, global) sont traitées via le modèle
// "dates élues" (cf. caJoursHelpers). Une cellule budget concernée par un
// override est comptée uniquement pour les N dernières occurrences du
// jour-de-semaine dans le mois.
export function periodBudget(budgetRows, debut, fin, joursFermesIso = null, joursOverrideRows = null) {
  const electedMap = buildElectedDatesMap(joursOverrideRows)
  const cellCache = new Map()
  const getCells = (annee, mois) => {
    const key = `${annee}_${mois}`
    if (!cellCache.has(key)) cellCache.set(key, buildMonthCellMap(budgetRows, annee, mois))
    return cellCache.get(key)
  }
  let total = 0
  for (const d of eachDayIso(debut, fin)) {
    if (joursFermesIso && joursFermesIso.has(d.iso)) continue
    const date = fromIso(d.iso)
    const annee = date.getFullYear()
    const mois = date.getMonth() + 1
    const cells = getCells(annee, mois)
    for (const cell of cells.values()) {
      if (cell.jour_semaine !== d.isoJds) continue
      if (!isCellElectedForDate(cell, d.iso, annee, mois, electedMap)) continue
      total +=
        Number(cell.ca_food_cible || 0) +
        Number(cell.ca_bev_20_cible || 0) +
        Number(cell.ca_bev_10_cible || 0) +
        Number(cell.ca_autre_cible || 0)
    }
  }
  return total
}

// Sommes réel et budget sur une période. Renvoie { real, budget, ratio }.
export function caTtcVsBudget(caRows, budgetRows, debut, fin, joursFermesIso = null, joursOverrideRows = null) {
  const filtered = filterCaJournalier(caRows, debut, fin)
  let real = 0
  for (const r of filtered) {
    real += Number(r.ca_food || 0) + Number(r.ca_bev_20 || 0) + Number(r.ca_bev_10 || 0) + Number(r.ca_autre || 0)
  }
  const budget = periodBudget(budgetRows, debut, fin, joursFermesIso, joursOverrideRows)
  const delta = real - budget
  const ratio = budget > 0 ? (delta / budget) * 100 : null
  return { real, budget, delta, ratio }
}

// Cumul mois (1er du mois au jour de fin). Utilise le mois de `fin`.
export function caTtcCumulMois(caRows, budgetRows, fin, joursFermesIso = null, joursOverrideRows = null) {
  const finDate = fromIso(fin)
  const debut = `${finDate.getFullYear()}-${String(finDate.getMonth() + 1).padStart(2, '0')}-01`
  return caTtcVsBudget(caRows, budgetRows, debut, fin, joursFermesIso, joursOverrideRows)
}

// ── Section 2 : Tickets moyens par lieu × service ──────────────────────────

// Renvoie [{ lieu_label, service, real_tm, budget_tm, ratio }] trié.
// `lieuxMap` : Map<lieu_service_id, label>
// `joursFermesIso` (optionnel) : Set<string> de dates exclues du budget.
export function tmParLieuService(caRows, budgetRows, lieuxMap, debut, fin, joursFermesIso = null, joursOverrideRows = null) {
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
  // Budget : agrège sur chaque jour ouvré du période × jds matchant, en
  // respectant les overrides (modèle dates élues unifié).
  const electedMap = buildElectedDatesMap(joursOverrideRows)
  const budgetMap = new Map() // key = `${lieu}_${svc}` → { couverts_cible, ca_cible }
  const cacheBudgetByMonth = new Map()
  const getCellsForMonth = (annee, mois) => {
    const key = `${annee}_${mois}`
    if (!cacheBudgetByMonth.has(key)) cacheBudgetByMonth.set(key, buildMonthCellMap(budgetRows, annee, mois))
    return cacheBudgetByMonth.get(key)
  }
  for (const d of eachDayIso(debut, fin)) {
    if (joursFermesIso && joursFermesIso.has(d.iso)) continue
    const date = fromIso(d.iso)
    const annee = date.getFullYear()
    const mois = date.getMonth() + 1
    const cells = getCellsForMonth(annee, mois)
    for (const cell of cells.values()) {
      if (cell.jour_semaine !== d.isoJds) continue
      if (!isCellElectedForDate(cell, d.iso, annee, mois, electedMap)) continue
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
    // Skip les (lieu, service) sans aucun couvert réel ni budget
    // (lieu marqué `couverts_indicatifs` côté lieux_service — son CA
    // est compté ailleurs mais sa ligne TM n'a pas de sens ici).
    if (real.couverts === 0 && budget.couverts_cible === 0) continue
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
export function tmFoodBevParService(caRows, budgetRows, debut, fin, joursFermesIso = null, joursOverrideRows = null) {
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
  // Budget par service — on parcourt les jours du période et on agrège,
  // en respectant les overrides (modèle dates élues unifié).
  const electedMap = buildElectedDatesMap(joursOverrideRows)
  const budget = {
    lunch: { couverts: 0, food: 0, bev: 0 },
    dinner: { couverts: 0, food: 0, bev: 0 },
  }
  const cache = new Map()
  for (const d of eachDayIso(debut, fin)) {
    if (joursFermesIso && joursFermesIso.has(d.iso)) continue
    const date = fromIso(d.iso)
    const annee = date.getFullYear()
    const mois = date.getMonth() + 1
    const ck = `${annee}_${mois}`
    let cells = cache.get(ck)
    if (!cells) {
      cells = buildMonthCellMap(budgetRows, annee, mois)
      cache.set(ck, cells)
    }
    for (const cell of cells.values()) {
      if (cell.jour_semaine !== d.isoJds) continue
      if (!isCellElectedForDate(cell, d.iso, annee, mois, electedMap)) continue
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
//
// Le « total » est volontairement la MOYENNE ARITHMÉTIQUE des % midi et soir,
// PAS la moyenne pondérée par les volumes. Raison : l'utilisateur recalcule
// souvent à la main `(% midi + % soir) / 2` et la moyenne pondérée donne un
// chiffre différent (tirée vers le service avec le plus de volume — souvent
// le soir en restauration). Ça crée de la confusion. La moyenne arithmétique
// matche le calcul intuitif et reste cohérente avec la lecture du rapport.
//
// Trade-off assumé : ce n'est pas le ratio comptable strict du CA total
// (qui serait food_total / (food_total + bev_total)), mais c'est la
// convention attendue par l'utilisateur.
export function mixFoodBev(tmFoodBev) {
  const calcPct = (svc) => {
    const food = svc.real_tm_food || 0
    const bev = svc.real_tm_bev || 0
    const total = food + bev
    if (total === 0) return { food_pct: null, bev_pct: null }
    return { food_pct: (food / total) * 100, bev_pct: (bev / total) * 100 }
  }
  const midi = calcPct(tmFoodBev.midi)
  const soir = calcPct(tmFoodBev.soir)
  // Moyenne arithmétique des deux services pour le total. Si un service n'a
  // pas de TM (couverts = 0), on retombe sur l'autre service seul.
  let totalFoodPct = null
  let totalBevPct = null
  if (midi.food_pct != null && soir.food_pct != null) {
    totalFoodPct = (midi.food_pct + soir.food_pct) / 2
    totalBevPct = (midi.bev_pct + soir.bev_pct) / 2
  } else if (midi.food_pct != null) {
    totalFoodPct = midi.food_pct
    totalBevPct = midi.bev_pct
  } else if (soir.food_pct != null) {
    totalFoodPct = soir.food_pct
    totalBevPct = soir.bev_pct
  }
  return {
    midi,
    soir,
    total: { food_pct: totalFoodPct, bev_pct: totalBevPct },
  }
}

// ── Section 5 : Couverts midi/soir ─────────────────────────────────────────

export function couvertsParService(caRows, budgetRows, debut, fin, joursFermesIso = null, joursOverrideRows = null) {
  const filtered = filterCaJournalier(caRows, debut, fin)
  let realLunch = 0
  let realDinner = 0
  for (const r of filtered) {
    if (r.service === 'lunch') realLunch += Number(r.couverts || 0)
    else realDinner += Number(r.couverts || 0)
  }
  // Budget : somme couverts_cible par service sur la période, en respectant
  // les overrides (modèle dates élues unifié).
  const electedMap = buildElectedDatesMap(joursOverrideRows)
  let budgetLunch = 0
  let budgetDinner = 0
  const cache = new Map()
  for (const d of eachDayIso(debut, fin)) {
    if (joursFermesIso && joursFermesIso.has(d.iso)) continue
    const date = fromIso(d.iso)
    const annee = date.getFullYear()
    const mois = date.getMonth() + 1
    const ck = `${annee}_${mois}`
    let cells = cache.get(ck)
    if (!cells) {
      cells = buildMonthCellMap(budgetRows, annee, mois)
      cache.set(ck, cells)
    }
    for (const cell of cells.values()) {
      if (cell.jour_semaine !== d.isoJds) continue
      if (!isCellElectedForDate(cell, d.iso, annee, mois, electedMap)) continue
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
// joursFermesIso : Set<string> de dates pour lesquelles on force budget=0
// (fermeture hebdo ou date spécifique marquée sur Budgets CA).
export function couvertsJourParJour(caRows, budgetRows, debut, fin, joursFermesIso = null, joursOverrideRows = null) {
  const filtered = filterCaJournalier(caRows, debut, fin)
  // Par jour, par service : couverts réels
  const realByDay = new Map()
  for (const r of filtered) {
    if (!realByDay.has(r.jour)) realByDay.set(r.jour, { lunch: 0, dinner: 0 })
    const acc = realByDay.get(r.jour)
    if (r.service === 'lunch') acc.lunch += Number(r.couverts || 0)
    else acc.dinner += Number(r.couverts || 0)
  }
  // Budget par jour : agrège tous les lieux pour ce jour-de-semaine, en
  // respectant les overrides (modèle dates élues unifié). Une cellule
  // soumise à un override n'est comptée que pour les dates "ouvertes"
  // (par défaut N dernières occurrences du jds dans le mois).
  const electedMap = buildElectedDatesMap(joursOverrideRows)
  const out = []
  const cache = new Map()
  for (const d of eachDayIso(debut, fin)) {
    const date = fromIso(d.iso)
    const annee = date.getFullYear()
    const mois = date.getMonth() + 1
    const ck = `${annee}_${mois}`
    let cells = cache.get(ck)
    if (!cells) {
      cells = buildMonthCellMap(budgetRows, annee, mois)
      cache.set(ck, cells)
    }
    let budgetLunch = 0
    let budgetDinner = 0
    // Si jour fermé : on force le budget à 0 pour rendre la cellule
    // visuellement neutre (real et budget tous deux à 0 → écart non
    // pénalisant).
    if (!(joursFermesIso && joursFermesIso.has(d.iso))) {
      for (const cell of cells.values()) {
        if (cell.jour_semaine !== d.isoJds) continue
        if (!isCellElectedForDate(cell, d.iso, annee, mois, electedMap)) continue
        if (cell.service === 'lunch') budgetLunch += Number(cell.couverts_cible || 0)
        else budgetDinner += Number(cell.couverts_cible || 0)
      }
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

// ── Section 7 : Autres CA (privatisations, frais, etc.) ───────────────────
//
// Le champ `ca_autre` est déjà inclus dans le total CA TTC (voir
// caTtcVsBudget). Ces helpers permettent en plus de l'isoler pour le
// montrer explicitement dans le rapport — pratique pour comprendre d'où
// vient un écart au budget (ex : 600 € de privatisation un mercredi à La
// Cave).

// Total ca_autre réel sur la période [debut, fin].
export function autreCaSurPeriode(caRows, debut, fin) {
  const filtered = filterCaJournalier(caRows, debut, fin)
  let total = 0
  for (const r of filtered) total += Number(r.ca_autre || 0)
  return total
}

// Cumul ca_autre depuis le 1er du mois (mois de `fin`) jusqu'à `fin`.
export function autreCaCumulMois(caRows, fin) {
  const finDate = fromIso(fin)
  const debut = `${finDate.getFullYear()}-${String(finDate.getMonth() + 1).padStart(2, '0')}-01`
  return autreCaSurPeriode(caRows, debut, fin)
}

// Liste détaillée [{ lieu_id, lieu_label, service, ca_autre }] des lignes
// avec ca_autre > 0 sur la période. Triée par label lieu puis service
// (lunch avant dinner). Permet d'afficher une section "Autres CA" qui
// indique exactement où ces montants ont été saisis.
export function autreCaParLieuService(caRows, lieuxMap, debut, fin) {
  const filtered = filterCaJournalier(caRows, debut, fin)
  const map = new Map()
  for (const r of filtered) {
    const v = Number(r.ca_autre || 0)
    if (v === 0) continue
    const key = `${r.lieu_service_id}_${r.service}`
    map.set(key, (map.get(key) || 0) + v)
  }
  const out = []
  for (const [key, ca_autre] of map.entries()) {
    const [lieuId, service] = key.split('_')
    out.push({
      lieu_id: lieuId,
      lieu_label: lieuxMap.get(lieuId) || lieuId,
      service,
      ca_autre,
    })
  }
  out.sort((a, b) => {
    const cmp = (a.lieu_label || '').localeCompare(b.lieu_label || '', 'fr')
    if (cmp !== 0) return cmp
    return a.service === 'lunch' ? -1 : 1
  })
  return out
}

// ── Agrégateur : construit tout le rapport en un appel ─────────────────────

export function buildRapportData({ caRows, budgetRows, lieuxMap, debut, fin, joursFermesIso = null, joursOverrideRows = null }) {
  const ca = caTtcVsBudget(caRows, budgetRows, debut, fin, joursFermesIso, joursOverrideRows)
  const caMois = caTtcCumulMois(caRows, budgetRows, fin, joursFermesIso, joursOverrideRows)
  const tmLieux = tmParLieuService(caRows, budgetRows, lieuxMap, debut, fin, joursFermesIso, joursOverrideRows)
  const tmFb = tmFoodBevParService(caRows, budgetRows, debut, fin, joursFermesIso, joursOverrideRows)
  const mix = mixFoodBev(tmFb)
  const couverts = couvertsParService(caRows, budgetRows, debut, fin, joursFermesIso, joursOverrideRows)
  const couvertsJpJ = couvertsJourParJour(caRows, budgetRows, debut, fin, joursFermesIso, joursOverrideRows)
  const autreCa = autreCaSurPeriode(caRows, debut, fin)
  const autreCaMois = autreCaCumulMois(caRows, fin)
  const autreCaDetail = autreCaParLieuService(caRows, lieuxMap, debut, fin)
  return {
    ca, caMois, tmLieux, tmFb, mix, couverts, couvertsJpJ,
    autreCa, autreCaMois, autreCaDetail,
  }
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

// Construit le Set<dateIso> des jours fermés sur [debut, fin] en mergeant
// les dates spécifiques (ca_jours_fermes) et les fermetures hebdomadaires
// (ca_jours_fermes_hebdo). Permet aux helpers du rapport d'exclure ces
// dates du calcul budget (cumul, par lieu, par service, jour-par-jour).
//
// `joursFermesRows`     : rows ca_jours_fermes  [{ date, motif }]
// `joursFermesHebdoRows`: rows ca_jours_fermes_hebdo [{ jour_semaine, motif }]
export function buildJoursFermesIso(joursFermesRows, joursFermesHebdoRows, debut, fin) {
  const out = new Set()
  // 1) Dates spécifiques (dans la période)
  for (const r of (joursFermesRows || [])) {
    if (r.date >= debut && r.date <= fin) out.add(r.date)
  }
  // 2) Fermetures hebdo : étend à toutes les dates matchantes du période
  const hebdoIsoJds = new Set((joursFermesHebdoRows || []).map((r) => Number(r.jour_semaine)))
  if (hebdoIsoJds.size > 0) {
    for (const d of eachDayIso(debut, fin)) {
      if (hebdoIsoJds.has(d.isoJds)) out.add(d.iso)
    }
  }
  return out
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
