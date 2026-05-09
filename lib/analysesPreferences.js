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

  // ── Sections ──────────────────────────────────────────────────────────────
  { id: 'section-tableau-jour-jour', label: 'Tableau jour par jour', size: 'full', defaultVisible: true },
]

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
