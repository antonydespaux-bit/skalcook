-- ============================================================================
-- CRM — Versioning des devis envoyés (crm_devis_revisions)
--
-- À chaque POST /envoyer, on snapshote :
--   - l'état complet du header (crm_devis)
--   - toutes les lignes (crm_devis_lignes)
--   - l'état du crm_client destinataire
--   - les métadonnées d'envoi (to, subject, message, pdf_url versionné)
--
-- Le numéro du devis reste stable ; les révisions permettent l'audit et
-- de montrer au client l'évolution de la proposition (V1, V2, …).
--
-- Convention bucket pour les PDFs versionnés : {client_id}/{devis_id}/v{N}.pdf
-- (l'ancien path plat {client_id}/{devis_id}.pdf n'est plus écrit, le
-- crm_devis.pdf_url pointe désormais toujours vers la dernière révision).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.crm_devis_revisions (
  id             uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
  devis_id       uuid         NOT NULL REFERENCES public.crm_devis(id) ON DELETE CASCADE,
  client_id      uuid         NOT NULL,
  version        integer      NOT NULL,

  -- Snapshots (figés au moment de l'envoi)
  snapshot_header     jsonb   NOT NULL,
  snapshot_lignes     jsonb   NOT NULL,
  snapshot_crm_client jsonb,
  snapshot_tenant     jsonb,

  -- Métadonnées de l'envoi
  sent_at          timestamptz NOT NULL DEFAULT now(),
  sent_to_email    text        NOT NULL,
  sent_subject     text,
  sent_message     text,
  pdf_url          text        NOT NULL, -- path bucket : {client_id}/{devis_id}/v{N}.pdf

  created_by       uuid,
  created_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT crm_devis_revisions_version_unique UNIQUE (devis_id, version)
);

CREATE INDEX IF NOT EXISTS crm_devis_revisions_devis_id_idx
  ON public.crm_devis_revisions (devis_id, version DESC);
CREATE INDEX IF NOT EXISTS crm_devis_revisions_client_id_idx
  ON public.crm_devis_revisions (client_id);

-- ─── RLS ───────────────────────────────────────────────────────────────
ALTER TABLE public.crm_devis_revisions ENABLE ROW LEVEL SECURITY;

-- Lecture : n'importe quel membre de l'établissement
CREATE POLICY crm_devis_revisions_select ON public.crm_devis_revisions
  FOR SELECT TO authenticated
  USING (public.user_has_client_access(client_id));

-- Pas de policy INSERT/UPDATE/DELETE : les révisions ne sont écrites que
-- par la route /api/crm/devis/[id]/envoyer qui passe en service-role.
-- Empêche la falsification de l'historique depuis le client.
