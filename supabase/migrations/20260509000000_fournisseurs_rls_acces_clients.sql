-- Aligne les RLS de fournisseurs sur le pattern multi-tenant (user_has_client_access).
-- Avant : politiques basées sur profils.client_id direct → un superadmin
-- ne pouvait pas voir les fournisseurs d'un autre client que celui de son profil.
-- Après : cohérent avec achats_factures / ingredients / etc.

DROP POLICY IF EXISTS fournisseurs_select ON public.fournisseurs;
DROP POLICY IF EXISTS fournisseurs_insert ON public.fournisseurs;
DROP POLICY IF EXISTS fournisseurs_update ON public.fournisseurs;
DROP POLICY IF EXISTS fournisseurs_delete ON public.fournisseurs;

CREATE POLICY fournisseurs_select ON public.fournisseurs
  FOR SELECT USING (public.user_has_client_access(client_id));

CREATE POLICY fournisseurs_insert ON public.fournisseurs
  FOR INSERT WITH CHECK (public.user_has_client_access(client_id));

CREATE POLICY fournisseurs_update ON public.fournisseurs
  FOR UPDATE USING (public.user_has_client_access(client_id))
              WITH CHECK (public.user_has_client_access(client_id));

CREATE POLICY fournisseurs_delete ON public.fournisseurs
  FOR DELETE USING (public.user_has_client_access(client_id));
