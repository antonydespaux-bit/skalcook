-- ============================================================================
-- CA journalier : digitalisation du suivi mensuel manuel (Excel "CA Marsan").
--
-- Saisie quotidienne par lieu de service x service (lunch/dinner) :
--   couverts + CA Food + CA Bev 20% + CA Bev 10% + Autres CA.
--
-- TM (ticket moyen), totaux et ecarts sont CALCULES EN LECTURE (vues / front),
-- jamais stockes : on evite les formules cassees.
--
-- 4 tables :
--   1. lieux_service  : lieux parametrables (Salle a manger, Privat, ...).
--   2. ca_journalier  : saisie reelle par (jour, lieu_service, service).
--   3. ca_budgets     : objectifs recurrents par (jour de semaine, lieu, service).
--   4. ca_offerts     : suivi des offerts (motif, garcon, montant).
-- ============================================================================

-- ─── 1. lieux_service ─────────────────────────────────────────────────────────

create table if not exists public.lieux_service (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  nom text not null,
  ordre integer not null default 0,
  actif boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lieux_service_unique_client_nom unique (client_id, nom)
);

comment on table public.lieux_service is
  'Lieux de service en salle (parametrables par client) : Salle a manger, Privat, Table du chef, etc.';
comment on column public.lieux_service.actif is
  'Permet de retirer un lieu sans casser l''historique des saisies passees.';
comment on column public.lieux_service.ordre is
  'Ordre d''affichage dans les ecrans de saisie.';

create index if not exists lieux_service_client_id_idx
  on public.lieux_service (client_id);

-- ─── 2. ca_journalier ─────────────────────────────────────────────────────────

