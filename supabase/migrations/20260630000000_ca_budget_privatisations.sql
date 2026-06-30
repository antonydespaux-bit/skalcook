-- ============================================================================
-- ca_budget_privatisations : enveloppe budgétaire mensuelle des privatisations.
--
-- Problème résolu : une privatisation est un revenu événementiel ponctuel
-- (saisi sur le jour réel de l'event, sous un lieu "Privat"). Le budget
-- récurrent par jour-de-semaine (ca_budgets) ne sait pas la représenter :
-- soit elle n'est pas budgétée (écart faussé), soit son ca_autre_cible est
-- multiplié par chaque occurrence du jour-de-semaine (montant absurde).
--
-- Solution : un montant forfaitaire PAR MOIS, que le front LISSE sur tous les
-- jours du mois (budget/jour = montant / nb_jours_du_mois). Côté réel, on
-- lisse symétriquement le CA des lieux Privat (couverts_indicatifs = true).
-- Résultat : plus de pic d'écart le jour de la privatisation, et le cumul
-- mensuel reste exact.
--
-- 1 ligne = 1 mois (client_id, annee, mois). Montant global établissement
-- (pas de split par lieu, choix produit assumé pour rester simple à saisir).
-- ============================================================================

create table if not exists public.ca_budget_privatisations (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  annee smallint not null check (annee between 2000 and 2100),
  mois smallint not null check (mois between 1 and 12),
  montant numeric(10, 2) not null default 0 check (montant >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ca_budget_privatisations_unique_mois
    unique (client_id, annee, mois)
);

comment on table public.ca_budget_privatisations is
  'Budget mensuel des privatisations (montant forfaitaire / mois). Lissé jour par jour côté front.';
comment on column public.ca_budget_privatisations.montant is
  'Objectif de CA privatisation pour le mois entier (TTC). Réparti également sur les jours du mois à l''affichage.';

create index if not exists ca_budget_privatisations_client_idx
  on public.ca_budget_privatisations (client_id, annee, mois);

drop trigger if exists trg_ca_budget_privatisations_updated_at on public.ca_budget_privatisations;
create trigger trg_ca_budget_privatisations_updated_at
  before update on public.ca_budget_privatisations
  for each row execute function public.ca_set_updated_at();

-- ─── Row Level Security ──────────────────────────────────────────────────────
-- Même pattern que ca_budgets (cf. 20260506000000_ca_journalier.sql).

alter table public.ca_budget_privatisations enable row level security;
create policy ca_budget_privatisations_select on public.ca_budget_privatisations for select to authenticated
  using (public.user_has_client_access(client_id));
create policy ca_budget_privatisations_insert on public.ca_budget_privatisations for insert to authenticated
  with check (public.user_has_client_access(client_id));
create policy ca_budget_privatisations_update on public.ca_budget_privatisations for update to authenticated
  using (public.user_has_client_access(client_id))
  with check (public.user_has_client_access(client_id));
create policy ca_budget_privatisations_delete on public.ca_budget_privatisations for delete to authenticated
  using (public.user_has_client_access(client_id));
