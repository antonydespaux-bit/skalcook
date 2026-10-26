-- Import initial TheFork par les réservations (date de repas) plutôt que par
-- la liste globale des profils : vrai quand l'historique des réservations
-- depuis import_depuis a été entièrement listé.
ALTER TABLE public.crm_thefork_sync
  ADD COLUMN IF NOT EXISTS import_initial_fait boolean NOT NULL DEFAULT false;
ALTER TABLE public.crm_thefork_sync ALTER COLUMN import_depuis SET DEFAULT DATE '2024-01-01';
