-- Remplacer les emails superadmin codés en dur dans les policies RLS par le
-- helper `is_superadmin()` (source unique de vérité = profils.is_superadmin).
--
-- L'email `auth.jwt()->>'email'` n'est PAS spoofable (claim GoTrue vérifié),
-- donc ce n'est pas une faille — mais c'est fragile et incohérent : une policy
-- listait 2 emails, une autre un seul. Si `antony@skalcook.com` était créé un
-- jour, il aurait un accès incohérent selon la table. On centralise.
--
-- Vérifié avant migration : seul `antony.despaux@hotmail.fr` a is_superadmin=true
-- en base → aucun verrouillage. `is_superadmin()` est SECURITY DEFINER (lit
-- profils en bypass RLS) → pas de récursion sur les policies profils/acces_clients.
-- NE TOUCHE PAS `acces_clients_select_own` (accès membre, pivot de getClientId).

-- ── acces_clients : consolider les 2 policies superadmin email en une seule ──
DROP POLICY IF EXISTS "SuperAdmin manages all access" ON public.acces_clients;
DROP POLICY IF EXISTS "acces_clients_superadmin_all" ON public.acces_clients;
CREATE POLICY acces_clients_superadmin_all ON public.acces_clients
  FOR ALL TO authenticated
  USING (public.is_superadmin())
  WITH CHECK (public.is_superadmin());

-- ── profils : retirer la clause email redondante (get_my_is_superadmin() couvre) ──
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profils;
CREATE POLICY "Admins can view all profiles" ON public.profils
  FOR SELECT TO public
  USING ((get_my_role() = 'admin') OR (get_my_is_superadmin() = true));

-- ── prospects : policy SELECT email redondante avec read_prospects_superadmin ──
DROP POLICY IF EXISTS "Superadmins can see all prospects" ON public.prospects;

-- ── storage.objects (documents_legaux) : email → is_superadmin() ──
DROP POLICY IF EXISTS "Superadmins peuvent supprimer des documents" ON storage.objects;
CREATE POLICY "Superadmins peuvent supprimer des documents" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'documents_legaux' AND public.is_superadmin());

DROP POLICY IF EXISTS "Superadmins peuvent uploader des documents" ON storage.objects;
CREATE POLICY "Superadmins peuvent uploader des documents" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'documents_legaux' AND public.is_superadmin());
