// Rapprochement souple des libellés de facture avec la base de l'établissement :
//   * ingrédients : SUGGESTIONS à valider d'un clic (jamais de liaison
//     automatique — « JAMBON IBÉRIQUE AVEC OS » n'est pas « JAMBON IBÉRIQUE ») ;
//   * fournisseurs : même fournisseur malgré l'écriture (« LES VERGERS SAINT
//     EUSTACHE » = « Vergers St Eustache »).
// Module JS sans dépendance, importable côté navigateur et serveur.

import { normDesig } from './achatsHelpers'

// Mots qui ne disent rien du produit : conditionnement, unité, calibre,
// origine, qualité commerciale. Comparés après normDesig (minuscules, sans accent).
const MOTS_VIDES = new Set([
  'a', 'au', 'aux', 'avec', 'd', 'de', 'des', 'du', 'en', 'et', 'l', 'la', 'le', 'les', 'ou', 'par', 'pour', 'sans', 'sur', 'x',
  'kg', 'kilo', 'kilos', 'g', 'gr', 'cl', 'ml', 'lt', 'litre', 'litres', 'u', 'un', 'unite', 'pce', 'pc', 'piece', 'pieces',
  'botte', 'bottes', 'bqt', 'bq', 'barquette', 'barquettes', 'colis', 'carton', 'cartons', 'sac', 'sachet', 'boite', 'pot', 'filet', 'plateau', 'plateaux', 'vrac',
  'extra', 'cat', 'categorie', 'calibre', 'gros', 'grosse', 'moyen', 'petit', 'mini', 'import', 'importe', 'origine', 'bio', 'frais', 'fraiche', 'fraiches', 'frais',
  'france', 'francais', 'francaise', 'espagne', 'italie', 'maroc', 'portugal', 'belgique', 'allemagne', 'pays', 'bas', 'ue',
])

/** Forme singulière simple (carottes → carotte, choux → chou). */
function singulier(mot) {
  if (mot.length > 4 && (mot.endsWith('s') || mot.endsWith('x'))) return mot.slice(0, -1)
  return mot
}

/**
 * Mots qui identifient le produit : sans parenthèses (origine), sans mots
 * vides, sans nombres ni grammages (« 2X », « 125G », « 6/6 »), au singulier.
 */
export function motsSignificatifs(libelle) {
  const sansParentheses = String(libelle || '').replace(/\([^)]*\)/g, ' ')
  return [...new Set(
    normDesig(sansParentheses).split(' ')
      .filter((m) => m && !/\d/.test(m) && !MOTS_VIDES.has(m) && m.length > 1)
      .map(singulier),
  )]
}

/**
 * Index des ingrédients (mots pré-calculés une fois) : l'écran d'import
 * recalcule les suggestions à chaque frappe, sur des centaines d'ingrédients.
 * @param {Array<{id: string, nom: string}>} ingredients
 */
export function indexerIngredients(ingredients) {
  return (ingredients || [])
    .map((ing) => ({ ing, mots: motsSignificatifs(ing?.nom) }))
    .filter((e) => e.mots.length > 0)
}

/**
 * Ingrédients dont TOUS les mots significatifs figurent dans la désignation
 * de la facture, les plus précis d'abord (« Carotte violette » avant
 * « Carotte » pour « CAROTTE VIOLETTE / KG »).
 * @param {string} designation
 * @param {ReturnType<typeof indexerIngredients>} index
 * @returns {Array<{id: string, nom: string}>}
 */
export function suggererDepuisIndex(designation, index, max = 3) {
  const mots = new Set(motsSignificatifs(designation))
  if (mots.size === 0) return []
  return index
    .filter((e) => e.mots.every((m) => mots.has(m)))
    .sort((a, b) => b.mots.length - a.mots.length || a.ing.nom.length - b.ing.nom.length || a.ing.nom.localeCompare(b.ing.nom))
    .slice(0, max)
    .map((e) => e.ing)
}

/** Raccourci sans index (tests, usages ponctuels). */
export function suggererIngredients(designation, ingredients, max = 3) {
  return suggererDepuisIndex(designation, indexerIngredients(ingredients), max)
}

// ── Fournisseurs ───────────────────────────────────────────────────────────

const MOTS_FOURNISSEUR = new Set([
  'les', 'le', 'la', 'l', 'the', 'et', 'de', 'des', 'du',
  'sas', 'sasu', 'sarl', 'eurl', 'sa', 'snc', 'sca', 'ets', 'etablissements', 'societe', 'ste', 'cie', 'fils', 'groupe',
])

/** Mots d'un nom de fournisseur, « saint » ramené à « st ». */
function motsFournisseur(nom) {
  return normDesig(String(nom || '').replace(/\([^)]*\)/g, ' '))
    .split(' ')
    .map((m) => (m === 'saint' ? 'st' : m === 'sainte' ? 'ste' : m))
    .filter((m) => m && !MOTS_FOURNISSEUR.has(m))
}

/** Clé de rapprochement d'un fournisseur (même fournisseur ⇔ même clé). */
export function cleFournisseurSouple(nom) {
  const mots = motsFournisseur(nom)
  return (mots.length ? mots : normDesig(nom).split(' ')).join('')
}

/**
 * Fournisseur déjà connu correspondant au nom lu sur la facture :
 *   { nom, exact: true }  même clé (écriture différente du même nom) ;
 *   { nom, exact: false } nom proche (au moins 2/3 des mots en commun) ;
 *   null sinon, ou si le nom lu est déjà écrit à l'identique.
 * @param {string} nomLu
 * @param {string[]} connus
 */
export function rapprocherFournisseur(nomLu, connus) {
  const lu = String(nomLu || '').trim()
  if (!lu || !connus?.length) return null
  if (connus.some((c) => c.trim().toLowerCase() === lu.toLowerCase())) return null

  const cle = cleFournisseurSouple(lu)
  const exact = connus.find((c) => cleFournisseurSouple(c) === cle)
  if (exact) return { nom: exact, exact: true }

  const motsLu = new Set(motsFournisseur(lu))
  let meilleur = null
  for (const c of connus) {
    const motsC = new Set(motsFournisseur(c))
    if (motsC.size === 0 || motsLu.size === 0) continue
    const communs = [...motsC].filter((m) => motsLu.has(m)).length
    const score = communs / Math.max(motsC.size, motsLu.size)
    if (score >= 2 / 3 && (!meilleur || score > meilleur.score)) meilleur = { nom: c, score }
  }
  return meilleur ? { nom: meilleur.nom, exact: false } : null
}
