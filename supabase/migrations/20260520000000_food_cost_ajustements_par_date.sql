-- ============================================================================
-- food_cost_ajustements : passage à un modèle daté + indépendant des rapports.
--
-- Avant : chaque ajustement appartenait à UN rapport (rapport_id NOT NULL),
-- donc à une période exacte [periode_debut, periode_fin]. Conséquence : si on
-- changeait la période d'affichage, on perdait les ajustements précédemment
-- saisis (un autre rapport = un autre jeu d'ajustements).
--
-- Après : chaque ajustement porte une date (date_ajustement). Quand on calcule
-- le ratio food cost pour une période, on inclut tous les ajustements du client
-- dont date_ajustement tombe dans [periode_debut, periode_fin]. Le rapport ne
-- sert plus qu'à mémoriser les inventaires/notes de la période sauvegardée.
--
-- Migration des données existantes :
--   - date_ajustement = periode_fin du rapport associé (date plausible la plus
--     proche, puisqu'on n'a pas mieux). Si rapport_id NULL → created_at::date.
--   - rapport_id reste pour historique mais devient nullable (les nouveaux
--     ajustements peuvent être créés sans rapport sauvegardé).
-- ============================================================================

-- 1. Ajout de la colonne date_ajustement, initialement nullable pour permettre
--    le backfill, puis NOT NULL.
ALTER TABLE public.food_cost_ajustements
  ADD COLUMN IF NOT EXISTS date_ajustement date;

-- 2. Backfill depuis le rapport parent (periode_fin = date la plus représentative).
UPDATE public.food_cost_ajustements a
SET date_ajustement = r.periode_fin
FROM public.food_cost_rapports r
WHERE a.rapport_id = r.id
  AND a.date_ajustement IS NULL;

-- 3. Filet de sécurité : tout ajustement orphelin (rapport supprimé / null) →
--    on utilise created_at comme fallback.
UPDATE public.food_cost_ajustements
SET date_ajustement = created_at::date
WHERE date_ajustement IS NULL;

-- 4. Verrouillage NOT NULL.
ALTER TABLE public.food_cost_ajustements
  ALTER COLUMN date_ajustement SET NOT NULL;

-- 5. Rendre rapport_id nullable : les nouveaux ajustements n'ont plus besoin
--    d'être rattachés à un rapport sauvegardé.
ALTER TABLE public.food_cost_ajustements
  ALTER COLUMN rapport_id DROP NOT NULL;

-- 6. Index sur (client_id, date_ajustement) pour la requête principale
--    "ajustements d'une période".
CREATE INDEX IF NOT EXISTS food_cost_ajustements_client_date_idx
  ON public.food_cost_ajustements (client_id, date_ajustement);

COMMENT ON COLUMN public.food_cost_ajustements.date_ajustement IS
  'Date à laquelle l''ajustement s''applique. Inclut l''ajustement dans tout rapport food cost dont la période couvre cette date.';
COMMENT ON COLUMN public.food_cost_ajustements.rapport_id IS
  'Rapport food cost dans lequel l''ajustement a été créé (historique uniquement). Peut être NULL si l''ajustement a été créé hors d''un rapport sauvegardé.';
