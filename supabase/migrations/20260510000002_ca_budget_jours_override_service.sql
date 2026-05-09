-- ============================================================================
-- ca_budget_jours_override : ajout colonne service pour permettre un override
-- distinct entre déjeuner et dîner sur le même jour-de-semaine.
--
-- Cas d'usage : 4 jeudis ouverts le midi mais 5 le soir (fermeture
-- exceptionnelle d'un déjeuner uniquement).
--
-- Migration des rows existantes : chaque row sans service est dupliquée
-- en (lunch, dinner) avec la même valeur nb_jours pour préserver le
-- comportement actuel (override unique partagé) le temps que l'user
-- édite explicitement chaque service.
-- ============================================================================

-- 1. Drop ancien unique en premier pour autoriser les INSERT du backfill
ALTER TABLE public.ca_budget_jours_override
  DROP CONSTRAINT IF EXISTS ca_budget_jours_override_unique;

-- 2. Ajouter colonne service nullable
ALTER TABLE public.ca_budget_jours_override
  ADD COLUMN IF NOT EXISTS service text;

-- 3. Backfill : duplique chaque row sans service en (lunch, dinner)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.ca_budget_jours_override WHERE service IS NULL) THEN
    INSERT INTO public.ca_budget_jours_override
      (client_id, annee, mois, jour_semaine, nb_jours, service)
    SELECT client_id, annee, mois, jour_semaine, nb_jours, 'dinner'
      FROM public.ca_budget_jours_override
     WHERE service IS NULL;

    UPDATE public.ca_budget_jours_override
       SET service = 'lunch'
     WHERE service IS NULL;
  END IF;
END $$;

-- 4. Verrouille la colonne
ALTER TABLE public.ca_budget_jours_override
  ALTER COLUMN service SET NOT NULL;

ALTER TABLE public.ca_budget_jours_override
  ADD CONSTRAINT ca_budget_jours_override_service_check
    CHECK (service IN ('lunch', 'dinner'));

-- 5. Nouveau unique incluant service
ALTER TABLE public.ca_budget_jours_override
  ADD CONSTRAINT ca_budget_jours_override_unique
  UNIQUE (client_id, annee, mois, jour_semaine, service);

COMMENT ON COLUMN public.ca_budget_jours_override.service IS
  'Service concerné par l''override : lunch (déjeuner) ou dinner (dîner). Permet d''avoir 4 jeudis midi et 5 jeudis soir.';
