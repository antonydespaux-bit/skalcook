-- ============================================================================
-- lieux_service : ajout colonne parent_lieu_service_id pour regrouper
-- analytiquement des lieux qui sont physiquement séparés mais conceptuellement
-- liés.
--
-- Cas Marsan :
--   - Table du chef est saisie séparément (caisse à part dans le restaurant)
--     mais analytiquement c'est de la Salle à manger.
--   - La cave est un alias pour Table de partage (même endroit, deux noms).
--
-- Effet attendu côté app :
--   - Saisie / Budgets / Excel équipes : chaque lieu reste indépendant
--     (chaque enfant a son budget, sa grille, ses cellules ca_journalier)
--   - Analyses / Rapport hebdo : agrégations groupent par parent
--     → la Salle à manger inclut Table du chef, Table de partage inclut
--       La cave.
--   - Filtre par parent dans /analyses inclut automatiquement les enfants
-- ============================================================================

ALTER TABLE public.lieux_service
  ADD COLUMN IF NOT EXISTS parent_lieu_service_id uuid
  REFERENCES public.lieux_service (id) ON DELETE SET NULL;

COMMENT ON COLUMN public.lieux_service.parent_lieu_service_id IS
  'Si renseigné, ce lieu est analytiquement groupé sous son parent. La saisie reste séparée mais les analyses regroupent.';

CREATE INDEX IF NOT EXISTS lieux_service_parent_idx
  ON public.lieux_service (parent_lieu_service_id) WHERE parent_lieu_service_id IS NOT NULL;
