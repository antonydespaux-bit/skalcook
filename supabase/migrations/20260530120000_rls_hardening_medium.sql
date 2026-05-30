-- Durcissement RLS tier moyen (suite de 20260530000000_rls_hardening_cross_tenant.sql).
-- 1) clients UPDATE : retire l'email hardcodé, scope par client_id (+ superadmin).
-- 2) factures : bucket passé en privé (lecture uniquement via service_role côté serveur).
-- 3) storage.objects : supprime la policy SELECT anon "qual=true" qui exposait
--    tous les objets de tous les buckets.

-- ── clients : UPDATE scopé ───────────────────────────────────────────────────
-- L'ancienne policy "SuperAdmin can update clients" autorisait UPDATE seulement si
-- auth.jwt()->>'email' = 'antony.despaux@hotmail.fr'. Conséquence : les membres
-- d'un client (non superadmin) ne pouvaient PAS sauvegarder /parametres (update
-- silencieusement bloqué). On scope par appartenance au client OU superadmin.
drop policy if exists "SuperAdmin can update clients" on public.clients;
create policy clients_update_scoped on public.clients
  for update to authenticated
  using (
    exists (
      select 1 from public.acces_clients ac
      where ac.user_id = auth.uid() and ac.client_id = clients.id
    )
    or public.is_superadmin()
  )
  with check (
    exists (
      select 1 from public.acces_clients ac
      where ac.user_id = auth.uid() and ac.client_id = clients.id
    )
    or public.is_superadmin()
  );

-- ── factures : bucket privé ──────────────────────────────────────────────────
-- Les factures (données financières) ne sont jamais servies via getPublicUrl ;
-- elles sont téléchargées côté serveur via service_role dans
-- /api/achats/fichier-facture (garde requireMemberOfClient). Un bucket public
-- exposerait les fichiers via l'URL CDN publique sans contrôle RLS.
update storage.buckets set public = false where id = 'factures';

-- ── storage.objects : supprime la lecture anon globale ───────────────────────
-- "Accès public en lecture 1knlueb_0" : SELECT pour anon avec USING(true) →
-- n'importe quel visiteur anonyme pouvait lire TOUS les objets de TOUS les buckets.
-- fiches-photos / clients-logos / documents_legaux conservent leurs policies
-- dédiées ; factures devient accessible uniquement via service_role.
drop policy if exists "Accès public en lecture 1knlueb_0" on storage.objects;
