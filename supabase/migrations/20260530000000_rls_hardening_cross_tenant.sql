-- Durcissement RLS : ferme les fuites cross-tenant introduites par des policies
-- créées via le dashboard Supabase (USING(true)) qui écrasaient l'isolation par client.
-- Tables concernées : clients, mapping_ventes, ventes_journalieres.

-- ── Helper superadmin (SECURITY DEFINER pour ne pas dépendre du RLS de profils) ──
create or replace function public.is_superadmin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select p.is_superadmin from public.profils p where p.id = auth.uid()), false);
$$;

revoke all on function public.is_superadmin() from public;
grant execute on function public.is_superadmin() to authenticated;

-- ── clients : SELECT scopé (membre du client OU superadmin) ──────────────────
-- Remplace "Enable select for authenticated users only" (USING true) qui exposait
-- tous les établissements (SIRET, TVA, adresse, email) à tout compte connecté.
drop policy if exists "Enable select for authenticated users only" on public.clients;
create policy clients_select_scoped on public.clients
  for select to authenticated
  using (
    exists (
      select 1 from public.acces_clients ac
      where ac.user_id = auth.uid() and ac.client_id = clients.id
    )
    or public.is_superadmin()
  );

-- ── clients : INSERT réservé au service_role ─────────────────────────────────
-- La création d'établissement passe par /api/superadmin/create-client (service_role,
-- qui bypasse le RLS). Aucun insert navigateur légitime → on retire la policy
-- "Enable insert for authenticated users only" (WITH CHECK true).
drop policy if exists "Enable insert for authenticated users only" on public.clients;

-- ── mapping_ventes : remplace ALL USING(true) par un scope par client ────────
drop policy if exists "allow_all_mapping_for_members" on public.mapping_ventes;
create policy mapping_ventes_scoped on public.mapping_ventes
  for all to authenticated
  using (
    exists (
      select 1 from public.acces_clients ac
      where ac.user_id = auth.uid() and ac.client_id = mapping_ventes.client_id
    )
  )
  with check (
    exists (
      select 1 from public.acces_clients ac
      where ac.user_id = auth.uid() and ac.client_id = mapping_ventes.client_id
    )
  );

-- ── ventes_journalieres : suppression des vestiges de test ───────────────────
-- Les policies scopées (*_autorise) existent déjà ; ces deux-là rouvraient tout.
-- "Test_Public_Read" : SELECT USING(true) pour {anon,authenticated} → CA lisible sans auth.
-- "Test insertion libre" : INSERT WITH CHECK(true).
drop policy if exists "Test_Public_Read" on public.ventes_journalieres;
drop policy if exists "Test insertion libre" on public.ventes_journalieres;
