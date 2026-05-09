-- ============================================================================
-- ca_budget_jours_override : permet de surcharger le nombre d'occurrences
-- d'un jour de la semaine pour un mois donné dans la projection budget.
--
-- Cas d'usage : un mois calendaire compte 5 jeudis mais le restaurant est
-- fermé un jeudi (jour férié) → l'utilisateur veut que sa projection
-- mensuelle soit basée sur 4 jeudis et non 5.
--
-- Affecte uniquement l'affichage Total mois sur /controle-gestion/ventes/budgets
-- (la comparaison réel vs budget sur /controle-gestion/analyses continue
-- d'itérer chaque jour calendaire — un éventuel "calendrier des fermetures
-- exceptionnelles" sera traité dans un chantier séparé).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.ca_budget_jours_override (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id    uuid        NOT NULL REFERENCES public.clients (id) ON DELETE CASCADE,
  annee        smallint    NOT NULL CHECK (annee BETWEEN 2024 AND 2100),
  mois         smallint    NOT NULL CHECK (mois BETWEEN 1 AND 12),
  jour_semaine smallint    NOT NULL CHECK (jour_semaine BETWEEN 1 AND 7),
  nb_jours     smallint    NOT NULL CHECK (nb_jours BETWEEN 0 AND 6),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ca_budget_jours_override_unique
    UNIQUE (client_id, annee, mois, jour_semaine)
);

COMMENT ON TABLE public.ca_budget_jours_override IS
  'Override du nb d''occurrences d''un jour-de-semaine dans un mois (ex: 4 jeudis au lieu de 5 si fermeture exceptionnelle). Utilisé uniquement pour la projection mensuelle dans la page budgets.';

CREATE INDEX IF NOT EXISTS ca_budget_jours_override_client_annee_idx
  ON public.ca_budget_jours_override (client_id, annee);

-- Trigger updated_at (réutilise la fonction posée par 20260506000000_ca_journalier.sql)
DROP TRIGGER IF EXISTS trg_ca_budget_jours_override_updated_at ON public.ca_budget_jours_override;
CREATE TRIGGER trg_ca_budget_jours_override_updated_at
  BEFORE UPDATE ON public.ca_budget_jours_override
  FOR EACH ROW EXECUTE FUNCTION public.ca_set_updated_at();

-- RLS — même pattern que les autres tables CA
ALTER TABLE public.ca_budget_jours_override ENABLE ROW LEVEL SECURITY;
CREATE POLICY ca_budget_jours_override_select ON public.ca_budget_jours_override FOR SELECT TO authenticated
  USING (public.user_has_client_access(client_id));
CREATE POLICY ca_budget_jours_override_insert ON public.ca_budget_jours_override FOR INSERT TO authenticated
  WITH CHECK (public.user_has_client_access(client_id));
CREATE POLICY ca_budget_jours_override_update ON public.ca_budget_jours_override FOR UPDATE TO authenticated
  USING (public.user_has_client_access(client_id))
  WITH CHECK (public.user_has_client_access(client_id));
CREATE POLICY ca_budget_jours_override_delete ON public.ca_budget_jours_override FOR DELETE TO authenticated
  USING (public.user_has_client_access(client_id));
