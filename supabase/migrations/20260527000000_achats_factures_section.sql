-- Ajoute la notion de "section" (cuisine / bar) sur achats_factures.
-- Permet de distinguer les factures bar des factures cuisine pour :
--   1. Affichage avec un badge "Bar" dans la liste des achats.
--   2. Exclusion des achats bar du calcul du food cost (qui reste cuisine-only).
--   3. Routage de la mercuriale et de la rapprochement d'ingrédients vers la
--      bonne table (ingredients vs ingredients_bar).
--
-- Le stock théorique bar n'a rien de spécial à recevoir : `calculateStockTheorique`
-- charge déjà ingredients_bar pour la section bar et matche les achats_lignes
-- via ingredient_id — il suffit donc que les lignes pointent vers un id de
-- ingredients_bar pour qu'elles incrémentent le stock bar automatiquement.

ALTER TABLE public.achats_factures
  ADD COLUMN IF NOT EXISTS section text NOT NULL DEFAULT 'cuisine'
    CHECK (section IN ('cuisine', 'bar'));

COMMENT ON COLUMN public.achats_factures.section IS
  'Section comptable de la facture : cuisine (défaut) ou bar. Les factures bar sont exclues du food cost et leurs lignes pointent vers ingredients_bar.';

CREATE INDEX IF NOT EXISTS achats_factures_section_idx
  ON public.achats_factures (client_id, section);
