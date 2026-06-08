-- Rendement (quantité produite) d'une section dosée, pour calculer son coût/assiette
-- EN DIRECT depuis sa recette : coût/assiette = (Σ lignes ÷ rendement) × dose.
-- Auparavant le coût d'une section dosée venait du coût figé de la sous-fiche
-- (snapshot à la promotion) → les ingrédients ajoutés ensuite n'étaient pas pris
-- en compte. Avec le rendement stocké sur la section, le coût devient live.
--
-- Colonnes additives/nullables → rétro-compatible.

ALTER TABLE public.fiche_sections
  ADD COLUMN IF NOT EXISTS rendement_portion numeric,
  ADD COLUMN IF NOT EXISTS rendement_unite text;

COMMENT ON COLUMN public.fiche_sections.rendement_portion IS
  'Quantité totale produite par la recette de la section (rendement/batch). Sert à calculer le coût unitaire live : Σ lignes ÷ rendement. NULL = pas de calcul live (fallback sous-fiche).';
COMMENT ON COLUMN public.fiche_sections.rendement_unite IS
  'Unité du rendement (g, kg, ml, cl, L, u, portions).';
