import { DEFAULT_SEUILS, DEFAULT_TVA, CATEGORIES_SOUS_FICHE, NOMS_SOUS_FICHE } from './constants'

// ─── Calculs ─────────────────────────────────────────────────────────────────

/**
 * Calcule le food cost en pourcentage.
 * @param {number} coutPortion  Coût par portion (€)
 * @param {number} prixTTC      Prix de vente TTC (€)
 * @param {number} [tva]        Taux de TVA (%, ex: 10). Par défaut DEFAULT_TVA.
 * @returns {number|null}
 */
export function calculerFoodCost(coutPortion, prixTTC, tva = DEFAULT_TVA) {
  if (!coutPortion || !prixTTC) return null
  const prixHT = prixTTC / (1 + tva / 100)
  return (coutPortion / prixHT) * 100
}

/**
 * Retourne les styles (bg, color) correspondant au niveau du food cost.
 * @param {number} fc           Food cost en %
 * @param {number} seuilVert    Seuil vert (%)
 * @param {number} seuilOrange  Seuil orange (%)
 * @returns {{ bg: string, color: string }}
 */
export function foodCostColor(fc, seuilVert, seuilOrange) {
  if (fc < seuilVert)    return { bg: '#EAF3DE', color: '#3B6D11' }
  if (fc < seuilOrange)  return { bg: '#FAEEDA', color: '#854F0B' }
  return                        { bg: '#FCEBEB', color: '#A32D2D' }
}

/**
 * Retourne les seuils food cost depuis les paramètres établissement, avec fallback aux défauts.
 * @param {object} params       Objet paramètres retourné par getParametres()
 * @param {'cuisine'|'bar'} section
 * @returns {{ seuilVert: number, seuilOrange: number, tva: number }}
 */
export function getSeuilsFromParams(params, section = 'cuisine') {
  const def = DEFAULT_SEUILS[section] ?? DEFAULT_SEUILS.cuisine
  return {
    seuilVert:   parseFloat(params[`seuil_vert_${section}`]   ?? def.vert),
    seuilOrange: parseFloat(params[`seuil_orange_${section}`] ?? def.orange),
    tva:         parseFloat(params['tva_restauration']         ?? DEFAULT_TVA),
  }
}

// ─── Helpers catégories ───────────────────────────────────────────────────────

/**
 * Vérifie si la catégorie doit créer un ingrédient miroir (sous-fiche/accompagnement).
 * @param {string} nomCategorie
 */
export function isIngredientPossible(nomCategorie) {
  return CATEGORIES_SOUS_FICHE.includes(nomCategorie)
}

/**
 * Vérifie si la catégorie représente une sous-fiche.
 * @param {string} nomCategorie
 */
export function isSousFicheCategorie(nomCategorie) {
  return NOMS_SOUS_FICHE.includes(nomCategorie)
}

/**
 * Vérifie si une fiche est une sous-fiche (à exclure des listes/récaps/stats food cost).
 * Robuste : booléen is_sub_fiche OU catégorie contenant « sous » (compat legacy).
 * @param {{ is_sub_fiche?: boolean, categorie?: string }} fiche
 */
export function estSousFiche(fiche) {
  if (!fiche) return false
  if (fiche.is_sub_fiche === true) return true
  const cat = typeof fiche.categorie === 'string' ? fiche.categorie.toLowerCase() : ''
  return cat.includes('sous')
}
