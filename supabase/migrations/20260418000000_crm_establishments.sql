-- ============================================================================
-- CRM module — per-establishment clients (customers) and events (traiteur).
--
-- Naming note: in this codebase, "clients" (public.clients) refers to the
-- *establishments* (tenants). The CRM tables therefore use the "crm_" prefix
-- to avoid any ambiguity:
--   - crm_clients    : customers / prospects of the establishment
--   - crm_evenements : catering events linked to a crm_client
--
-- Scoped by client_id (= establishment id), RLS uses the existing helper
-- public.user_has_client_access(client_id).
-- ============================================================================

-- ─── Table crm_clients ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.crm_clients (
  id             uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id      uuid        NOT NULL,
  type           text        NOT NULL DEFAULT 'particulier'
                              CHECK (type IN ('particulier', 'entreprise')),
  -- Identité
  nom            text,
  prenom         text,
  raison_sociale text,
  siret          text,
  -- Contact
  email          text,
  telephone      text,
  -- Adresse
  adresse        text,
  code_postal    text,
  ville          text,
  -- Meta
  source         text,
  tags           text[]      NOT NULL DEFAULT ARRAY[]::text[],
  notes          text,
  created_by     uuid,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crm_clients_client_id_idx ON public.crm_clients (client_id);
CREATE INDEX IF NOT EXISTS crm_clients_email_idx     ON public.crm_clients (client_id, email);
CREATE INDEX IF NOT EXISTS crm_clients_nom_idx       ON public.crm_clients (client_id, nom);

-- ─── Table crm_evenements ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.crm_evenements (
  id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id       uuid        NOT NULL,
  crm_client_id   uuid        NOT NULL REFERENCES public.crm_clients(id) ON DELETE CASCADE,
  titre           text        NOT NULL,
  type_prestation text, -- mariage, cocktail, buffet, livraison, seminaire, autre
  date_evenement  date,
  heure_debut     time,
  nb_convives     integer,
  lieu_type       text        DEFAULT 'sur_place'
                               CHECK (lieu_type IN ('sur_place', 'livraison', 'externe')),
  lieu_adresse    text,
  statut          text        NOT NULL DEFAULT 'demande'
                               CHECK (statut IN (
                                 'demande', 'devis_envoye', 'degustation', 'negociation',
                                 'acompte', 'confirme', 'realise', 'facture', 'paye',
                                 'annule', 'perdu'
                               )),
  budget_estime   numeric,
  montant_devis   numeric,
  montant_final   numeric,
  notes           text,
  created_by      uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crm_evenements_client_id_idx     ON public.crm_evenements (client_id);
CREATE INDEX IF NOT EXISTS crm_evenements_crm_client_id_idx ON public.crm_evenements (crm_client_id);
CREATE INDEX IF NOT EXISTS crm_evenements_date_idx          ON public.crm_evenements (client_id, date_evenement);
CREATE INDEX IF NOT EXISTS crm_evenements_statut_idx        ON public.crm_evenements (client_id, statut);

-- ─── Trigger updated_at ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at_timestamp()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS crm_clients_set_updated_at ON public.crm_clients;
CREATE TRIGGER crm_clients_set_updated_at
  BEFORE UPDATE ON public.crm_clients
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_timestamp();

DROP TRIGGER IF EXISTS crm_evenements_set_updated_at ON public.crm_evenements;
CREATE TRIGGER crm_evenements_set_updated_at
  BEFORE UPDATE ON public.crm_evenements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_timestamp();

-- ─── RLS: crm_clients ───────────────────────────────────────────────────────
ALTER TABLE public.crm_clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY crm_clients_select ON public.crm_clients FOR SELECT TO authenticated
  USING (public.user_has_client_access(client_id));
CREATE POLICY crm_clients_insert ON public.crm_clients FOR INSERT TO authenticated
  WITH CHECK (public.user_has_client_access(client_id));
CREATE POLICY crm_clients_update ON public.crm_clients FOR UPDATE TO authenticated
  USING (public.user_has_client_access(client_id))
  WITH CHECK (public.user_has_client_access(client_id));
CREATE POLICY crm_clients_delete ON public.crm_clients FOR DELETE TO authenticated
  USING (public.user_has_client_access(client_id));

-- ─── RLS: crm_evenements ────────────────────────────────────────────────────
ALTER TABLE public.crm_evenements ENABLE ROW LEVEL SECURITY;

CREATE POLICY crm_evenements_select ON public.crm_evenements FOR SELECT TO authenticated
  USING (public.user_has_client_access(client_id));
CREATE POLICY crm_evenements_insert ON public.crm_evenements FOR INSERT TO authenticated
  WITH CHECK (public.user_has_client_access(client_id));
CREATE POLICY crm_evenements_update ON public.crm_evenements FOR UPDATE TO authenticated
  USING (public.user_has_client_access(client_id))
  WITH CHECK (public.user_has_client_access(client_id));
CREATE POLICY crm_evenements_delete ON public.crm_evenements FOR DELETE TO authenticated
  USING (public.user_has_client_access(client_id));
