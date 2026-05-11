-- ============================================================================
-- ca_jours_fermes : liste de dates marquées comme fermées / fériées / spéciales.
--
-- Géré depuis la page /controle-gestion/ventes/budgets (modal "Jours fermés").
-- Utilisé pour pré-remplir la colonne Exception du fichier Excel équipes :
-- les dates listées ici apparaîtront avec leur motif dans la Synthèse,
-- et leurs cumuls Budget/Réel seront exclus automatiquement par les
-- formules SUMIF.
--
-- Une date par client, motif libre ("Férié", "Privatisation", "Vacances"…).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.ca_jours_fermes (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id  uuid        NOT NULL REFERENCES public.clients (id) ON DELETE CASCADE,
  date       date        NOT NULL,
  motif      text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ca_jours_fermes_unique UNIQUE (client_id, date)
);

COMMENT ON TABLE public.ca_jours_fermes IS
  'Dates marquées comme fermées / fériées par le client. Utilisé pour pré-remplir la colonne Exception du fichier Excel équipes (et plus tard pour ajuster les cumuls sur /analyses).';

CREATE INDEX IF NOT EXISTS ca_jours_fermes_client_date_idx
  ON public.ca_jours_fermes (client_id, date);

-- Trigger updated_at (réutilise la fonction posée par 20260506000000_ca_journalier.sql)
DROP TRIGGER IF EXISTS trg_ca_jours_fermes_updated_at ON public.ca_jours_fermes;
CREATE TRIGGER trg_ca_jours_fermes_updated_at
  BEFORE UPDATE ON public.ca_jours_fermes
  FOR EACH ROW EXECUTE FUNCTION public.ca_set_updated_at();

-- RLS — même pattern que les autres tables CA
ALTER TABLE public.ca_jours_fermes ENABLE ROW LEVEL SECURITY;
CREATE POLICY ca_jours_fermes_select ON public.ca_jours_fermes FOR SELECT TO authenticated
  USING (public.user_has_client_access(client_id));
CREATE POLICY ca_jours_fermes_insert ON public.ca_jours_fermes FOR INSERT TO authenticated
  WITH CHECK (public.user_has_client_access(client_id));
CREATE POLICY ca_jours_fermes_update ON public.ca_jours_fermes FOR UPDATE TO authenticated
  USING (public.user_has_client_access(client_id))
  WITH CHECK (public.user_has_client_access(client_id));
CREATE POLICY ca_jours_fermes_delete ON public.ca_jours_fermes FOR DELETE TO authenticated
  USING (public.user_has_client_access(client_id));
