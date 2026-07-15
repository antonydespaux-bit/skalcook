-- menu_bar_fiches : RLS activé mais AUCUNE policy (advisor rls_enabled_no_policy).
-- Résultat : table inaccessible pour anon/authenticated (feature bar cassée pour
-- tout nouveau tenant). Ajout des 4 policies tenant standard, identiques à
-- celles de menu_fiches (isolation via user_has_client_access(client_id)).

alter table public.menu_bar_fiches enable row level security;

drop policy if exists menu_bar_fiches_select on public.menu_bar_fiches;
drop policy if exists menu_bar_fiches_insert on public.menu_bar_fiches;
drop policy if exists menu_bar_fiches_update on public.menu_bar_fiches;
drop policy if exists menu_bar_fiches_delete on public.menu_bar_fiches;

create policy menu_bar_fiches_select on public.menu_bar_fiches
  for select using (user_has_client_access(client_id));

create policy menu_bar_fiches_insert on public.menu_bar_fiches
  for insert with check (user_has_client_access(client_id));

create policy menu_bar_fiches_update on public.menu_bar_fiches
  for update using (user_has_client_access(client_id))
  with check (user_has_client_access(client_id));

create policy menu_bar_fiches_delete on public.menu_bar_fiches
  for delete using (user_has_client_access(client_id));
