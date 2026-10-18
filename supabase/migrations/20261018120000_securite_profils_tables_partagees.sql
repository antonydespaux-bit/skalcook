-- Sécurité (diagnostic du 18/10/2026).
--
-- 1. profils : la policy « Admins can view all profiles » laissait tout
--    administrateur d'un établissement lire les profils de TOUTE la base
--    (noms, e-mails, téléphones des utilisateurs des autres clients) :
--    15 profils visibles au lieu des 9 de ses établissements. Les policies
--    restantes suffisent : profils_select (établissements de l'utilisateur,
--    superadmin) et profils_select_own (son propre profil). Les écrans
--    d'administration listent les utilisateurs via des routes serveur.
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profils;

-- 2. Tables partagées héritées (sans client_id) : parametres (non utilisée
--    par le code), sites, site_settings et journal_ardoise (module Ardoise,
--    actif chez aucun client, dernière écriture en mars 2026). Leur policy
--    « auth.uid() IS NOT NULL » en ALL les rendait lisibles ET modifiables par
--    n'importe quel utilisateur connecté, tous clients confondus. On les
--    réserve au superadmin, en attendant un éventuel cloisonnement par
--    établissement si le module Ardoise est réactivé.
DROP POLICY IF EXISTS auth_only_parametres ON public.parametres;
DROP POLICY IF EXISTS auth_only_sites ON public.sites;
DROP POLICY IF EXISTS auth_only_site_settings ON public.site_settings;
DROP POLICY IF EXISTS auth_only_journal_ardoise ON public.journal_ardoise;

CREATE POLICY parametres_superadmin ON public.parametres
  FOR ALL TO authenticated
  USING ((SELECT public.get_my_is_superadmin()) IS TRUE)
  WITH CHECK ((SELECT public.get_my_is_superadmin()) IS TRUE);

CREATE POLICY sites_superadmin ON public.sites
  FOR ALL TO authenticated
  USING ((SELECT public.get_my_is_superadmin()) IS TRUE)
  WITH CHECK ((SELECT public.get_my_is_superadmin()) IS TRUE);

CREATE POLICY site_settings_superadmin ON public.site_settings
  FOR ALL TO authenticated
  USING ((SELECT public.get_my_is_superadmin()) IS TRUE)
  WITH CHECK ((SELECT public.get_my_is_superadmin()) IS TRUE);

CREATE POLICY journal_ardoise_superadmin ON public.journal_ardoise
  FOR ALL TO authenticated
  USING ((SELECT public.get_my_is_superadmin()) IS TRUE)
  WITH CHECK ((SELECT public.get_my_is_superadmin()) IS TRUE);
