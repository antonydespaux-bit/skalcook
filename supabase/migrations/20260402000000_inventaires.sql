-- Module Inventaire : tables inventaires + inventaire_lignes + paramétrage tournant.

-- ─── Table inventaires (en-têtes) ────────────────────────────────────────────

create table if not exists public.inventaires (
  id                uuid        primary key default gen_random_uuid(),
  client_id         uuid        not null references public.clients (id) on delete cascade,
  type              text        not null check (type in ('tournant', 'complet')),
  section           text        not null check (section in ('cuisine', 'bar', 'global')),
  statut            text        not null default 'brouillon'
                                check (statut in ('brouillon', 'valide')),
  date_inventaire   date        not null default current_date,
  date_validation   timestamptz,
  valide_par        uuid        references public.profils (id),
  notes             text,
  periode_debut     date,
  periode_fin       date,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table public.inventaires is
  'En-têtes d''inventaire (tournant flash / complet clôture).';

create index if not exists inventaires_client_statut_idx
  on public.inventaires (client_id, statut);

create index if not exists inventaires_client_date_idx
  on public.inventaires (client_id, date_inventaire desc);

-- ─── Table inventaire_lignes (détail par ingrédient) ─────────────────────────

create table if not exists public.inventaire_lignes (
  id                    uuid        primary key default gen_random_uuid(),
  inventaire_id         uuid        not null references public.inventaires (id) on delete cascade,
  client_id             uuid        not null references public.clients (id) on delete cascade,
  ingredient_id         uuid,
  section               text        not null check (section in ('cuisine', 'bar')),
  nom_ingredient        text        not null,
  unite                 text        not null,
  quantite_theorique    numeric,
  quantite_reelle       numeric,
  cout_unitaire         numeric,
  est_critique          boolean     not null default false,
  ecart                 numeric     generated always as (quantite_reelle - quantite_theorique) stored,
  valeur_stock          numeric     generated always as (
                          coalesce(quantite_reelle, 0) * coalesce(cout_unitaire, 0)
                        ) stored,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

comment on table public.inventaire_lignes is
  'Lignes de comptage : une ligne par ingrédient par inventaire.';

create index if not exists inventaire_lignes_inventaire_idx
  on public.inventaire_lignes (inventaire_id);

create index if not exists inventaire_lignes_ingredient_idx
  on public.inventaire_lignes (client_id, ingredient_id);

-- ─── Triggers updated_at ─────────────────────────────────────────────────────

create or replace function public.inventaires_set_updated_at()
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

drop trigger if exists trg_inventaires_updated_at on public.inventaires;
create trigger trg_inventaires_updated_at
  before update on public.inventaires
  for each row
  execute function public.inventaires_set_updated_at();

drop trigger if exists trg_inventaire_lignes_updated_at on public.inventaire_lignes;
create trigger trg_inventaire_lignes_updated_at
  before update on public.inventaire_lignes
  for each row
  execute function public.inventaires_set_updated_at();

-- ─── RLS : inventaires ───────────────────────────────────────────────────────

alter table public.inventaires enable row level security;

create policy inventaires_select_autorise
  on public.inventaires for select to authenticated
  using (
    exists (
      select 1 from public.acces_clients ac
      where ac.user_id = auth.uid() and ac.client_id = inventaires.client_id
    )
  );

create policy inventaires_insert_autorise
  on public.inventaires for insert to authenticated
  with check (
    exists (
      select 1 from public.acces_clients ac
      where ac.user_id = auth.uid() and ac.client_id = inventaires.client_id
    )
  );

create policy inventaires_update_autorise
  on public.inventaires for update to authenticated
  using (
    exists (
      select 1 from public.acces_clients ac
      where ac.user_id = auth.uid() and ac.client_id = inventaires.client_id
    )
  )
  with check (
    exists (
      select 1 from public.acces_clients ac
      where ac.user_id = auth.uid() and ac.client_id = inventaires.client_id
    )
  );

create policy inventaires_delete_autorise
  on public.inventaires for delete to authenticated
  using (
    exists (
      select 1 from public.acces_clients ac
      where ac.user_id = auth.uid() and ac.client_id = inventaires.client_id
    )
  );

-- ─── RLS : inventaire_lignes ─────────────────────────────────────────────────

alter table public.inventaire_lignes enable row level security;

create policy inventaire_lignes_select_autorise
  on public.inventaire_lignes for select to authenticated
  using (
    exists (
      select 1 from public.acces_clients ac
      where ac.user_id = auth.uid() and ac.client_id = inventaire_lignes.client_id
    )
  );

create policy inventaire_lignes_insert_autorise
  on public.inventaire_lignes for insert to authenticated
  with check (
    exists (
      select 1 from public.acces_clients ac
      where ac.user_id = auth.uid() and ac.client_id = inventaire_lignes.client_id
    )
  );

create policy inventaire_lignes_update_autorise
  on public.inventaire_lignes for update to authenticated
  using (
    exists (
      select 1 from public.acces_clients ac
      where ac.user_id = auth.uid() and ac.client_id = inventaire_lignes.client_id
    )
  )
  with check (
    exists (
      select 1 from public.acces_clients ac
      where ac.user_id = auth.uid() and ac.client_id = inventaire_lignes.client_id
    )
  );

create policy inventaire_lignes_delete_autorise
  on public.inventaire_lignes for delete to authenticated
  using (
    exists (
      select 1 from public.acces_clients ac
      where ac.user_id = auth.uid() and ac.client_id = inventaire_lignes.client_id
    )
  );

-- ─── Colonnes paramétrage inventaire tournant sur clients ────────────────────

alter table public.clients
  add column if not exists inventaire_tournant_actif         boolean not null default true,
  add column if not exists inventaire_tournant_frequence     text    not null default 'weekly'
    check (inventaire_tournant_frequence in ('weekly', 'biweekly', 'monthly')),
  add column if not exists inventaire_tournant_jour_semaine  int     not null default 1
    check (inventaire_tournant_jour_semaine between 0 and 6),
  add column if not exists inventaire_tournant_heure         int     not null default 8
    check (inventaire_tournant_heure between 0 and 23),
  add column if not exists inventaire_tournant_dernier       date;
