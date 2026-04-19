import { supabase, getClientId } from './supabase'

// Source de vérité des widgets du dashboard cuisine (/dashboard).
// L'ordre ici = ordre par défaut si l'user n'a pas encore de prefs.
// `defaultVisible: false` = widget disponible mais masqué par défaut.
// `size`: 'kpi' (cellule dans la grille KPI), 'half' (demi-largeur, paire
// avec une autre 'half' consécutive visible), 'full' (pleine largeur).
export const WIDGET_CATALOG = [
  { id: 'kpi-food-cost-moyen',       label: 'KPI — Food cost moyen',              size: 'kpi',  defaultVisible: true },
  { id: 'kpi-fiches-actives',        label: 'KPI — Fiches actives',                size: 'kpi',  defaultVisible: true },
  { id: 'kpi-fiches-alerte',         label: 'KPI — Fiches en alerte',              size: 'kpi',  defaultVisible: true },
  { id: 'kpi-prix-modifies',         label: 'KPI — Prix modifiés',                 size: 'kpi',  defaultVisible: true },
  { id: 'kpi-ca-mtd',                label: 'KPI — CA cumulé mois en cours',       size: 'kpi',  defaultVisible: false },
  { id: 'kpi-marge-mtd',             label: 'KPI — Marge mois en cours',           size: 'kpi',  defaultVisible: false },
  { id: 'section-fiches-alerte',     label: 'Section — Fiches en alerte',          size: 'half', defaultVisible: true },
  { id: 'section-fiches-par-espace', label: 'Section — Fiches par espace',         size: 'half', defaultVisible: true },
  { id: 'section-prix-modifies',     label: 'Section — Ingrédients prix modifiés', size: 'full', defaultVisible: true },
  { id: 'section-crm-evenements',    label: 'Section — Événements CRM à venir',    size: 'half', defaultVisible: false },
  { id: 'section-allergenes',        label: 'Tableau — Allergènes',                size: 'full', defaultVisible: true },
]

export const WIDGET_BY_ID = Object.fromEntries(WIDGET_CATALOG.map((w) => [w.id, w]))

export const WIDGET_IDS = WIDGET_CATALOG.map((w) => w.id)

export const DEFAULT_LAYOUT = WIDGET_CATALOG.map((w) => ({
  id: w.id,
  visible: w.defaultVisible,
}))

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

// Récupère le layout réconcilié pour l'user courant sur le tenant courant.
// Retourne toujours un array valide (jamais null) grâce à reconcileLayout.
export async function getDashboardLayout() {
  const clientId = await getClientId()
  if (!clientId) return reconcileLayout(null)

  const { data: userData } = await supabase.auth.getUser()
  const userId = userData?.user?.id
  if (!userId) return reconcileLayout(null)

  const { data, error } = await supabase
    .from('user_dashboard_preferences')
    .select('layout')
    .eq('user_id', userId)
    .eq('client_id', clientId)
    .maybeSingle()

  if (error || !data) return reconcileLayout(null)
  return reconcileLayout(data.layout)
}

// Upsert du layout. On ne stocke que des entrées valides (ids du catalog).
export async function saveDashboardLayout(layout) {
  const clientId = await getClientId()
  if (!clientId) throw new Error('Aucun établissement actif')

  const { data: userData } = await supabase.auth.getUser()
  const userId = userData?.user?.id
  if (!userId) throw new Error('Utilisateur non authentifié')

  const clean = reconcileLayout(layout)

  const { error } = await supabase
    .from('user_dashboard_preferences')
    .upsert(
      { user_id: userId, client_id: clientId, layout: clean },
      { onConflict: 'user_id,client_id' }
    )

  if (error) throw error
  return clean
}

// Remise aux valeurs par défaut : on supprime la ligne.
// Au prochain load, getDashboardLayout() retournera DEFAULT_LAYOUT.
export async function resetDashboardLayout() {
  const clientId = await getClientId()
  if (!clientId) return

  const { data: userData } = await supabase.auth.getUser()
  const userId = userData?.user?.id
  if (!userId) return

  await supabase
    .from('user_dashboard_preferences')
    .delete()
    .eq('user_id', userId)
    .eq('client_id', clientId)
}
