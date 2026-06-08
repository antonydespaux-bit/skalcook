// Helpers de coût partagés entre les éditeurs de fiche et l'affichage.
//
// Historique : l'affichage (app/fiches/[id]/page.js) appliquait un coefficient
// d'unité (g/ml → 0,001, cl → 0,01) tandis que les éditeurs (nouvelle, modifier,
// SectionsEditor) faisaient `prix_kg * quantite` SANS coefficient. Résultat :
// pour une ligne en grammes le coût éditeur était ~1000× trop élevé, et le coût
// des sous-fiches imbriquées consommées au gramme était faux. On centralise ici
// la logique correcte (celle de l'affichage) pour que tous les sites l'utilisent.

/** Coefficient pour ramener une quantité exprimée en `unite` vers l'unité de
 *  base à laquelle `prix_kg` est rattaché (kg pour les masses, L pour les
 *  volumes, l'unité elle-même pour le reste). */
export function uniteCoefficient(unite) {
  if (unite === 'g' || unite === 'ml') return 0.001
  if (unite === 'cl') return 0.01
  return 1 // kg, L, u, botte, pièce, portions, portion…
}

/** Coût d'une ligne côté éditeur : on a l'entrée catalogue (ingData.prix_kg) +
 *  la quantité/l'unité saisies. */
export function coutLigneEditor(ingData, quantite, unite) {
  if (!ingData?.prix_kg || !quantite) return 0
  return ingData.prix_kg * parseFloat(quantite) * uniteCoefficient(unite)
}

/** Coût d'une ligne côté affichage : la ligne `fiche_ingredients` jointe à
 *  `ingredients` ({ quantite, unite, ingredients: { prix_kg } }). */
export function coutLigneAffichage(ing) {
  if (!ing?.ingredients?.prix_kg || !ing.quantite) return 0
  return ing.ingredients.prix_kg * ing.quantite * uniteCoefficient(ing.unite)
}

/** Unité de base de la famille d'une unité (masse → kg, volume → L, sinon
 *  l'unité telle quelle). Sert à fixer l'unité d'un ingrédient miroir. */
export function uniteBase(unite) {
  if (unite === 'g' || unite === 'kg') return 'kg'
  if (unite === 'ml' || unite === 'cl' || unite === 'L') return 'L'
  return unite || 'portions'
}

/** Coût d'une dose : coût unitaire (par kg/L/unité) × dose × coefficient d'unité.
 *  Utilisé pour une section dosée liée à une sous-fiche. */
export function coutDose(unitCost, dosePortion, doseUnite) {
  if (!unitCost || !dosePortion) return 0
  return unitCost * parseFloat(dosePortion) * uniteCoefficient(doseUnite)
}

/** Coût/assiette d'une section dosée calculé EN DIRECT depuis sa recette :
 *  coût unitaire = batchCost ÷ rendement (ramené à l'unité de base), puis × dose.
 *  Retourne null si pas de rendement exploitable (→ fallback sous-fiche). */
export function coutSectionDosee(batchCost, rendementPortion, rendementUnite, dosePortion, doseUnite) {
  const rendBase = parseFloat(rendementPortion) * uniteCoefficient(rendementUnite)
  if (!rendBase || !dosePortion) return null
  const unitCost = batchCost / rendBase
  return coutDose(unitCost, dosePortion, doseUnite)
}

/** Coût PAR PORTION d'une fiche étoilée tenant compte des sections dosées.
 *  - section dosée (sousFicheId + dosePortion) → coût/portion = coutDose(...), indépendant de nb_portions ;
 *  - section non dosée / lignes libres → batch réparti sur nb_portions (comportement historique).
 *  sections: [{ sousFicheId, dosePortion, doseUnite, lineCost }] (lineCost = Σ coût des lignes de la section)
 *  unitCostFor: (sousFicheId) => coût unitaire (€/unité de base) | null */
export function coutPortionEtoile({ sections = [], freeLineCost = 0, nbPortions, unitCostFor }) {
  const n = parseFloat(nbPortions) || 1
  let dosed = 0, batch = 0
  for (const s of sections) {
    if (s.dosePortion && (s.sousFicheId || s.rendementPortion)) {
      // Section dosée. Priorité au calcul LIVE depuis la recette + rendement
      // (ajouter un ingrédient met le coût à jour). Sinon fallback sur le coût
      // figé de la sous-fiche (sections promues avant le rendement).
      const live = s.rendementPortion
        ? coutSectionDosee(s.lineCost || 0, s.rendementPortion, s.rendementUnite, s.dosePortion, s.doseUnite)
        : null
      dosed += (live != null) ? live : coutDose(unitCostFor ? unitCostFor(s.sousFicheId) : null, s.dosePortion, s.doseUnite)
    } else if (s.sousFicheId) {
      // Section liée mais non dosée (intermédiaire/référence) : ne compte pas —
      // son coût est porté par la sous-fiche qui la consomme. Pas de double comptage.
    } else {
      // Section inline (recette propre, non promue) : batch réparti sur nb_portions.
      batch += (s.lineCost || 0)
    }
  }
  // Ingrédients de finition (libres, sans section) = quantité par assiette → comptés
  // directement. Sections inline non liées = batch réparti sur nb_portions.
  return dosed + batch / n + freeLineCost
}

/** Normalise un rendement (qté + unité produite) vers l'unité de base.
 *  Ex : (2800, 'g') → { qteBase: 2.8, uniteBase: 'kg' }.
 *  Permet de stocker un `prix_kg` au kg/L/unité pour que la cascade au gramme
 *  via `uniteCoefficient` soit exacte. */
export function normaliserRendement(qte, unite) {
  const q = parseFloat(qte) || 0
  const base = uniteBase(unite)
  const qteBase = (base === 'kg' || base === 'L') ? q * uniteCoefficient(unite) : q
  return { qteBase, uniteBase: base }
}
