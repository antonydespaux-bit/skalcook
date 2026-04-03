// ─── Catégories ───────────────────────────────────────────────────────────────

/** Catégories qui activent la création d'un ingrédient miroir (sous-fiche). */
export const CATEGORIES_SOUS_FICHE = ['Sous-fiche', 'Sous-fiches', 'Accompagnements']

/** Noms de catégories considérés comme "sous-fiche" pour is_sub_fiche. */
export const NOMS_SOUS_FICHE = ['Sous-fiche', 'Sous-fiches']

// ─── Unités ───────────────────────────────────────────────────────────────────

/** Unités de production disponibles pour les sous-fiches. */
export const UNITES_PRODUCTION = ['portions', 'kg', 'g', 'L', 'cl', 'ml', 'u']

// ─── Seuils food cost (valeurs par défaut — surchargées par les paramètres établissement) ─

export const DEFAULT_SEUILS = {
  cuisine: { vert: 28, orange: 35 },
  bar:     { vert: 22, orange: 28 },
}

/** TVA restauration par défaut (%). */
export const DEFAULT_TVA = 10

// ─── Inventaire ──────────────────────────────────────────────────────────────

export const INVENTAIRE_TYPES = { TOURNANT: 'tournant', COMPLET: 'complet' }
export const INVENTAIRE_STATUTS = { BROUILLON: 'brouillon', VALIDE: 'valide' }

export const INVENTAIRE_FREQUENCES = [
  { value: 'weekly',   label: 'Chaque semaine' },
  { value: 'biweekly', label: 'Toutes les 2 semaines' },
  { value: 'monthly',  label: 'Chaque mois' },
]

export const JOURS_SEMAINE = [
  { value: 0, label: 'Dimanche' },
  { value: 1, label: 'Lundi' },
  { value: 2, label: 'Mardi' },
  { value: 3, label: 'Mercredi' },
  { value: 4, label: 'Jeudi' },
  { value: 5, label: 'Vendredi' },
  { value: 6, label: 'Samedi' },
]

/** Table de conversion d'unités vers une base commune. */
export const CONVERSION_UNITES = {
  'g_to_kg':  0.001,  'kg_to_g':  1000,
  'cl_to_L':  0.01,   'L_to_cl':  100,
  'ml_to_L':  0.001,  'L_to_ml':  1000,
  'ml_to_cl': 0.1,    'cl_to_ml': 10,
}

/**
 * Convertit une quantité d'une unité source vers une unité cible.
 * Retourne null si la conversion est impossible.
 */
export function convertirUnite(quantite, uniteSource, uniteCible) {
  if (uniteSource === uniteCible) return quantite
  const key = `${uniteSource}_to_${uniteCible}`
  const factor = CONVERSION_UNITES[key]
  return factor != null ? quantite * factor : null
}

// ─── Pagination ───────────────────────────────────────────────────────────────

export const PAGE_SIZE = 24

// ─── Conversions d'unités ─────────────────────────────────────────────────────

/** Table de conversion vers l'unité de base pour chaque unité de mesure. */
export const CONVERSION_UNITES = {
  kg:       { baseUnit: 'kg',       factor: 1 },
  g:        { baseUnit: 'kg',       factor: 0.001 },
  L:        { baseUnit: 'L',        factor: 1 },
  cl:       { baseUnit: 'L',        factor: 0.01 },
  ml:       { baseUnit: 'L',        factor: 0.001 },
  portions: { baseUnit: 'portions', factor: 1 },
  u:        { baseUnit: 'u',        factor: 1 },
}
