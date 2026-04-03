-- Aligner inventaires et inventaire_lignes sur le pattern du projet :
-- toutes les autres tables (fiches, ingredients, achats_factures, ventes_journalieres...)
-- n'ont PAS de RLS et comptent uniquement sur un filtre applicatif .eq('client_id', clientId).
-- La RLS bloquait les superadmins sans entrée dans acces_clients → 406 → redirect loop.

alter table public.inventaires       disable row level security;
alter table public.inventaire_lignes disable row level security;
