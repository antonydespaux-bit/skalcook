-- ============================================================================
-- V2 Security Hardening — Supabase advisor fixes
--
-- Corrige 2 familles d'erreurs remontées par `get_advisors`:
--
--   1. `rls_disabled_in_public` + `policy_exists_rls_disabled`
--      → RLS désactivée sur achats_factures, achats_lignes,
--        inventaires, inventaire_lignes alors que leurs policies existent
--        → données exposées via la clé anon.
--
--   2. `rls_references_user_metadata`
--      → Les policies lisaient `auth.jwt() -> 'user_metadata' ->> 'client_id'`.
--        `user_metadata` est modifiable par l'utilisateur lui-même
--        (supabase.auth.updateUser) → contournable trivialement.
--
-- Stratégie:
--   • Helper `public.user_has_client_access(uuid)` SECURITY DEFINER qui:
--       - bypass pour les superadmins (flag profils.is_superadmin via
--         la fonction existante `get_my_is_superadmin()`)
--       - sinon vérifie `acces_clients`
--   • Drop toutes les anciennes policies (user_metadata + *_autorise +
--     les 8 policies achats_* déjà créées sans helper).
--   • Recrée 4 policies CRUD uniformes par table via le helper.
--   • ENABLE ROW LEVEL SECURITY sur les 4 tables actuellement OFF.
--
-- Impact applicatif:
--   • Le client `service_role` bypass RLS → toutes les routes API server-side
--     qui utilisent `getServiceClient()` continuent de fonctionner.
--   • Les accès client-side (anon + JWT) sont soumis aux nouvelles policies:
--     superadmin OK, users avec entrée acces_clients OK, autres bloqués.
-- ============================================================================

