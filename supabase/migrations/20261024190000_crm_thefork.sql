-- CRM groupe, étape 2 : import des clients et réservations TheFork.
--
-- 1. crm_clients : champs alimentés par TheFork (identifiant, langue, VIP,
--    accord newsletter = contactable, allergies, préférences) + e-mail et
--    téléphone normalisés pour fusionner un même client venu dans plusieurs
--    maisons (fusion automatique sur e-mail ou téléphone).
-- 2. crm_reservations : historique des réservations par client et par maison.
-- 3. crm_thefork_restaurants : correspondance restaurant TheFork → établissement.
-- 4. crm_thefork_sync : réglage et avancement de la synchronisation par groupe
--    (curseurs, dernier résultat). Identifiants API dans les variables
--    d'environnement Vercel, jamais en base.
-- 5. groupes : seuils VIP et « client perdu » (réglables, défauts 5 visites
--    sur 12 mois, perdu après 6 mois sans visite).

-- ─── 1. crm_clients ─────────────────────────────────────────────────────────
ALTER TABLE public.crm_clients
  ADD COLUMN IF NOT EXISTS thefork_customer_uuid text,
  ADD COLUMN IF NOT EXISTS langue text,
  ADD COLUMN IF NOT EXISTS vip_thefork boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS contactable boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS allergies text,
  ADD COLUMN IF NOT EXISTS preferences text,
  ADD COLUMN IF NOT EXISTS email_norm text
    GENERATED ALWAYS AS (nullif(lower(trim(email)), '')) STORED,
  -- 9 derniers chiffres : +33 6 12… et 06 12… donnent la même clé
  ADD COLUMN IF NOT EXISTS telephone_norm text
    GENERATED ALWAYS AS (nullif(right(regexp_replace(coalesce(telephone, ''), '\D', '', 'g'), 9), '')) STORED;

CREATE UNIQUE INDEX IF NOT EXISTS crm_clients_thefork_uuid_key
  ON public.crm_clients (thefork_customer_uuid) WHERE thefork_customer_uuid IS NOT NULL;
CREATE INDEX IF NOT EXISTS crm_clients_email_norm_idx ON public.crm_clients (email_norm) WHERE email_norm IS NOT NULL;
CREATE INDEX IF NOT EXISTS crm_clients_telephone_norm_idx ON public.crm_clients (telephone_norm) WHERE telephone_norm IS NOT NULL;

-- ─── 2. crm_reservations ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.crm_reservations (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id      uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  crm_client_id  uuid REFERENCES public.crm_clients(id) ON DELETE CASCADE,
  source         text NOT NULL DEFAULT 'thefork',
  externe_id     text NOT NULL,
  date_repas     timestamptz,
  couverts       integer,
  statut         text,
  canal          text,
  montant        numeric(12,2),
  note_client    text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT crm_reservations_externe_key UNIQUE (source, externe_id)
);

CREATE INDEX IF NOT EXISTS crm_reservations_crm_client_idx ON public.crm_reservations (crm_client_id, date_repas DESC);
CREATE INDEX IF NOT EXISTS crm_reservations_client_date_idx ON public.crm_reservations (client_id, date_repas DESC);

DROP TRIGGER IF EXISTS crm_reservations_set_updated_at ON public.crm_reservations;
CREATE TRIGGER crm_reservations_set_updated_at
  BEFORE UPDATE ON public.crm_reservations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_timestamp();

ALTER TABLE public.crm_reservations ENABLE ROW LEVEL SECURITY;

-- Lecture selon le périmètre CRM (groupe partagé compris). Écritures par la
-- synchronisation (service_role) uniquement.
DROP POLICY IF EXISTS crm_reservations_select ON public.crm_reservations;
CREATE POLICY crm_reservations_select ON public.crm_reservations FOR SELECT TO authenticated
  USING (((SELECT public.get_my_is_superadmin()) IS TRUE)
         OR client_id IN (SELECT public.my_crm_client_ids('lecture')));

REVOKE ALL ON public.crm_reservations FROM anon;
GRANT SELECT ON public.crm_reservations TO authenticated;
GRANT ALL ON public.crm_reservations TO service_role;

-- ─── 3. Correspondance restaurants TheFork ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.crm_thefork_restaurants (
  restaurant_uuid text PRIMARY KEY,
  groupe_id       uuid NOT NULL REFERENCES public.groupes(id) ON DELETE CASCADE,
  client_id       uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  nom             text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.crm_thefork_restaurants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS crm_thefork_restaurants_superadmin ON public.crm_thefork_restaurants;
CREATE POLICY crm_thefork_restaurants_superadmin ON public.crm_thefork_restaurants FOR ALL TO authenticated
  USING ((SELECT public.get_my_is_superadmin()) IS TRUE)
  WITH CHECK ((SELECT public.get_my_is_superadmin()) IS TRUE);

REVOKE ALL ON public.crm_thefork_restaurants FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_thefork_restaurants TO authenticated;
GRANT ALL ON public.crm_thefork_restaurants TO service_role;

-- ─── 4. Suivi de synchronisation ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.crm_thefork_sync (
  groupe_id             uuid PRIMARY KEY REFERENCES public.groupes(id) ON DELETE CASCADE,
  thefork_group_uuid    text NOT NULL,
  actif                 boolean NOT NULL DEFAULT true,
  import_depuis         date NOT NULL DEFAULT (current_date - interval '2 years'),
  curseur_clients       date,
  curseur_reservations  date,
  derniere_execution    timestamptz,
  dernier_resultat      jsonb,
  created_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.crm_thefork_sync ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS crm_thefork_sync_superadmin ON public.crm_thefork_sync;
CREATE POLICY crm_thefork_sync_superadmin ON public.crm_thefork_sync FOR ALL TO authenticated
  USING ((SELECT public.get_my_is_superadmin()) IS TRUE)
  WITH CHECK ((SELECT public.get_my_is_superadmin()) IS TRUE);

REVOKE ALL ON public.crm_thefork_sync FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_thefork_sync TO authenticated;
GRANT ALL ON public.crm_thefork_sync TO service_role;

-- ─── 5. Seuils VIP / client perdu ───────────────────────────────────────────
ALTER TABLE public.groupes
  ADD COLUMN IF NOT EXISTS crm_vip_visites integer NOT NULL DEFAULT 5 CHECK (crm_vip_visites > 0),
  ADD COLUMN IF NOT EXISTS crm_vip_mois integer NOT NULL DEFAULT 12 CHECK (crm_vip_mois > 0),
  ADD COLUMN IF NOT EXISTS crm_perdu_mois integer NOT NULL DEFAULT 6 CHECK (crm_perdu_mois > 0);
