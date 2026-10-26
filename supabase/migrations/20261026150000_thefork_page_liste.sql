-- Synchro TheFork : position de lecture des listes à la page près, pour que
-- chaque passe avance même quand une tranche compte des centaines de pages.
ALTER TABLE public.crm_thefork_sync
  ADD COLUMN IF NOT EXISTS page_clients integer NOT NULL DEFAULT 1 CHECK (page_clients > 0),
  ADD COLUMN IF NOT EXISTS page_reservations integer NOT NULL DEFAULT 1 CHECK (page_reservations > 0);
