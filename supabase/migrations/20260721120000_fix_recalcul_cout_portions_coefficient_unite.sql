-- Corrige `recalculer_cout_portions()` / `..._bar()`, appelées par le bouton
-- « Recalcul du coût de toutes les fiches » de l'écran d'import.
--
-- Deux défauts, tous deux capables de corrompre massivement les coûts :
--
-- 1. Coefficient d'unité absent. `SUM(prix_kg * quantite)` traite une ligne en
--    grammes comme des kilos → coût 1000× trop élevé (100× pour cl, ml → 1000×).
--    C'est le bug que `lib/cout.js` documente comme corrigé côté JS, resté vivant
--    ici. On applique la même table de coefficients que `uniteCoefficient()`.
--
-- 2. Incompatibilité avec les préparations dosées. Une fiche étoilée produit un
--    batch (ex. 2800 g) dont seuls quelques grammes partent par assiette ; son
--    coût/portion est calculé par `coutPortionEtoile()` côté JS et enregistré à
--    la sauvegarde. La somme à plat compte le batch entier : mesuré sur MARSAN,
--    « BABA RHUBARBE » passerait de 1,80 € à 170,52 € (×95). On exclut donc
--    toute fiche possédant des sections — son coût appartient à l'éditeur.
--    Les fiches à plat (sans section), elles, correspondent exactement au modèle
--    de cette fonction et restent recalculées.
--
-- 3. Coefficient de perte absent. L'éditeur applique `cout / (1 - perte/100)`
--    (`calculerCoutAvecPerte()`), la fonction non : elle sous-évaluait donc les
--    70 fiches qui déclarent une perte (jusqu'à 20% chez MARSAN). On l'ajoute
--    pour que la fonction reproduise exactement le modèle JS.
--
-- Le bar n'a pas de sections (`fiche_sections` est côté cuisine) : seuls le
-- coefficient d'unité et la perte s'y appliquent.

CREATE OR REPLACE FUNCTION public.recalculer_cout_portions()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  UPDATE fiches f
  SET cout_portion = (
    SELECT SUM(
      i.prix_kg * fi.quantite *
      CASE
        WHEN fi.unite IN ('g', 'ml') THEN 0.001
        WHEN fi.unite = 'cl'         THEN 0.01
        ELSE 1
      END
    )
    -- Coefficient de perte, comme `calculerCoutAvecPerte()` côté JS.
    / NULLIF(1 - COALESCE(f.perte, 0) / 100, 0)
    / NULLIF(f.nb_portions, 0)
    FROM fiche_ingredients fi
    JOIN ingredients i ON i.id = fi.ingredient_id
    WHERE fi.fiche_id = f.id
    AND i.prix_kg IS NOT NULL
  )
  WHERE f.nb_portions > 0
  AND f.archive = false
  -- Coût piloté par le calcul dosé côté JS : ne pas écraser.
  AND NOT EXISTS (
    SELECT 1 FROM fiche_sections s WHERE s.fiche_id = f.id
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.recalculer_cout_portions_bar()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  UPDATE fiches_bar f
  SET cout_portion = (
    SELECT SUM(
      i.prix_kg * fi.quantite *
      CASE
        WHEN fi.unite IN ('g', 'ml') THEN 0.001
        WHEN fi.unite = 'cl'         THEN 0.01
        ELSE 1
      END
    )
    -- Coefficient de perte, comme `calculerCoutAvecPerte()` côté JS.
    / NULLIF(1 - COALESCE(f.perte, 0) / 100, 0)
    / NULLIF(f.nb_portions, 0)
    FROM fiche_bar_ingredients fi
    JOIN ingredients_bar i ON i.id = fi.ingredient_id
    WHERE fi.fiche_bar_id = f.id
    AND i.prix_kg IS NOT NULL
  )
  WHERE f.nb_portions > 0
  AND f.archive = false;
END;
$function$;
