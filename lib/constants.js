// ─── Catégories ───────────────────────────────────────────────────────────────

/** Catégories qui activent la création d'un ingrédient miroir (sous-fiche). */
export const CATEGORIES_SOUS_FICHE = ['Sous-fiche', 'Sous-fiches', 'Accompagnements']

/** Noms de catégories considérés comme "sous-fiche" pour is_sub_fiche. */
export const NOMS_SOUS_FICHE = ['Sous-fiche', 'Sous-fiches']

// ─── Unités ───────────────────────────────────────────────────────────────────

/** Unités de production disponibles pour les sous-fiches. */
export const UNITES_PRODUCTION = ['portions', 'kg', 'g', 'L', 'cl', 'ml', 'u']

/**
 * Unités canoniques d'un ingrédient / d'une ligne d'achat, par section.
 * Liste fermée présentée en menu déroulant pour éviter les variantes texte
 * libre ("Kg" vs "kg") qui faussaient les rapprochements et la mercuriale.
 */
export const UNITES_CUISINE = ['kg', 'g', 'L', 'cl', 'ml', 'u', 'pièce', 'bouteille', 'botte']
export const UNITES_BAR = ['L', 'cl', 'ml', 'u', 'bouteille', 'kg', 'pièce']

/** Retourne la liste d'unités proposée selon la section ('cuisine' | 'bar'). */
export function unitesParSection(section) {
  return section === 'bar' ? UNITES_BAR : UNITES_CUISINE
}

/**
 * Variantes texte libre → unité canonique. Clé = saisie en minuscules.
 * Sert à nettoyer l'historique et à recoller toute saisie hors liste.
 */
const UNITE_ALIASES = {
  kg: 'kg', kgs: 'kg', kilo: 'kg', kilos: 'kg', kilogramme: 'kg', kilogrammes: 'kg',
  g: 'g', gr: 'g', grs: 'g', gramme: 'g', grammes: 'g',
  l: 'L', litre: 'L', litres: 'L', lt: 'L',
  cl: 'cl', centilitre: 'cl', centilitres: 'cl',
  ml: 'ml', millilitre: 'ml', millilitres: 'ml',
  u: 'u', un: 'u', unite: 'u', unites: 'u', 'unité': 'u', 'unités': 'u', ea: 'u', article: 'u',
  piece: 'pièce', pieces: 'pièce', 'pièce': 'pièce', 'pièces': 'pièce', pce: 'pièce', pcs: 'pièce', pc: 'pièce',
  botte: 'botte', bottes: 'botte',
  bouteille: 'bouteille', bouteilles: 'bouteille', btl: 'bouteille', bt: 'bouteille',
  portion: 'portions', portions: 'portions',
}

/**
 * Normalise une unité saisie en sa forme canonique ("Kg" → "kg", "Litre" → "L").
 * Renvoie '' si vide, et conserve telle quelle (juste trimée) toute unité
 * inconnue pour ne jamais perdre une donnée existante.
 */
export function normUnite(raw) {
  if (raw == null) return ''
  // Retire espaces et points de fin ("Kg." / "L." / "Bt." → "kg" / "L" / "bouteille").
  const cleaned = String(raw).trim().replace(/[.\s]+$/, '')
  if (!cleaned) return ''
  return UNITE_ALIASES[cleaned.toLowerCase()] ?? cleaned
}

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

