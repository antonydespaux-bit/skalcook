-- Cloisonnement des rôles bar/cuisine au niveau RLS.
--
-- Avant : fiches / fiches_bar / ingredients / ingredients_bar utilisaient toutes
-- `user_has_client_access(client_id)`, qui ne teste QUE l'appartenance au client,
-- sans le rôle. Conséquence : un membre 'cuisine' pouvait lire/écrire les données
-- 'bar' du même établissement (et inversement), et 'directeur' (censé être en
-- lecture seule côté front) pouvait écrire. Le front (lib/useRole.js) appliquait
-- déjà ce cloisonnement, mais purement cosmétiquement — la base restait ouverte.
--
-- Toutes les écritures de ces 4 tables passent en direct navigateur (RLS = seul
-- point d'application ; aucune route API service_role ne les écrit, sauf l'import
-- réservé admin/superadmin). On corrige donc ici, au niveau base.
--
-- Modèle (dérivé de useRole.js : peutVoirCuisine / peutVoirBar / peutModifier) :
--   superadmin / admin → lecture + écriture des 2 sections
--   directeur          → lecture des 2 sections, écriture d'aucune
--   cuisine            → lecture + écriture section 'cuisine' uniquement
--   bar                → lecture + écriture section 'bar' uniquement
--
-- Tables → section : fiches/ingredients = 'cuisine' ; fiches_bar/ingredients_bar = 'bar'.

-- ─── 1. Helpers SECURITY DEFINER (évitent la récursion RLS sur acces_clients) ──

create or replace function public.user_can_read_section(p_client_id uuid, p_section text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    auth.uid() is not null
    and (
      coalesce(public.get_my_is_superadmin(), false)
      or exists (
        select 1 from public.acces_clients
        where user_id = auth.uid()
          and client_id = p_client_id
          and (
            role in ('admin', 'directeur')  -- accès complet aux 2 sections
            or role = p_section              -- 'cuisine' ↔ cuisine, 'bar' ↔ bar
          )
      )
    );
$$;

comment on function public.user_can_read_section(uuid, text) is
  'RLS helper : true si l''utilisateur peut LIRE la section donnée (cuisine|bar) pour ce client. superadmin/admin/directeur = 2 sections ; cuisine/bar = leur section.';

create or replace function public.user_can_write_section(p_client_id uuid, p_section text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    auth.uid() is not null
    and (
      coalesce(public.get_my_is_superadmin(), false)
      or exists (
        select 1 from public.acces_clients
        where user_id = auth.uid()
          and client_id = p_client_id
          and (
            role = 'admin'      -- seul rôle non-section autorisé à écrire les 2 sections
            or role = p_section  -- 'cuisine' ↔ cuisine, 'bar' ↔ bar (directeur exclu = lecture seule)
          )
      )
    );
$$;

comment on function public.user_can_write_section(uuid, text) is
  'RLS helper : true si l''utilisateur peut ÉCRIRE la section donnée (cuisine|bar) pour ce client. superadmin/admin = 2 sections ; cuisine/bar = leur section ; directeur = aucune (lecture seule).';

grant execute on function public.user_can_read_section(uuid, text)  to authenticated;
grant execute on function public.user_can_write_section(uuid, text) to authenticated;

-- ─── 2. fiches (section 'cuisine') ─────────────────────────────────────────────
drop policy if exists fiches_select on public.fiches;
drop policy if exists fiches_insert on public.fiches;
drop policy if exists fiches_update on public.fiches;
drop policy if exists fiches_delete on public.fiches;

create policy fiches_select on public.fiches for select to authenticated
  using (public.user_can_read_section(client_id, 'cuisine'));
create policy fiches_insert on public.fiches for insert to authenticated
  with check (public.user_can_write_section(client_id, 'cuisine'));
create policy fiches_update on public.fiches for update to authenticated
  using (public.user_can_write_section(client_id, 'cuisine'))
  with check (public.user_can_write_section(client_id, 'cuisine'));
create policy fiches_delete on public.fiches for delete to authenticated
  using (public.user_can_write_section(client_id, 'cuisine'));

-- ─── 3. ingredients (section 'cuisine') ────────────────────────────────────────
drop policy if exists ingredients_select on public.ingredients;
drop policy if exists ingredients_insert on public.ingredients;
drop policy if exists ingredients_update on public.ingredients;
drop policy if exists ingredients_delete on public.ingredients;

create policy ingredients_select on public.ingredients for select to authenticated
  using (public.user_can_read_section(client_id, 'cuisine'));
create policy ingredients_insert on public.ingredients for insert to authenticated
  with check (public.user_can_write_section(client_id, 'cuisine'));
create policy ingredients_update on public.ingredients for update to authenticated
  using (public.user_can_write_section(client_id, 'cuisine'))
  with check (public.user_can_write_section(client_id, 'cuisine'));
create policy ingredients_delete on public.ingredients for delete to authenticated
  using (public.user_can_write_section(client_id, 'cuisine'));

-- ─── 4. fiches_bar (section 'bar') ──────────────────────────────────────────────
drop policy if exists fiches_bar_select on public.fiches_bar;
drop policy if exists fiches_bar_insert on public.fiches_bar;
drop policy if exists fiches_bar_update on public.fiches_bar;
drop policy if exists fiches_bar_delete on public.fiches_bar;

create policy fiches_bar_select on public.fiches_bar for select to authenticated
  using (public.user_can_read_section(client_id, 'bar'));
create policy fiches_bar_insert on public.fiches_bar for insert to authenticated
  with check (public.user_can_write_section(client_id, 'bar'));
create policy fiches_bar_update on public.fiches_bar for update to authenticated
  using (public.user_can_write_section(client_id, 'bar'))
  with check (public.user_can_write_section(client_id, 'bar'));
create policy fiches_bar_delete on public.fiches_bar for delete to authenticated
  using (public.user_can_write_section(client_id, 'bar'));

-- ─── 5. ingredients_bar (section 'bar') ─────────────────────────────────────────
drop policy if exists ingredients_bar_select on public.ingredients_bar;
drop policy if exists ingredients_bar_insert on public.ingredients_bar;
drop policy if exists ingredients_bar_update on public.ingredients_bar;
drop policy if exists ingredients_bar_delete on public.ingredients_bar;

create policy ingredients_bar_select on public.ingredients_bar for select to authenticated
  using (public.user_can_read_section(client_id, 'bar'));
create policy ingredients_bar_insert on public.ingredients_bar for insert to authenticated
  with check (public.user_can_write_section(client_id, 'bar'));
create policy ingredients_bar_update on public.ingredients_bar for update to authenticated
  using (public.user_can_write_section(client_id, 'bar'))
  with check (public.user_can_write_section(client_id, 'bar'));
create policy ingredients_bar_delete on public.ingredients_bar for delete to authenticated
  using (public.user_can_write_section(client_id, 'bar'));
