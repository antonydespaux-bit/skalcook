-- ============================================================================
-- ca_budget_jours_override : ajout colonne lieu_service_id pour permettre
-- un override distinct par lieu.
--
-- Cas typique Marsan : "tous les mois, on retire 2 jours de CA sur la
-- Table de partage car on a prévu 2 events de privatisation". L'override
-- doit donc s'appliquer UNIQUEMENT à la Table de partage, pas aux autres
-- lieux (Salle à manger, etc.).
--
-- Avant : (client_id, annee, mois, jour_semaine, service) unique
--   → toutes les cellules budget de ce (mois, jds, svc) utilisent le même
--     nb_jours, peu importe le lieu.
-- Après : (client_id, annee, mois, jour_semaine, service, lieu_service_id)
--   avec lieu_service_id nullable.
--   → NULL = override global (rétro-compat avec les rows existantes)
--   → UUID = override spécifique à ce lieu
--   → priorité lookup côté app : (lieu) > (NULL) > calendrier
-- ============================================================================

-- 1. Ajouter colonne nullable
ALTER TABLE public.ca_budget_jours_override
  ADD COLUMN IF NOT EXISTS lieu_service_id uuid
  REFERENCES public.lieux_service (id) ON DELETE CASCADE;

-- 2. Drop ancien unique
ALTER TABLE public.ca_budget_jours_override
  DROP CONSTRAINT IF EXISTS ca_budget_jours_override_unique;

-- 3. Nouvel unique incluant lieu_service_id (NULLS NOT DISTINCT pour que
--    NULL=NULL côté unicity → un seul override global possible par (mois,
--    jds, svc), comme avant).
ALTER TABLE public.ca_budget_jours_override
  ADD CONSTRAINT ca_budget_jours_override_unique
  UNIQUE NULLS NOT DISTINCT (client_id, annee, mois, jour_semaine, service, lieu_service_id);

COMMENT ON COLUMN public.ca_budget_jours_override.lieu_service_id IS
  'Si NULL : override global pour tous les lieux (rétro-compat). Si UUID : override spécifique à ce lieu, prioritaire sur le global.';

CREATE INDEX IF NOT EXISTS ca_budget_jours_override_client_lieu_idx
  ON public.ca_budget_jours_override (client_id, annee, mois, lieu_service_id);
