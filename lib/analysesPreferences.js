import {
  loadLayoutForPage,
  persistLayoutForPage,
  clearLayoutForPage,
} from './dashboardPreferences'

// Source de vérité des widgets de la page Analyses CA
// (/controle-gestion/analyses). Mirror du pattern dashboard cuisine, mais
// avec son propre catalogue et son propre layout en base
// (user_dashboard_preferences.page = 'analyses').
//
// `size`:
//   - 'kpi'  → cellule dans la grille KPI (rangée du haut)
//   - 'half' → demi-largeur, paire avec une autre 'half' consécutive visible
//   - 'full' → pleine largeur
//
// `requiresModule`: id de module (clients.modules_actifs) nécessaire ;
//   absent = widget toujours disponible.
//
// PR 2 livre les KPIs CA + le tableau jour/jour. Les charts arrivent en
// PR 3, l'export & impression en PR 4, les widgets marges rapatriés en PR 5.
export const WIDGET_CATALOG = [
  // ── KPIs CA ────────────────────────────────────────────────────────────────
  { id: 'kpi-couverts',        label: 'KPI — Couverts',           size: 'kpi',  defaultVisible: true },
  { id: 'kpi-ca-ttc',          label: 'KPI — CA TTC',             size: 'kpi',  defaultVisible: true },
  { id: 'kpi-ca-ht',           label: 'KPI — CA HT',              size: 'kpi',  defaultVisible: true },
  { id: 'kpi-tm',              label: 'KPI — Ticket moyen',       size: 'kpi',  defaultVisible: true },
  { id: 'kpi-ecart-budget-pct',label: 'KPI — Écart budget (%)',   size: 'kpi',  defaultVisible: true },

  // ── Sections — Charts (PR 3) ──────────────────────────────────────────────
  { id: 'section-evolution-ca',       label: 'Évolution du CA TTC (réel vs budget)', size: 'half', defaultVisible: true },
  { id: 'section-evolution-couverts', label: 'Évolution des couverts',               size: 'half', defaultVisible: true },
  { id: 'section-perf-jour-semaine',  label: 'Performance par jour de la semaine',   size: 'half', defaultVisible: true },
  { id: 'section-mix-food-bev',       label: 'Mix CA Food / Boissons / Autres',      size: 'half', defaultVisible: true },
  { id: 'section-top-bottom-jours',   label: 'Top et bottom jours',                  size: 'full', defaultVisible: true },

  // ── Sections — Détail tabulaire (PR 2) ────────────────────────────────────
  { id: 'section-tableau-jour-jour', label: 'Tableau jour par jour',                 size: 'full', defaultVisible: true },

  // ── KPIs Marges (PR 5 — rapatriés de l'ancienne page /marges) ────────────
  // Masqués par défaut : ils impliquent un load de données supplémentaire
  // (ventes_journalieres + fiches + ingredients + achats). L'user qui en
  // a besoin les active explicitement.
  { id: 'kpi-food-cost-moyen',  label: 'KPI — Food cost moyen',  size: 'kpi', defaultVisible: false },
  { id: 'kpi-marge-brute',      label: 'KPI — Marge brute',      size: 'kpi', defaultVisible: false },

  // ── Sections Marges (PR 5) ────────────────────────────────────────────────
  { id: 'section-charts-marges',     label: 'Charts — CA vs Coût + Menu Engineering', size: 'full', defaultVisible: false },
  { id: 'section-ca-par-fiche',      label: 'Détail CA par plat',                     size: 'full', defaultVisible: false },
  { id: 'section-conso-ingredient',  label: 'Consommation théorique ingrédients',     size: 'full', defaultVisible: false },
]

// Ids des widgets qui nécessitent le chargement des données marges (ventes,
// fiches, ingredients, achats). Permet à la page Analyses de skip l'I/O
// quand aucun widget marges n'est visible.
export const WIDGETS_REQUIRING_MARGES_DATA = new Set([
  'kpi-food-cost-moyen',
  'kpi-marge-brute',
  'section-charts-marges',
  'section-ca-par-fiche',
  'section-conso-ingredient',
])

export const WIDGET_BY_ID = Object.fromEntries(WIDGET_CATALOG.map((w) => [w.id, w]))

export const WIDGET_IDS = WIDGET_CATALOG.map((w) => w.id)

export const DEFAULT_LAYOUT = WIDGET_CATALOG.map((w) => ({
  id: w.id,
  visible: w.defaultVisible,
}))

export function isWidgetAvailable(widget, modulesActifs) {
  if (!widget?.requiresModule) return true
  return Array.isArray(modulesActifs) && modulesActifs.includes(widget.requiresModule)
}

// Fusion d'un layout stocké avec le catalog : on jette les ids inconnus
// (widget supprimé du catalog) et on ajoute à la fin les widgets du catalog
// pas encore connus (nouveau widget livré après que l'user a sauvegardé).
export function reconcileLayout(storedLayout) {
  const known = new Set(WIDGET_IDS)
  const seen = new Set()
  const merged = []

  if (Array.isArray(storedLayout)) {
    for (const entry of storedLayout) {
      if (!entry || typeof entry.id !== 'string') continue
      if (!known.has(entry.id) || seen.has(entry.id)) continue
      merged.push({ id: entry.id, visible: entry.visible !== false })
      seen.add(entry.id)
    }
  }

  for (const w of WIDGET_CATALOG) {
    if (seen.has(w.id)) continue
    merged.push({ id: w.id, visible: w.defaultVisible })
  }

  return merged
}

const PAGE_KEY = 'analyses'

export async function getAnalysesLayout() {
  return loadLayoutForPage(PAGE_KEY, reconcileLayout)
}

export async function saveAnalysesLayout(layout) {
  return persistLayoutForPage(PAGE_KEY, reconcileLayout, layout)
}

export async function resetAnalysesLayout() {
  return clearLayoutForPage(PAGE_KEY)
}
