-- ============================================================================
-- ca_articles : référentiel des menus et suppléments suivis par le client.
--
-- Le restaurant Marsan suit par exemple :
--   - Menus : 5 services 205, 8 services 260, Menu déjeuner 98, Menu Privat
--   - Suppléments : Bœuf wagyu, Caviar, Baba
--
-- Les quantités vendues par période sont stockées dans la colonne JSONB
-- articles_ventes de ca_rapports_hebdo (cf. migration suivante) plutôt
-- que dans une table relationnelle, pour rester simple à manipuler côté UI.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.ca_articles (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id  uuid        NOT NULL REFERENCES public.clients (id) ON DELETE CASCADE,
  nom        text        NOT NULL,
  type       text        NOT NULL CHECK (type IN ('menu', 'supplement')),
  service    text        NOT NULL CHECK (service IN ('lunch', 'dinner', 'all')) DEFAULT 'all',
  ordre      integer     NOT NULL DEFAULT 0,
  actif      boolean     NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.ca_articles IS
  'Référentiel des menus et suppléments suivis pour les rapports hebdo (saisis manuellement depuis Lightspeed).';

CREATE INDEX IF NOT EXISTS ca_articles_client_idx
  ON public.ca_articles (client_id, actif, type, service, ordre);

DROP TRIGGER IF EXISTS trg_ca_articles_updated_at ON public.ca_articles;
CREATE TRIGGER trg_ca_articles_updated_at
  BEFORE UPDATE ON public.ca_articles
  FOR EACH ROW EXECUTE FUNCTION public.ca_set_updated_at();

ALTER TABLE public.ca_articles ENABLE ROW LEVEL SECURITY;
CREATE POLICY ca_articles_select ON public.ca_articles FOR SELECT TO authenticated
  USING (public.user_has_client_access(client_id));
CREATE POLICY ca_articles_insert ON public.ca_articles FOR INSERT TO authenticated
  WITH CHECK (public.user_has_client_access(client_id));
CREATE POLICY ca_articles_update ON public.ca_articles FOR UPDATE TO authenticated
  USING (public.user_has_client_access(client_id))
  WITH CHECK (public.user_has_client_access(client_id));
CREATE POLICY ca_articles_delete ON public.ca_articles FOR DELETE TO authenticated
  USING (public.user_has_client_access(client_id));

-- ─── Ajout articles_ventes à ca_rapports_hebdo ────────────────────────────────
-- Map { "article_id": quantite_vendue } pour la période du rapport.
-- Le JSONB est plus simple à gérer côté UI qu'une table relationnelle pour
-- ce cas d'usage (lecture/écriture toujours en bloc par rapport).
ALTER TABLE public.ca_rapports_hebdo
  ADD COLUMN IF NOT EXISTS articles_ventes jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.ca_rapports_hebdo.articles_ventes IS
  'Quantités vendues par article pour la période. Format : { "article_id": qte }.';
