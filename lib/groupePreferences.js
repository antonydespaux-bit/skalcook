import { loadLayoutForPage, persistLayoutForPage } from './dashboardPreferences'

// Blocs de la vue groupe (/groupe) que l'utilisateur peut afficher ou masquer.
// Le choix s'applique aussi à l'impression et à l'export Excel.
// Stocké comme les autres pages à widgets : user_dashboard_preferences,
// page = 'groupe', par (utilisateur, établissement actif). Sans
// établissement actif (superadmin), repli sur le navigateur.
export const BLOCS_GROUPE = ['indicateurs', 'synthese', 'prix', 'fournisseurs']

const PAGE = 'groupe'
const CLE_LOCALE = 'skalcook_groupe_blocs'

/** Normalise un layout stocké : tous les blocs connus, visibles par défaut, au moins un visible. */
export function reconcileBlocsGroupe(layout) {
  const stocke = layout && typeof layout === 'object' && layout.blocs && typeof layout.blocs === 'object' ? layout.blocs : {}
  const blocs = Object.fromEntries(BLOCS_GROUPE.map((id) => [id, stocke[id] !== false]))
  if (!Object.values(blocs).some(Boolean)) BLOCS_GROUPE.forEach((id) => { blocs[id] = true })
  return { blocs }
}

function lireLocal() {
  try { return JSON.parse(localStorage.getItem(CLE_LOCALE) || 'null') } catch { return null }
}

export async function loadBlocsGroupe() {
  try {
    let enBase = null
    await loadLayoutForPage(PAGE, (layout) => { enBase = layout; return null })
    return reconcileBlocsGroupe(enBase ?? lireLocal())
  } catch {
    return reconcileBlocsGroupe(lireLocal())
  }
}

export async function saveBlocsGroupe(layout) {
  const propre = reconcileBlocsGroupe(layout)
  try { localStorage.setItem(CLE_LOCALE, JSON.stringify(propre)) } catch { /* navigateur privé */ }
  try { await persistLayoutForPage(PAGE, reconcileBlocsGroupe, propre) } catch { /* pas d'établissement actif : le navigateur suffit */ }
  return propre
}