-- ─── 1. Helper function ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.user_has_client_access(p_client_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    auth.uid() IS NOT NULL
    AND (
      COALESCE(public.get_my_is_superadmin(), false)
      OR EXISTS (
        SELECT 1 FROM public.acces_clients
        WHERE user_id = auth.uid()
          AND client_id = p_client_id
      )
    );
$$;

COMMENT ON FUNCTION public.user_has_client_access(uuid) IS
  'RLS helper: true si l''utilisateur courant est superadmin OU a une entrée dans acces_clients pour ce client_id. SECURITY DEFINER pour éviter la récursion RLS sur acces_clients/profils.';

-- Autoriser l'appel depuis les rôles qui évaluent la RLS
GRANT EXECUTE ON FUNCTION public.user_has_client_access(uuid) TO authenticated, anon;

-- ─── 2. Drop anciennes policies (user_metadata + *_autorise + achats non-helper)
DROP POLICY IF EXISTS isolation_client_fiches              ON public.fiches;
DROP POLICY IF EXISTS isolation_client_fiches_bar          ON public.fiches_bar;
DROP POLICY IF EXISTS isolation_client_ingredients         ON public.ingredients;
DROP POLICY IF EXISTS isolation_client_ingredients_bar     ON public.ingredients_bar;
DROP POLICY IF EXISTS isolation_client_cartes              ON public.cartes;
DROP POLICY IF EXISTS isolation_client_carte_items         ON public.carte_items;
DROP POLICY IF EXISTS isolation_client_carte_sections      ON public.carte_sections;
DROP POLICY IF EXISTS isolation_client_menus               ON public.menus;
DROP POLICY IF EXISTS isolation_client_categories_plats    ON public.categories_plats;
DROP POLICY IF EXISTS client_isolation                     ON public.categories_ingredients;
DROP POLICY IF EXISTS client_isolation_lieux               ON public.lieux;

DROP POLICY IF EXISTS inventaires_select_autorise ON public.inventaires;
DROP POLICY IF EXISTS inventaires_insert_autorise ON public.inventaires;
DROP POLICY IF EXISTS inventaires_update_autorise ON public.inventaires;
DROP POLICY IF EXISTS inventaires_delete_autorise ON public.inventaires;

DROP POLICY IF EXISTS inventaire_lignes_select_autorise ON public.inventaire_lignes;
DROP POLICY IF EXISTS inventaire_lignes_insert_autorise ON public.inventaire_lignes;
DROP POLICY IF EXISTS inventaire_lignes_update_autorise ON public.inventaire_lignes;
DROP POLICY IF EXISTS inventaire_lignes_delete_autorise ON public.inventaire_lignes;

DROP POLICY IF EXISTS achats_factures_select ON public.achats_factures;
DROP POLICY IF EXISTS achats_factures_insert ON public.achats_factures;
DROP POLICY IF EXISTS achats_factures_update ON public.achats_factures;
DROP POLICY IF EXISTS achats_factures_delete ON public.achats_factures;

DROP POLICY IF EXISTS achats_lignes_select ON public.achats_lignes;
DROP POLICY IF EXISTS achats_lignes_insert ON public.achats_lignes;
DROP POLICY IF EXISTS achats_lignes_update ON public.achats_lignes;
DROP POLICY IF EXISTS achats_lignes_delete ON public.achats_lignes;

-- ─── 3. Recréation uniforme des policies CRUD ──────────────────────────────
-- Pattern identique sur toutes les tables tenant-scoped via le helper.

-- fiches
CREATE POLICY fiches_select ON public.fiches FOR SELECT TO authenticated
  USING (public.user_has_client_access(client_id));
CREATE POLICY fiches_insert ON public.fiches FOR INSERT TO authenticated
  WITH CHECK (public.user_has_client_access(client_id));
CREATE POLICY fiches_update ON public.fiches FOR UPDATE TO authenticated
  USING (public.user_has_client_access(client_id))
  WITH CHECK (public.user_has_client_access(client_id));
CREATE POLICY fiches_delete ON public.fiches FOR DELETE TO authenticated
  USING (public.user_has_client_access(client_id));

-- fiches_bar
CREATE POLICY fiches_bar_select ON public.fiches_bar FOR SELECT TO authenticated
  USING (public.user_has_client_access(client_id));
CREATE POLICY fiches_bar_insert ON public.fiches_bar FOR INSERT TO authenticated
  WITH CHECK (public.user_has_client_access(client_id));
CREATE POLICY fiches_bar_update ON public.fiches_bar FOR UPDATE TO authenticated
  USING (public.user_has_client_access(client_id))
  WITH CHECK (public.user_has_client_access(client_id));
CREATE POLICY fiches_bar_delete ON public.fiches_bar FOR DELETE TO authenticated
  USING (public.user_has_client_access(client_id));

-- ingredients
CREATE POLICY ingredients_select ON public.ingredients FOR SELECT TO authenticated
  USING (public.user_has_client_access(client_id));
CREATE POLICY ingredients_insert ON public.ingredients FOR INSERT TO authenticated
  WITH CHECK (public.user_has_client_access(client_id));
CREATE POLICY ingredients_update ON public.ingredients FOR UPDATE TO authenticated
  USING (public.user_has_client_access(client_id))
  WITH CHECK (public.user_has_client_access(client_id));
CREATE POLICY ingredients_delete ON public.ingredients FOR DELETE TO authenticated
  USING (public.user_has_client_access(client_id));

-- ingredients_bar
CREATE POLICY ingredients_bar_select ON public.ingredients_bar FOR SELECT TO authenticated
  USING (public.user_has_client_access(client_id));
CREATE POLICY ingredients_bar_insert ON public.ingredients_bar FOR INSERT TO authenticated
  WITH CHECK (public.user_has_client_access(client_id));
CREATE POLICY ingredients_bar_update ON public.ingredients_bar FOR UPDATE TO authenticated
  USING (public.user_has_client_access(client_id))
  WITH CHECK (public.user_has_client_access(client_id));
CREATE POLICY ingredients_bar_delete ON public.ingredients_bar FOR DELETE TO authenticated
  USING (public.user_has_client_access(client_id));

-- cartes
CREATE POLICY cartes_select ON public.cartes FOR SELECT TO authenticated
  USING (public.user_has_client_access(client_id));
CREATE POLICY cartes_insert ON public.cartes FOR INSERT TO authenticated
  WITH CHECK (public.user_has_client_access(client_id));
CREATE POLICY cartes_update ON public.cartes FOR UPDATE TO authenticated
  USING (public.user_has_client_access(client_id))
  WITH CHECK (public.user_has_client_access(client_id));
CREATE POLICY cartes_delete ON public.cartes FOR DELETE TO authenticated
  USING (public.user_has_client_access(client_id));

-- carte_items
CREATE POLICY carte_items_select ON public.carte_items FOR SELECT TO authenticated
  USING (public.user_has_client_access(client_id));
CREATE POLICY carte_items_insert ON public.carte_items FOR INSERT TO authenticated
  WITH CHECK (public.user_has_client_access(client_id));
CREATE POLICY carte_items_update ON public.carte_items FOR UPDATE TO authenticated
  USING (public.user_has_client_access(client_id))
  WITH CHECK (public.user_has_client_access(client_id));
CREATE POLICY carte_items_delete ON public.carte_items FOR DELETE TO authenticated
  USING (public.user_has_client_access(client_id));

-- carte_sections
CREATE POLICY carte_sections_select ON public.carte_sections FOR SELECT TO authenticated
  USING (public.user_has_client_access(client_id));
CREATE POLICY carte_sections_insert ON public.carte_sections FOR INSERT TO authenticated
  WITH CHECK (public.user_has_client_access(client_id));
CREATE POLICY carte_sections_update ON public.carte_sections FOR UPDATE TO authenticated
  USING (public.user_has_client_access(client_id))
  WITH CHECK (public.user_has_client_access(client_id));
CREATE POLICY carte_sections_delete ON public.carte_sections FOR DELETE TO authenticated
  USING (public.user_has_client_access(client_id));

-- menus
CREATE POLICY menus_select ON public.menus FOR SELECT TO authenticated
  USING (public.user_has_client_access(client_id));
CREATE POLICY menus_insert ON public.menus FOR INSERT TO authenticated
  WITH CHECK (public.user_has_client_access(client_id));
CREATE POLICY menus_update ON public.menus FOR UPDATE TO authenticated
  USING (public.user_has_client_access(client_id))
  WITH CHECK (public.user_has_client_access(client_id));
CREATE POLICY menus_delete ON public.menus FOR DELETE TO authenticated
  USING (public.user_has_client_access(client_id));

-- categories_plats
CREATE POLICY categories_plats_select ON public.categories_plats FOR SELECT TO authenticated
  USING (public.user_has_client_access(client_id));
CREATE POLICY categories_plats_insert ON public.categories_plats FOR INSERT TO authenticated
  WITH CHECK (public.user_has_client_access(client_id));
CREATE POLICY categories_plats_update ON public.categories_plats FOR UPDATE TO authenticated
  USING (public.user_has_client_access(client_id))
  WITH CHECK (public.user_has_client_access(client_id));
CREATE POLICY categories_plats_delete ON public.categories_plats FOR DELETE TO authenticated
  USING (public.user_has_client_access(client_id));

-- categories_ingredients
CREATE POLICY categories_ingredients_select ON public.categories_ingredients FOR SELECT TO authenticated
  USING (public.user_has_client_access(client_id));
CREATE POLICY categories_ingredients_insert ON public.categories_ingredients FOR INSERT TO authenticated
  WITH CHECK (public.user_has_client_access(client_id));
CREATE POLICY categories_ingredients_update ON public.categories_ingredients FOR UPDATE TO authenticated
  USING (public.user_has_client_access(client_id))
  WITH CHECK (public.user_has_client_access(client_id));
CREATE POLICY categories_ingredients_delete ON public.categories_ingredients FOR DELETE TO authenticated
  USING (public.user_has_client_access(client_id));

-- lieux
CREATE POLICY lieux_select ON public.lieux FOR SELECT TO authenticated
  USING (public.user_has_client_access(client_id));
CREATE POLICY lieux_insert ON public.lieux FOR INSERT TO authenticated
  WITH CHECK (public.user_has_client_access(client_id));
CREATE POLICY lieux_update ON public.lieux FOR UPDATE TO authenticated
  USING (public.user_has_client_access(client_id))
  WITH CHECK (public.user_has_client_access(client_id));
CREATE POLICY lieux_delete ON public.lieux FOR DELETE TO authenticated
  USING (public.user_has_client_access(client_id));

-- achats_factures
CREATE POLICY achats_factures_select ON public.achats_factures FOR SELECT TO authenticated
  USING (public.user_has_client_access(client_id));
CREATE POLICY achats_factures_insert ON public.achats_factures FOR INSERT TO authenticated
  WITH CHECK (public.user_has_client_access(client_id));
CREATE POLICY achats_factures_update ON public.achats_factures FOR UPDATE TO authenticated
  USING (public.user_has_client_access(client_id))
  WITH CHECK (public.user_has_client_access(client_id));
CREATE POLICY achats_factures_delete ON public.achats_factures FOR DELETE TO authenticated
  USING (public.user_has_client_access(client_id));

-- achats_lignes
CREATE POLICY achats_lignes_select ON public.achats_lignes FOR SELECT TO authenticated
  USING (public.user_has_client_access(client_id));
CREATE POLICY achats_lignes_insert ON public.achats_lignes FOR INSERT TO authenticated
  WITH CHECK (public.user_has_client_access(client_id));
CREATE POLICY achats_lignes_update ON public.achats_lignes FOR UPDATE TO authenticated
  USING (public.user_has_client_access(client_id))
  WITH CHECK (public.user_has_client_access(client_id));
CREATE POLICY achats_lignes_delete ON public.achats_lignes FOR DELETE TO authenticated
  USING (public.user_has_client_access(client_id));

-- inventaires
CREATE POLICY inventaires_select ON public.inventaires FOR SELECT TO authenticated
  USING (public.user_has_client_access(client_id));
CREATE POLICY inventaires_insert ON public.inventaires FOR INSERT TO authenticated
  WITH CHECK (public.user_has_client_access(client_id));
CREATE POLICY inventaires_update ON public.inventaires FOR UPDATE TO authenticated
  USING (public.user_has_client_access(client_id))
  WITH CHECK (public.user_has_client_access(client_id));
CREATE POLICY inventaires_delete ON public.inventaires FOR DELETE TO authenticated
  USING (public.user_has_client_access(client_id));

-- inventaire_lignes
CREATE POLICY inventaire_lignes_select ON public.inventaire_lignes FOR SELECT TO authenticated
  USING (public.user_has_client_access(client_id));
CREATE POLICY inventaire_lignes_insert ON public.inventaire_lignes FOR INSERT TO authenticated
  WITH CHECK (public.user_has_client_access(client_id));
CREATE POLICY inventaire_lignes_update ON public.inventaire_lignes FOR UPDATE TO authenticated
  USING (public.user_has_client_access(client_id))
  WITH CHECK (public.user_has_client_access(client_id));
CREATE POLICY inventaire_lignes_delete ON public.inventaire_lignes FOR DELETE TO authenticated
  USING (public.user_has_client_access(client_id));

-- ─── 4. Activer RLS sur les 4 tables où elle est OFF ───────────────────────
ALTER TABLE public.achats_factures   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.achats_lignes     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventaires       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventaire_lignes ENABLE ROW LEVEL SECURITY;

-- ─── 5. Parité d'accès — users fantômes sans acces_clients ─────────────────
-- Ces users avaient accès via `user_metadata.client_id` (vulnérabilité corrigée ici).
-- On leur crée une entrée officielle `acces_clients` pour préserver le comportement
-- actuel (zéro user bloqué). À revoir si ces comptes ne doivent pas exister.
--
-- carolcarrenoo@gmail.com: compte jamais connecté (last_sign_in_at = null),
-- créé le 2026-03-21, raw_user_meta_data.client_id = fa725e66-….
INSERT INTO public.acces_clients (user_id, client_id)
SELECT u.id, (u.raw_user_meta_data->>'client_id')::uuid
FROM auth.users u
WHERE u.email = 'carolcarrenoo@gmail.com'
  AND u.raw_user_meta_data->>'client_id' IS NOT NULL
ON CONFLICT DO NOTHING;
