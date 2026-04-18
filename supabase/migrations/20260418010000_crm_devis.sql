-- ============================================================================
-- CRM — Devis module (quotes)
--
-- Tables
--   crm_devis          : quote header (one row per quote)
--   crm_devis_lignes   : quote line items (fiche reference or free-text)
--   crm_devis_numeros  : per-establishment, per-year numbering counter
--
-- Numbering
--   - Format rendered application-side as: {prefix}-{YYYY}-{NNN}
--   - Prefix is per establishment: public.clients.devis_prefix (default 'DEV')
--   - Sequence is atomic via public.crm_next_devis_numero(client_id, annee)
--
-- TVA
--   - Stored per line (taux in %). Restaurant reality: 10% sur place, 20% alcool,
--     5.5% vente à emporter froide, 0% export / hors champ.
--   - Totaux HT/TVA/TTC stored on the header for fast listing (recomputed on save).
--
-- Scoping & RLS
--   - All tables carry client_id (establishment/tenant) and use
--     public.user_has_client_access(client_id) like the rest of the CRM.
--   - crm_devis_lignes duplicates client_id (denormalized) so RLS doesn't need
--     a join — consistent with the postgres-patterns advice.
-- ============================================================================

-- ─── clients: add devis_prefix ──────────────────────────────────────────────
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS devis_prefix text NOT NULL DEFAULT 'DEV';

-- Keep prefix short and URL/filename-safe.
ALTER TABLE public.clients
  DROP CONSTRAINT IF EXISTS clients_devis_prefix_check;
ALTER TABLE public.clients
  ADD CONSTRAINT clients_devis_prefix_check
  CHECK (devis_prefix ~ '^[A-Z0-9]{2,8}$');

-- ─── Table crm_devis ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.crm_devis (
  id                    uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id             uuid        NOT NULL,
  crm_client_id         uuid        NOT NULL REFERENCES public.crm_clients(id)    ON DELETE RESTRICT,
  crm_evenement_id      uuid                 REFERENCES public.crm_evenements(id) ON DELETE SET NULL,

  -- Numérotation
  numero                text        NOT NULL,   -- rendered string: "DEV-2026-042"
  annee                 integer     NOT NULL,
  sequence              integer     NOT NULL,

  -- Statut du devis (distinct du statut événement CRM)
  statut                text        NOT NULL DEFAULT 'brouillon'
                                     CHECK (statut IN (
                                       'brouillon', 'envoye', 'accepte', 'refuse', 'expire'
                                     )),

  -- Dates
  date_emission         date        NOT NULL DEFAULT CURRENT_DATE,
  date_validite         date,

  -- Totaux (recalculés côté app à chaque save)
  total_ht              numeric(12,2) NOT NULL DEFAULT 0,
  total_tva             numeric(12,2) NOT NULL DEFAULT 0,
  total_ttc             numeric(12,2) NOT NULL DEFAULT 0,

  -- Conditions commerciales
  conditions_paiement   text,
  acompte_pourcentage   numeric(5,2) CHECK (acompte_pourcentage IS NULL
                                            OR (acompte_pourcentage >= 0
                                                AND acompte_pourcentage <= 100)),
  notes                 text,

  -- PDF généré (bucket supabase "devis")
  pdf_url               text,
  pdf_generated_at      timestamptz,

  -- Envoi
  sent_at               timestamptz,
  sent_to_email         text,

  created_by            uuid,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT crm_devis_numero_unique UNIQUE (client_id, numero),
  CONSTRAINT crm_devis_sequence_unique UNIQUE (client_id, annee, sequence)
);

CREATE INDEX IF NOT EXISTS crm_devis_client_id_idx        ON public.crm_devis (client_id);
CREATE INDEX IF NOT EXISTS crm_devis_crm_client_id_idx    ON public.crm_devis (crm_client_id);
CREATE INDEX IF NOT EXISTS crm_devis_crm_evenement_id_idx ON public.crm_devis (crm_evenement_id);
CREATE INDEX IF NOT EXISTS crm_devis_statut_idx           ON public.crm_devis (client_id, statut);
CREATE INDEX IF NOT EXISTS crm_devis_date_emission_idx    ON public.crm_devis (client_id, date_emission DESC);

