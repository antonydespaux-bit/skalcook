-- ============================================================================
-- ca_rapports_hebdo : rapports hebdomadaires sauvegardés.
--
-- L'utilisateur envoie un mail récap chaque lundi avec les chiffres de la
-- semaine précédente (CA, tickets moyens, couverts, mix Food/Bev, etc.).
-- Les chiffres sont recalculés au load depuis ca_journalier + ca_budgets,
-- seuls le commentaire libre et les métadonnées sont persistés ici.
--
-- (Une future migration ajoutera articles_ventes JSONB pour tracker les
-- ventes de menus / suppléments saisis manuellement — out-of-scope PR A.)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.ca_rapports_hebdo (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id    uuid        NOT NULL REFERENCES public.clients (id) ON DELETE CASCADE,
  debut        date        NOT NULL,
  fin          date        NOT NULL,
  commentaire  text        NOT NULL DEFAULT '',
  titre        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  created_by   uuid        REFERENCES auth.users (id) ON DELETE SET NULL,
  CONSTRAINT ca_rapports_hebdo_dates_check CHECK (fin >= debut)
);

COMMENT ON TABLE public.ca_rapports_hebdo IS
  'Rapports hebdomadaires sauvegardés (CA, tickets, couverts) avec commentaire libre. Permet de retrouver les rapports envoyés par mail aux équipes semaine après semaine.';

CREATE INDEX IF NOT EXISTS ca_rapports_hebdo_client_debut_idx
  ON public.ca_rapports_hebdo (client_id, debut DESC);

DROP TRIGGER IF EXISTS trg_ca_rapports_hebdo_updated_at ON public.ca_rapports_hebdo;
CREATE TRIGGER trg_ca_rapports_hebdo_updated_at
  BEFORE UPDATE ON public.ca_rapports_hebdo
  FOR EACH ROW EXECUTE FUNCTION public.ca_set_updated_at();

ALTER TABLE public.ca_rapports_hebdo ENABLE ROW LEVEL SECURITY;
CREATE POLICY ca_rapports_hebdo_select ON public.ca_rapports_hebdo FOR SELECT TO authenticated
  USING (public.user_has_client_access(client_id));
CREATE POLICY ca_rapports_hebdo_insert ON public.ca_rapports_hebdo FOR INSERT TO authenticated
  WITH CHECK (public.user_has_client_access(client_id));
CREATE POLICY ca_rapports_hebdo_update ON public.ca_rapports_hebdo FOR UPDATE TO authenticated
  USING (public.user_has_client_access(client_id))
  WITH CHECK (public.user_has_client_access(client_id));
CREATE POLICY ca_rapports_hebdo_delete ON public.ca_rapports_hebdo FOR DELETE TO authenticated
  USING (public.user_has_client_access(client_id));