create table if not exists public.ca_journalier (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  jour date not null,
  lieu_service_id uuid not null references public.lieux_service (id) on delete restrict,
  service text not null check (service in ('lunch', 'dinner')),
  couverts integer not null default 0 check (couverts >= 0),
  ca_food numeric(10, 2) not null default 0 check (ca_food >= 0),
  ca_bev_20 numeric(10, 2) not null default 0 check (ca_bev_20 >= 0),
  ca_bev_10 numeric(10, 2) not null default 0 check (ca_bev_10 >= 0),
  ca_autre numeric(10, 2) not null default 0 check (ca_autre >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ca_journalier_unique_jour_lieu_service
    unique (client_id, jour, lieu_service_id, service)
);

comment on table public.ca_journalier is
  'Saisie quotidienne du CA par lieu de service et service (lunch/dinner). 1 ligne = 1 case du tableau.';
comment on column public.ca_journalier.ca_food is 'CA TTC Food (categorie alimentation).';
comment on column public.ca_journalier.ca_bev_20 is 'CA TTC Alcool (TVA 20%).';
comment on column public.ca_journalier.ca_bev_10 is 'CA TTC Soft / boissons non alcoolisees (TVA 10%).';
comment on column public.ca_journalier.ca_autre is 'Autres CA (boutique, divers).';

create index if not exists ca_journalier_client_jour_idx
  on public.ca_journalier (client_id, jour);
create index if not exists ca_journalier_client_lieu_idx
  on public.ca_journalier (client_id, lieu_service_id);

-- ─── 3. ca_budgets ────────────────────────────────────────────────────────────

create table if not exists public.ca_budgets (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  jour_semaine smallint not null check (jour_semaine between 1 and 7),
  lieu_service_id uuid not null references public.lieux_service (id) on delete cascade,
  service text not null check (service in ('lunch', 'dinner')),
  couverts_cible integer not null default 0 check (couverts_cible >= 0),
  ca_food_cible numeric(10, 2) not null default 0 check (ca_food_cible >= 0),
  ca_bev_20_cible numeric(10, 2) not null default 0 check (ca_bev_20_cible >= 0),
  ca_bev_10_cible numeric(10, 2) not null default 0 check (ca_bev_10_cible >= 0),
  ca_autre_cible numeric(10, 2) not null default 0 check (ca_autre_cible >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ca_budgets_unique_jourdesem_lieu_service
    unique (client_id, jour_semaine, lieu_service_id, service)
);

comment on table public.ca_budgets is
  'Objectifs recurrents par jour de la semaine, lieu de service et service. Option A : meme cible pour tous les mardis midi du Salon.';
comment on column public.ca_budgets.jour_semaine is
  '1 = lundi ... 7 = dimanche (convention ISO 8601, alignee sur EXTRACT(isodow)).';

create index if not exists ca_budgets_client_idx on public.ca_budgets (client_id);

-- ─── 4. ca_offerts ────────────────────────────────────────────────────────────

create table if not exists public.ca_offerts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  jour date not null,
  lieu_service_id uuid references public.lieux_service (id) on delete set null,
  service text check (service in ('lunch', 'dinner')),
  table_motif text,
  garcon text,
  libelle text not null,
  quantite numeric(10, 2) not null default 1 check (quantite > 0),
  montant numeric(10, 2) not null default 0 check (montant >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.ca_offerts is
  'Suivi des offerts (table/motif, garcon, libelle, quantite, montant). Equivalent de l''onglet "Suivi Offert" de l''Excel.';

create index if not exists ca_offerts_client_jour_idx
  on public.ca_offerts (client_id, jour);

-- ─── 5. Triggers updated_at ──────────────────────────────────────────────────

create or replace function public.ca_set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_lieux_service_updated_at on public.lieux_service;
create trigger trg_lieux_service_updated_at
  before update on public.lieux_service
  for each row execute function public.ca_set_updated_at();

drop trigger if exists trg_ca_journalier_updated_at on public.ca_journalier;
create trigger trg_ca_journalier_updated_at
  before update on public.ca_journalier
  for each row execute function public.ca_set_updated_at();

drop trigger if exists trg_ca_budgets_updated_at on public.ca_budgets;
create trigger trg_ca_budgets_updated_at
  before update on public.ca_budgets
  for each row execute function public.ca_set_updated_at();

drop trigger if exists trg_ca_offerts_updated_at on public.ca_offerts;
create trigger trg_ca_offerts_updated_at
  before update on public.ca_offerts
  for each row execute function public.ca_set_updated_at();

-- ─── 6. Row Level Security ───────────────────────────────────────────────────
-- Pattern reutilise depuis 20260405000000_enable_rls_all_tables.sql.

alter table public.lieux_service enable row level security;
create policy lieux_service_select on public.lieux_service for select to authenticated
  using (public.user_has_client_access(client_id));
create policy lieux_service_insert on public.lieux_service for insert to authenticated
  with check (public.user_has_client_access(client_id));
create policy lieux_service_update on public.lieux_service for update to authenticated
  using (public.user_has_client_access(client_id))
  with check (public.user_has_client_access(client_id));
create policy lieux_service_delete on public.lieux_service for delete to authenticated
  using (public.user_has_client_access(client_id));

alter table public.ca_journalier enable row level security;
create policy ca_journalier_select on public.ca_journalier for select to authenticated
  using (public.user_has_client_access(client_id));
create policy ca_journalier_insert on public.ca_journalier for insert to authenticated
  with check (public.user_has_client_access(client_id));
create policy ca_journalier_update on public.ca_journalier for update to authenticated
  using (public.user_has_client_access(client_id))
  with check (public.user_has_client_access(client_id));
create policy ca_journalier_delete on public.ca_journalier for delete to authenticated
  using (public.user_has_client_access(client_id));

alter table public.ca_budgets enable row level security;
create policy ca_budgets_select on public.ca_budgets for select to authenticated
  using (public.user_has_client_access(client_id));
create policy ca_budgets_insert on public.ca_budgets for insert to authenticated
  with check (public.user_has_client_access(client_id));
create policy ca_budgets_update on public.ca_budgets for update to authenticated
  using (public.user_has_client_access(client_id))
  with check (public.user_has_client_access(client_id));
create policy ca_budgets_delete on public.ca_budgets for delete to authenticated
  using (public.user_has_client_access(client_id));

alter table public.ca_offerts enable row level security;
create policy ca_offerts_select on public.ca_offerts for select to authenticated
  using (public.user_has_client_access(client_id));
create policy ca_offerts_insert on public.ca_offerts for insert to authenticated
  with check (public.user_has_client_access(client_id));
create policy ca_offerts_update on public.ca_offerts for update to authenticated
  using (public.user_has_client_access(client_id))
  with check (public.user_has_client_access(client_id));
create policy ca_offerts_delete on public.ca_offerts for delete to authenticated
  using (public.user_has_client_access(client_id));
