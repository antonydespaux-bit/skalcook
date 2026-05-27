-- Drop la FK achats_lignes.ingredient_id → ingredients(id).
--
-- Pourquoi : depuis l'introduction de la section "bar", `ingredient_id` peut
-- pointer soit vers ingredients (section cuisine), soit vers ingredients_bar
-- (section bar). PostgreSQL ne sait pas exprimer une FK polymorphique, donc
-- on retire la contrainte et on laisse l'application gérer l'intégrité
-- (logique déjà en place dans inventaire.service / achats.service qui chargent
-- la bonne table selon `achats_factures.section`).
--
-- Trade-off accepté : on perd le ON DELETE SET NULL automatique. Si un
-- ingrédient est supprimé, son id restera dans achats_lignes mais ne
-- matchera plus aucun row côté ingrédients (l'UI affichera juste "non
-- reconnu", ce qui est OK pour de la facture historique).

ALTER TABLE public.achats_lignes
  DROP CONSTRAINT IF EXISTS achats_lignes_ingredient_id_fkey;

COMMENT ON COLUMN public.achats_lignes.ingredient_id IS
  'UUID d''ingrédient. Pointe vers ingredients(id) si la facture est section cuisine, vers ingredients_bar(id) si section bar. Pas de FK car PostgreSQL ne supporte pas les FK polymorphiques.';

-- Même raison pour fournisseur_mapping : on apprend les mappings
-- "désignation fournisseur → ingrédient" pour les deux sections. Si la FK
-- pointe vers `ingredients` uniquement, on ne peut pas mapper une désignation
-- vers un ingredient_bar.
ALTER TABLE public.fournisseur_mapping
  DROP CONSTRAINT IF EXISTS fournisseur_mapping_ingredient_id_fkey;

COMMENT ON COLUMN public.fournisseur_mapping.ingredient_id IS
  'UUID d''ingrédient (table ingredients OU ingredients_bar). Pas de FK car polymorphique selon la section de la facture qui a produit l''apprentissage.';
