-- ============================================================================
-- ca_budgets : ajout colonne annee (budget distinct par année).
--
-- Avant : (client_id, mois, jour_semaine, lieu_service_id, service) avec
--   mois NULL = défaut, mois 1..12 = override mensuel.
--   Les budgets s'appliquaient à toutes les années indistinctement.
--
-- Après : (client_id, annee, mois, jour_semaine, lieu_service_id, service).
--   Chaque budget est désormais ancré sur une année précise. Les "défauts"
--   (mois NULL) restent par année (un défaut 2026 ne s'applique pas à 2027).
-- ============================================================================

-- 1. Colonne annee, backfill à 2026 pour l'existant
alter table public.ca_budgets
  add column if not exists annee smallint;

update public.ca_budgets
   set annee = 2026
 where annee is null;

alter table public.ca_budgets
  alter column annee set not null,
  alter column annee set default extract(year from now())::smallint,
  add constraint ca_budgets_annee_check check (annee between 2024 and 2100);

create index if not exists ca_budgets_client_annee_idx
  on public.ca_budgets (client_id, annee);

-- 2. Remplace la contrainte unique pour inclure annee
alter table public.ca_budgets
  drop constraint if exists ca_budgets_unique_mois_jds_lieu_service;

alter table public.ca_budgets
  add constraint ca_budgets_unique_annee_mois_jds_lieu_service
  unique nulls not distinct (client_id, annee, mois, jour_semaine, lieu_service_id, service);

comment on column public.ca_budgets.annee is
  'Année du budget (ex: 2026, 2027). Permet de stocker des budgets distincts par année — janvier 2026 et janvier 2027 sont deux records séparés.';
