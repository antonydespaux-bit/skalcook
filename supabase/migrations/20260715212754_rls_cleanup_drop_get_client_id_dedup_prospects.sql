-- ============================================================================
-- Nettoyage RLS — suite à l'audit de dérive prod ↔ migrations du 2026-07-15
--
--   1. DROP get_client_id()
--      Vieux helper qui lisait `auth.jwt() -> 'user_metadata' ->> 'client_id'`
--      (modifiable par l'utilisateur → contournable). Fonction MORTE :
--      aucune policy ne l'appelle, aucun usage dans le code applicatif
--      (app/, lib/). On retire la mine dormante.
--
--   2. Dédup policy INSERT sur `prospects`
--      Deux policies `WITH CHECK (true)` faisaient doublon :
--        - "Enable insert for anonymous users"  (leftover dashboard)
--        - insert_prospect_public                (versionnée, on la garde)
--      L'INSERT public reste voulu (formulaire prospect via service_role).
--      On supprime le doublon dashboard.
-- ============================================================================

-- 1. Fonction morte lisant user_metadata (aucun appelant)
DROP FUNCTION IF EXISTS public.get_client_id();

-- 2. Doublon d'INSERT public sur prospects
DROP POLICY IF EXISTS "Enable insert for anonymous users" ON public.prospects;
