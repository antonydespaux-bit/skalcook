-- Mémorisation des associations Lightspeed → fiche technique (cuisine / bar).

create table if not exists public.mapping_ventes (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  designation_lightspeed text not null,
  fiche_id uuid not null,
  source_table text not null check (source_table in ('fiches', 'fiches_bar')),
  designation_norm text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mapping_ventes_unique_client_desig unique (client_id, designation_norm)
);

comment on table public.mapping_ventes is
  'Correspondance apprise entre une désignation Lightspeed (racine sans parenthèses) et une fiche technique.';

comment on column public.mapping_ventes.designation_lightspeed is
  'Libellé Lightspeed canonique (ex. racine sans suffixe entre parenthèses).';

comment on column public.mapping_ventes.source_table is 'fiches (cuisine) ou fiches_bar.';

comment on column public.mapping_ventes.designation_norm is 'lower(trim(designation_lightspeed)), rempli par trigger (clé d’unicité / upsert).';

create or replace function public.mapping_ventes_fill_designation_norm()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.designation_norm := lower(trim(new.designation_lightspeed));
  return new;
end;
$$;

drop trigger if exists trg_mapping_ventes_fill_norm on public.mapping_ventes;

create trigger trg_mapping_ventes_fill_norm
  before insert or update of designation_lightspeed
  on public.mapping_ventes
  for each row
  execute function public.mapping_ventes_fill_designation_norm();

create index if not exists mapping_ventes_client_id_idx on public.mapping_ventes (client_id);

create or replace function public.mapping_ventes_set_updated_at()
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

drop trigger if exists trg_mapping_ventes_updated_at on public.mapping_ventes;

create trigger trg_mapping_ventes_updated_at
  before update on public.mapping_ventes
  for each row
  execute function public.mapping_ventes_set_updated_at();

alter table public.mapping_ventes enable row level security;

create policy mapping_ventes_select_autorise
  on public.mapping_ventes
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.acces_clients ac
      where ac.user_id = auth.uid()
        and ac.client_id = mapping_ventes.client_id
    )
  );

create policy mapping_ventes_insert_autorise
  on public.mapping_ventes
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.acces_clients ac
      where ac.user_id = auth.uid()
        and ac.client_id = mapping_ventes.client_id
    )
  );

create policy mapping_ventes_update_autorise
  on public.mapping_ventes
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.acces_clients ac
      where ac.user_id = auth.uid()
        and ac.client_id = mapping_ventes.client_id
    )
  )
  with check (
    exists (
      select 1
      from public.acces_clients ac
      where ac.user_id = auth.uid()
        and ac.client_id = mapping_ventes.client_id
    )
  );

create policy mapping_ventes_delete_autorise
  on public.mapping_ventes
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.acces_clients ac
      where ac.user_id = auth.uid()
        and ac.client_id = mapping_ventes.client_id
    )
  );
