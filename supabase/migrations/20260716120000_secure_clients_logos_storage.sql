-- Sécurise le bucket public `clients-logos`.
--
-- Problème : l'écriture était ouverte au rôle `public` (donc anon) via les
-- policies `upload_clients_logos` (INSERT) et `update_clients_logos` (UPDATE),
-- toutes deux `WITH CHECK/USING (bucket_id = 'clients-logos')` sans aucune
-- vérification d'auth ni de tenant. N'importe qui sur internet pouvait donc
-- uploader des fichiers arbitraires et ÉCRASER le logo de n'importe quel resto
-- (défacement + hébergement de contenu servi depuis notre Supabase).
--
-- Correctif : les chemins sont déjà `<client_id>/logo.<ext>` (cf.
-- app/superadmin/page.js `uploadLogo`), on scope donc INSERT/UPDATE/DELETE aux
-- membres du client concerné, via le helper `user_has_client_access` (qui
-- autorise aussi les superadmins). La LECTURE reste publique : le bucket est
-- public et l'affichage passe par getPublicUrl, qui n'utilise pas ces policies.

DROP POLICY IF EXISTS "upload_clients_logos" ON storage.objects;
DROP POLICY IF EXISTS "update_clients_logos" ON storage.objects;

CREATE POLICY clients_logos_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'clients-logos'
    AND public.user_has_client_access(((storage.foldername(name))[1])::uuid)
  );

CREATE POLICY clients_logos_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'clients-logos'
    AND public.user_has_client_access(((storage.foldername(name))[1])::uuid)
  )
  WITH CHECK (
    bucket_id = 'clients-logos'
    AND public.user_has_client_access(((storage.foldername(name))[1])::uuid)
  );

CREATE POLICY clients_logos_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'clients-logos'
    AND public.user_has_client_access(((storage.foldername(name))[1])::uuid)
  );
