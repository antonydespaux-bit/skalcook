/**
 * Helpers pour le couple saison + annee.
 *
 * Le champ legacy `saison` était un texte libre comme "Printemps 2026".
 * Depuis la migration 20260427120000, on stocke saison et annee dans
 * deux colonnes séparées :
 *   saison ∈ { Printemps, Été, Automne, Hiver, Toutes } (ou null)
 *   annee  : entier (null possible pour les fiches "Toutes saisons")
 */

export const SAISONS = ['Printemps', 'Été', 'Automne', 'Hiver', 'Toutes']

const APP_START_YEAR = 2025
const FUTURE_OFFSET = 2

/**
 * Liste glissante des années à proposer dans les selects.
 * De 2025 (création de l'app) à année courante + 2.
 */
export function getYearsRange() {
  const end = new Date().getFullYear() + FUTURE_OFFSET
  const years = []
  for (let y = APP_START_YEAR; y <= end; y++) years.push(y)
  return years
}

/**
 * Formate saison + annee en chaîne d'affichage : "Printemps 2026", "Toutes saisons", "2026", "".
 */
export function formatSaison(saison, annee) {
  if (saison === 'Toutes') return annee ? `Toutes ${annee}` : 'Toutes saisons'
  if (saison && annee) return `${saison} ${annee}`
  if (saison) return saison
  if (annee) return String(annee)
  return ''
}

/**
 * Parse un texte legacy "Printemps 2026" → { saison, annee }.
 * Utile pour les anciennes données pas encore réécrites par la migration,
 * ou pour des saisies legacy au chargement d'un formulaire.
 */
export function parseSaison(text) {
  if (!text || typeof text !== 'string') return { saison: '', annee: null }
  const trimmed = text.trim()
  if (!trimmed) return { saison: '', annee: null }

  const match = trimmed.match(/^(Printemps|Été|Ete|Automne|Hiver|Toutes)\s*(\d{4})?$/i)
  if (match) {
    const raw = match[1].toLowerCase()
    const saison = raw === 'ete' ? 'Été'
      : raw === 'été' ? 'Été'
      : match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase()
    return { saison, annee: match[2] ? parseInt(match[2], 10) : null }
  }
  const yearOnly = trimmed.match(/^(\d{4})$/)
  if (yearOnly) return { saison: '', annee: parseInt(yearOnly[1], 10) }
  return { saison: '', annee: null }
}