-- ─── Table crm_devis_lignes ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.crm_devis_lignes (
  id               uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  devis_id         uuid        NOT NULL REFERENCES public.crm_devis(id) ON DELETE CASCADE,
  client_id        uuid        NOT NULL, -- denormalized for RLS

  -- Ordre d'affichage dans le devis
  ordre            integer     NOT NULL DEFAULT 0,

  -- Type de ligne : fiche technique ou ligne libre (matériel, service, déplacement…)
  type             text        NOT NULL DEFAULT 'fiche'
                               CHECK (type IN ('fiche', 'libre')),

  -- Référence fiche (nullable, set null si la fiche est archivée/supprimée)
  fiche_id         uuid        REFERENCES public.fiches(id) ON DELETE SET NULL,

  -- Snapshot au moment de la création (le devis doit rester lisible même si la fiche change)
  designation      text        NOT NULL,
  description      text,
  allergenes       text[]      NOT NULL DEFAULT ARRAY[]::text[],

  -- Montants
  quantite         numeric(10,2) NOT NULL DEFAULT 1,
  prix_unitaire_ht numeric(12,2) NOT NULL DEFAULT 0,
  tva_taux         numeric(5,2)  NOT NULL DEFAULT 10,   -- % (10 par défaut = resto sur place)
  remise_pct       numeric(5,2)  NOT NULL DEFAULT 0
                                 CHECK (remise_pct >= 0 AND remise_pct <= 100),

  -- Totaux de la ligne (stockés pour cohérence PDF / factures ultérieures)
  total_ht         numeric(12,2) NOT NULL DEFAULT 0,
  total_tva        numeric(12,2) NOT NULL DEFAULT 0,
  total_ttc        numeric(12,2) NOT NULL DEFAULT 0,

  created_at       timestamptz NOT NULL DEFAULT now(),

  -- Si type = 'fiche', fiche_id devrait être renseigné à la création
  CONSTRAINT crm_devis_lignes_fiche_coherence CHECK (
    type <> 'fiche' OR fiche_id IS NOT NULL OR designation IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS crm_devis_lignes_devis_id_idx  ON public.crm_devis_lignes (devis_id, ordre);
CREATE INDEX IF NOT EXISTS crm_devis_lignes_client_id_idx ON public.crm_devis_lignes (client_id);
CREATE INDEX IF NOT EXISTS crm_devis_lignes_fiche_id_idx  ON public.crm_devis_lignes (fiche_id);

-- ─── Table crm_devis_numeros (compteur par établissement × année) ───────────
CREATE TABLE IF NOT EXISTS public.crm_devis_numeros (
  client_id       uuid    NOT NULL,
  annee           integer NOT NULL,
  dernier_numero  integer NOT NULL DEFAULT 0,
  PRIMARY KEY (client_id, annee)
);

-- ─── Function: atomic next-number allocation ────────────────────────────────
-- Usage côté app :
--   select public.crm_next_devis_numero('<client_id>', 2026);
--   -- returns 1, then 2, then 3 … on each call
CREATE OR REPLACE FUNCTION public.crm_next_devis_numero(
  p_client_id uuid,
  p_annee     integer
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_numero integer;
BEGIN
  -- Autorisation : seul un user ayant accès au tenant peut allouer un numéro
  IF NOT public.user_has_client_access(p_client_id) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.crm_devis_numeros (client_id, annee, dernier_numero)
  VALUES (p_client_id, p_annee, 1)
  ON CONFLICT (client_id, annee)
  DO UPDATE SET dernier_numero = public.crm_devis_numeros.dernier_numero + 1
  RETURNING dernier_numero INTO v_numero;

  RETURN v_numero;
END;
$$;

REVOKE ALL ON FUNCTION public.crm_next_devis_numero(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crm_next_devis_numero(uuid, integer) TO authenticated;

-- ─── Triggers updated_at ────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS crm_devis_set_updated_at ON public.crm_devis;
CREATE TRIGGER crm_devis_set_updated_at
  BEFORE UPDATE ON public.crm_devis
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_timestamp();

-- ─── RLS: crm_devis ─────────────────────────────────────────────────────────
ALTER TABLE public.crm_devis ENABLE ROW LEVEL SECURITY;

CREATE POLICY crm_devis_select ON public.crm_devis FOR SELECT TO authenticated
  USING (public.user_has_client_access(client_id));
CREATE POLICY crm_devis_insert ON public.crm_devis FOR INSERT TO authenticated
  WITH CHECK (public.user_has_client_access(client_id));
CREATE POLICY crm_devis_update ON public.crm_devis FOR UPDATE TO authenticated
  USING (public.user_has_client_access(client_id))
  WITH CHECK (public.user_has_client_access(client_id));
CREATE POLICY crm_devis_delete ON public.crm_devis FOR DELETE TO authenticated
  USING (public.user_has_client_access(client_id));

-- ─── RLS: crm_devis_lignes ──────────────────────────────────────────────────
ALTER TABLE public.crm_devis_lignes ENABLE ROW LEVEL SECURITY;

CREATE POLICY crm_devis_lignes_select ON public.crm_devis_lignes FOR SELECT TO authenticated
  USING (public.user_has_client_access(client_id));
CREATE POLICY crm_devis_lignes_insert ON public.crm_devis_lignes FOR INSERT TO authenticated
  WITH CHECK (public.user_has_client_access(client_id));
CREATE POLICY crm_devis_lignes_update ON public.crm_devis_lignes FOR UPDATE TO authenticated
  USING (public.user_has_client_access(client_id))
  WITH CHECK (public.user_has_client_access(client_id));
CREATE POLICY crm_devis_lignes_delete ON public.crm_devis_lignes FOR DELETE TO authenticated
  USING (public.user_has_client_access(client_id));

-- ─── RLS: crm_devis_numeros ────────────────────────────────────────────────
-- Lecture/écriture directe interdite : passe uniquement par crm_next_devis_numero().
ALTER TABLE public.crm_devis_numeros ENABLE ROW LEVEL SECURITY;
-- Aucune policy → table verrouillée pour les clients authenticated.
-- La function SECURITY DEFINER peut toujours y écrire.
