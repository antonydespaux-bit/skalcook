-- ============================================================================
-- user_dashboard_preferences : ajout colonne `page` pour permettre à un même
-- user / tenant de stocker plusieurs layouts (un par page à widgets).
--
-- Avant : (user_id, client_id) unique → un seul layout, celui du dashboard.
-- Après : (user_id, client_id, page) unique. Backfill = 'dashboard' pour les
--   rows existantes (le seul écran à widgets jusqu'à présent).
--
-- Permet la nouvelle page /controle-gestion/analyses (page='analyses') sans
-- perturber le layout du dashboard.
-- ============================================================================

ALTER TABLE public.user_dashboard_preferences
  ADD COLUMN IF NOT EXISTS page text NOT NULL DEFAULT 'dashboard';

COMMENT ON COLUMN public.user_dashboard_preferences.page IS
  'Identifiant logique de la page concernée (ex: ''dashboard'', ''analyses''). Permet de stocker des layouts distincts par page pour un même user/tenant.';

-- Remplace l'unique (user_id, client_id) par (user_id, client_id, page)
ALTER TABLE public.user_dashboard_preferences
  DROP CONSTRAINT IF EXISTS user_dashboard_preferences_user_id_client_id_key;

ALTER TABLE public.user_dashboard_preferences
  ADD CONSTRAINT user_dashboard_preferences_user_client_page_key
  UNIQUE (user_id, client_id, page);

-- Index pour les lookups (user_id, client_id, page) — l'unique fournit déjà
-- un index, on garde donc juste celui d'origine sur (user_id, client_id).
