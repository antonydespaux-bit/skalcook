-- Un restaurant TheFork peut correspondre à un lieu du groupe qui n'est pas
-- un établissement skalcook (ex. Maison Michodière) : ses réservations sont
-- rattachées à l'établissement qui encaisse (client_id) et gardent le lieu
-- (lieu_id) pour l'affichage.
ALTER TABLE public.crm_thefork_restaurants
  ADD COLUMN IF NOT EXISTS lieu_id uuid REFERENCES public.crm_lieux(id) ON DELETE SET NULL;
ALTER TABLE public.crm_reservations
  ADD COLUMN IF NOT EXISTS lieu_id uuid REFERENCES public.crm_lieux(id) ON DELETE SET NULL;
