-- ============================================================================
-- CRM — crm_client_activities : timeline d'activités par client CRM.
--
-- Deux sources d'alimentation :
--   - Système : auto-insert depuis /api/crm/devis/[id]/envoyer (type
--     'devis_envoye'), lié via crm_devis_id / crm_devis_revision_id.
--   - Manuel : bouton "+ Ajouter une activité" sur la page client, pour
--     loguer un appel, une relance, une note, un rendez-vous, etc.
--
-- occurred_at est distinct de created_at : permet de loguer un événement
-- passé (ex. "appel du 10 avril" saisi le 15).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.crm_client_activities (
  id                     uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id              uuid        NOT NULL,
  crm_client_id          uuid        NOT NULL REFERENCES public.crm_clients(id) ON DELETE CASCADE,

  type                   text        NOT NULL
                                     CHECK (type IN (
                                       'appel', 'email', 'relance', 'note',
                                       'rendez_vous',
                                       'devis_envoye', 'devis_modifie',
                                       'evenement_cree'
                                     )),

  titre                  text,
  description            text,
  occurred_at            timestamptz NOT NULL DEFAULT now(),

  -- Soft-links vers les entités liées (pour les entrées système)
  crm_evenement_id       uuid        REFERENCES public.crm_evenements(id)      ON DELETE SET NULL,
  crm_devis_id           uuid        REFERENCES public.crm_devis(id)           ON DELETE SET NULL,
  crm_devis_revision_id  uuid        REFERENCES public.crm_devis_revisions(id) ON DELETE SET NULL,

  created_by             uuid,
  created_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crm_client_activities_crm_client_idx
  ON public.crm_client_activities (crm_client_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS crm_client_activities_client_idx
  ON public.crm_client_activities (client_id, occurred_at DESC);

-- ─── RLS ───────────────────────────────────────────────────────────────
ALTER TABLE public.crm_client_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY crm_client_activities_select ON public.crm_client_activities
  FOR SELECT TO authenticated
  USING (public.user_has_client_access(client_id));

CREATE POLICY crm_client_activities_insert ON public.crm_client_activities
  FOR INSERT TO authenticated
  WITH CHECK (public.user_has_client_access(client_id));

CREATE POLICY crm_client_activities_update ON public.crm_client_activities
  FOR UPDATE TO authenticated
  USING (public.user_has_client_access(client_id) AND created_by = auth.uid())
  WITH CHECK (public.user_has_client_access(client_id));

CREATE POLICY crm_client_activities_delete ON public.crm_client_activities
  FOR DELETE TO authenticated
  USING (public.user_has_client_access(client_id) AND created_by = auth.uid());
