-- ============================================================================
-- ca_budgets : ajout saisonnalite (mois) + table d'audit + trigger automatique.
--
-- 1. Ajout colonne mois (NULL = budget par defaut, 1-12 = override mensuel).
-- 2. Ajout colonne raison_modification (texte libre que l'user remplit).
-- 3. Nouvelle contrainte unique incluant mois (NULLS NOT DISTINCT).
-- 4. Table ca_budgets_audit (log de chaque INSERT/UPDATE/DELETE).
-- 5. Trigger SECURITY DEFINER qui ecrit dans audit a chaque change.
-- ============================================================================

-- 1+2. Colonnes
alter table public.ca_budgets
  add column if not exists mois smallint check (mois between 1 and 12);

alter table public.ca_budgets
  add column if not exists raison_modification text;

comment on column public.ca_budgets.mois is
  'NULL = budget recurrent par defaut. 1-12 = override pour ce mois precis (ex: 8 = aout ferme, 10 = TM samedi plus haut).';
comment on column public.ca_budgets.raison_modification is
  'Texte libre rempli par l''user lors d''une modification (sera copie dans ca_budgets_audit.raison).';

-- 3. Contrainte unique incluant mois
alter table public.ca_budgets
  drop constraint if exists ca_budgets_unique_jourdesem_lieu_service;

alter table public.ca_budgets
  add constraint ca_budgets_unique_mois_jds_lieu_service
  unique nulls not distinct (client_id, mois, jour_semaine, lieu_service_id, service);

-- 4. Table d'audit
create table if not exists public.ca_budgets_audit (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  budget_id uuid,
  action text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  changed_by uuid,
  raison text,
  old_values jsonb,
  new_values jsonb,
  changed_at timestamptz not null default now()
);

comment on table public.ca_budgets_audit is
  'Log automatique des modifications de ca_budgets. Ecrit par trigger SECURITY DEFINER, lecture seule pour les users authentifies.';

create index if not exists ca_budgets_audit_budget_idx
  on public.ca_budgets_audit (budget_id, changed_at desc);
create index if not exists ca_budgets_audit_client_idx
  on public.ca_budgets_audit (client_id, changed_at desc);

-- 5. Trigger function
create or replace function public.ca_budgets_log_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.ca_budgets_audit
      (client_id, budget_id, action, changed_by, raison, new_values)
    values
      (new.client_id, new.id, 'INSERT', auth.uid(), new.raison_modification, to_jsonb(new));
    return new;
  elsif tg_op = 'UPDATE' then
    -- Skip si rien n'a change a part updated_at (evite spam audit sur no-op).
    if (to_jsonb(new) - 'updated_at' - 'raison_modification')
        is distinct from
       (to_jsonb(old) - 'updated_at' - 'raison_modification')
    then
      insert into public.ca_budgets_audit
        (client_id, budget_id, action, changed_by, raison, old_values, new_values)
      values
        (new.client_id, new.id, 'UPDATE', auth.uid(), new.raison_modification, to_jsonb(old), to_jsonb(new));
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    insert into public.ca_budgets_audit
      (client_id, budget_id, action, changed_by, raison, old_values)
    values
      (old.client_id, old.id, 'DELETE', auth.uid(), old.raison_modification, to_jsonb(old));
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_ca_budgets_audit on public.ca_budgets;
create trigger trg_ca_budgets_audit
  after insert or update or delete on public.ca_budgets
  for each row execute function public.ca_budgets_log_change();

-- 6. RLS audit : lecture seule via user_has_client_access. Pas de policy
-- INSERT/UPDATE/DELETE : seul le trigger SECURITY DEFINER peut ecrire.
alter table public.ca_budgets_audit enable row level security;

create policy ca_budgets_audit_select on public.ca_budgets_audit
  for select to authenticated
  using (public.user_has_client_access(client_id));

revoke insert, update, delete on public.ca_budgets_audit from authenticated;
revoke insert, update, delete on public.ca_budgets_audit from anon;
