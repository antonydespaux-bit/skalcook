// Logique partagée (création + modification de fiche) pour relier une section
// d'une fiche étoilée à une vraie sous-fiche réutilisable :
//   - promoteSectionToSousFiche : crée une sous-fiche à partir d'une section
//     (fiche is_sub_fiche + copie des ingrédients + ingrédient miroir) ;
//   - loadSousFicheLignes : charge les lignes d'une sous-fiche existante pour
//     l'importer comme section.
//
// L'ingrédient miroir est prix par unité de BASE (kg/L/unité) — voir
// normaliserRendement — pour que la consommation au gramme cascade juste.

import { coutLigneEditor, normaliserRendement } from './cout'

/**
 * Promeut une section en sous-fiche réutilisable.
 * @returns { ficheId, coutUnite, uniteBase }
 */
export async function promoteSectionToSousFiche({
  supabase, clientId, section, lignes, listeIngredients, rendement, categorieSousFiche,
}) {
  // Coût total de la section (avec coefficient d'unité correct).
  const coutSection = lignes.reduce((tot, l) => {
    const ingData = listeIngredients.find(i => i.id === l.ingredient_id)
    return tot + coutLigneEditor(ingData, l.quantite, l.unite)
  }, 0)

  const { qteBase, uniteBase } = normaliserRendement(rendement.qte, rendement.unite)
  const coutUnite = qteBase > 0 ? coutSection / qteBase : coutSection

  // 1. Fiche sous-fiche
  const { data: fiche, error: errFiche } = await supabase
    .from('fiches')
    .insert([{
      nom: section.nom,
      categorie: categorieSousFiche?.nom || 'Sous-fiches',
      categorie_plat_id: categorieSousFiche?.id || null,
      is_sub_fiche: true,
      nb_portions: 1,
      unite_production: uniteBase,
      prix_ttc: null,
      instructions: section.descriptif || null,
      cout_portion: coutUnite,
      perte: 0,
      format_affichage: 'brasserie',
      // Explicite pour éviter le DEFAULT invalide de la colonne saison
      // ('Printemps 2026' viole fiches_saison_check via le param columns= de PostgREST).
      saison: null,
      annee: null,
      client_id: clientId,
    }])
    .select()
    .single()
  if (errFiche || !fiche) throw new Error(errFiche?.message || 'Création de la sous-fiche échouée')

  // 2. Copie des lignes d'ingrédients dans la sous-fiche
  const lignesAInserer = lignes
    .filter(l => l.ingredient_id && l.quantite)
    .map(l => ({
      fiche_id: fiche.id,
      ingredient_id: l.ingredient_id,
      quantite: parseFloat(l.quantite),
      unite: l.unite,
      client_id: clientId,
      section_id: null,
    }))
  if (lignesAInserer.length > 0) {
    const { error: errLignes } = await supabase.from('fiche_ingredients').insert(lignesAInserer)
    if (errLignes) throw new Error(errLignes.message)
  }

  // 3. Ingrédient miroir (rend la sous-fiche sélectionnable ailleurs)
  const { error: errMiroir } = await supabase.from('ingredients').insert([{
    nom: section.nom,
    prix_kg: coutUnite,
    unite: uniteBase,
    est_sous_fiche: true,
    fiche_id: fiche.id,
    client_id: clientId,
  }])
  if (errMiroir) throw new Error(errMiroir.message)

  return { ficheId: fiche.id, coutUnite, uniteBase }
}

/**
 * Charge le descriptif + les lignes d'une sous-fiche existante, pour l'importer
 * comme section. Inclut `fiche_id` de chaque ingrédient pour la garde anti-cycle.
 * @returns { nom, instructions, lignes: [{ ingredient_id, nom, quantite, unite, ingredientFicheId }] }
 */
export async function loadSousFicheLignes({ supabase, clientId, sousFicheId }) {
  const [{ data: fiche }, { data: lignes }] = await Promise.all([
    supabase.from('fiches').select('nom, instructions').eq('id', sousFicheId).eq('client_id', clientId).single(),
    supabase.from('fiche_ingredients')
      .select('ingredient_id, quantite, unite, ingredients(nom, fiche_id, est_sous_fiche)')
      .eq('fiche_id', sousFicheId).eq('client_id', clientId),
  ])
  return {
    nom: fiche?.nom || '',
    instructions: fiche?.instructions || '',
    lignes: (lignes || []).map(l => ({
      ingredient_id: l.ingredient_id,
      nom: l.ingredients?.nom || '',
      quantite: l.quantite,
      unite: l.unite,
      ingredientFicheId: l.ingredients?.fiche_id || null,
    })),
  }
}
