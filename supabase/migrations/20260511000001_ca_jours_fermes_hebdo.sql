-- ============================================================================
-- ca_jours_fermes_hebdo : fermetures hebdomadaires récurrentes (toute l'année).
--
-- Complète ca_jours_fermes (qui gère des dates spécifiques) pour le cas
-- typique du restaurant fermé tous les lundis-mardis, par exemple. Inutile
-- de saisir 52 fois "Lundi 5 janvier", "Lundi 12 janvier", etc.
--
-- Le merge des deux tables se fait côté app (page Budgets) avant de passer
-- le map joursFermes au builder Excel.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.ca_jours_fermes_hebdo (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id    uuid        NOT NULL REFERENCES public.clients (id) ON DELETE CASCADE,
  jour_semaine smallint    NOT NULL CHECK (jour_semaine BETWEEN 1 AND 7),
  motif        text        NOT NULL DEFAULT 'Fermé',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ca_jours_fermes_hebdo_unique UNIQUE (client_id, jour_semaine)
);

COMMENT ON TABLE public.ca_jours_fermes_hebdo IS
  'Fermetures hebdomadaires récurrentes (ex : tous les lundis). Complète ca_jours_fermes pour les dates ponctuelles. 1=lundi … 7=dimanche (ISO).';

CREATE INDEX IF NOT EXISTS ca_jours_fermes_hebdo_client_idx
  ON public.ca_jours_fermes_hebdo (client_id);

DROP TRIGGER IF EXISTS trg_ca_jours_fermes_hebdo_updated_at ON public.ca_jours_fermes_hebdo;
CREATE TRIGGER trg_ca_jours_fermes_hebdo_updated_at
  BEFORE UPDATE ON public.ca_jours_fermes_hebdo
  FOR EACH ROW EXECUTE FUNCTION public.ca_set_updated_at();

ALTER TABLE public.ca_jours_fermes_hebdo ENABLE ROW LEVEL SECURITY;
CREATE POLICY ca_jours_fermes_hebdo_select ON public.ca_jours_fermes_hebdo FOR SELECT TO authenticated
  USING (public.user_has_client_access(client_id));
CREATE POLICY ca_jours_fermes_hebdo_insert ON public.ca_jours_fermes_hebdo FOR INSERT TO authenticated
  WITH CHECK (public.user_has_client_access(client_id));
CREATE POLICY ca_jours_fermes_hebdo_update ON public.ca_jours_fermes_hebdo FOR UPDATE TO authenticated
  USING (public.user_has_client_access(client_id))
  WITH CHECK (public.user_has_client_access(client_id));
CREATE POLICY ca_jours_fermes_hebdo_delete ON public.ca_jours_fermes_hebdo FOR DELETE TO authenticated
  USING (public.user_has_client_access(client_id));
