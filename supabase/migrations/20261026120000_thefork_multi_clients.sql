-- Connecteur TheFork, corrections avant l'import réel (≈ 30 000 contacts) :
--
-- 1. Identifiants API par groupe (chaque groupe de restaurants reçoit les
--    siens de TheFork), chiffrés dans le Vault Supabase. Jamais relus par le
--    navigateur : écriture et lecture via deux fonctions réservées au
--    service_role.
-- 2. Jeton d'accès gardé en base jusqu'à expiration (consigne TheFork : ne
--    pas en redemander un tant que le précédent est valide). Table sans
--    aucune policy : service_role uniquement.
-- 3. File d'attente reprenable (crm_thefork_file) : la liste des
--    identifiants est rapatriée d'abord, puis chaque fiche est lue à un débit
--    réglable ; une coupure reprend là où elle s'est arrêtée.
-- 4. RGPD : on ne garde plus les allergies (données de santé) ; une
--    désinscription faite dans skalcook n'est jamais annulée par TheFork.
-- 5. Champs utiles au traiteur : prescripteur (concierge), rang, champs
--    personnalisés du groupe ; date de dernière vérification pour repérer les
--    fiches supprimées chez TheFork.

-- ─── crm_clients ────────────────────────────────────────────────────────────
ALTER TABLE public.crm_clients DROP COLUMN IF EXISTS allergies;
ALTER TABLE public.crm_clients
  ADD COLUMN IF NOT EXISTS desinscrit_at timestamptz,
  ADD COLUMN IF NOT EXISTS prescripteur boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS rang text,
  ADD COLUMN IF NOT EXISTS champs_thefork jsonb,
  ADD COLUMN IF NOT EXISTS thefork_verifie_at timestamptz;

CREATE INDEX IF NOT EXISTS crm_clients_thefork_verifie_idx
  ON public.crm_clients (thefork_verifie_at NULLS FIRST) WHERE thefork_customer_uuid IS NOT NULL;

-- ─── crm_thefork_sync ───────────────────────────────────────────────────────
ALTER TABLE public.crm_thefork_sync ALTER COLUMN thefork_group_uuid DROP NOT NULL;
ALTER TABLE public.crm_thefork_sync ALTER COLUMN import_depuis SET DEFAULT DATE '2015-01-01';
ALTER TABLE public.crm_thefork_sync
  ADD COLUMN IF NOT EXISTS vault_secret_id uuid,
  ADD COLUMN IF NOT EXISTS identifiants_maj timestamptz,
  ADD COLUMN IF NOT EXISTS debit_par_seconde numeric(5,2) NOT NULL DEFAULT 5 CHECK (debit_par_seconde > 0 AND debit_par_seconde <= 50);

-- ─── Jeton d'accès (service_role uniquement) ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.crm_thefork_jetons (
  groupe_id  uuid PRIMARY KEY REFERENCES public.groupes(id) ON DELETE CASCADE,
  jeton      text NOT NULL,
  expire_at  timestamptz NOT NULL
);
ALTER TABLE public.crm_thefork_jetons ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.crm_thefork_jetons FROM anon, authenticated;
GRANT ALL ON public.crm_thefork_jetons TO service_role;

-- ─── File d'attente ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.crm_thefork_file (
  groupe_id   uuid NOT NULL REFERENCES public.groupes(id) ON DELETE CASCADE,
  type        text NOT NULL CHECK (type IN ('client', 'reservation')),
  uuid        text NOT NULL,
  statut      text NOT NULL DEFAULT 'a_traiter' CHECK (statut IN ('a_traiter', 'traite', 'introuvable', 'erreur')),
  tentatives  integer NOT NULL DEFAULT 0,
  erreur      text,
  maj_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (groupe_id, type, uuid)
);
CREATE INDEX IF NOT EXISTS crm_thefork_file_a_traiter_idx
  ON public.crm_thefork_file (groupe_id, type, maj_at) WHERE statut = 'a_traiter';

ALTER TABLE public.crm_thefork_file ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS crm_thefork_file_superadmin ON public.crm_thefork_file;
CREATE POLICY crm_thefork_file_superadmin ON public.crm_thefork_file FOR SELECT TO authenticated
  USING ((SELECT public.get_my_is_superadmin()) IS TRUE);
REVOKE ALL ON public.crm_thefork_file FROM anon;
GRANT SELECT ON public.crm_thefork_file TO authenticated;
GRANT ALL ON public.crm_thefork_file TO service_role;

-- ─── Identifiants dans le Vault ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.thefork_enregistrer_identifiants(p_groupe_id uuid, p_client_id text, p_client_secret text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_id uuid;
  v_valeur text := json_build_object('client_id', p_client_id, 'client_secret', p_client_secret)::text;
  v_nom text := 'thefork_' || p_groupe_id::text;
BEGIN
  IF coalesce(trim(p_client_id), '') = '' OR coalesce(trim(p_client_secret), '') = '' THEN
    RAISE EXCEPTION 'Identifiants TheFork incomplets';
  END IF;
  SELECT vault_secret_id INTO v_id FROM public.crm_thefork_sync WHERE groupe_id = p_groupe_id;
  IF v_id IS NOT NULL AND EXISTS (SELECT 1 FROM vault.secrets WHERE id = v_id) THEN
    PERFORM vault.update_secret(v_id, v_valeur, v_nom, 'Identifiants API B2B TheFork');
  ELSE
    SELECT vault.create_secret(v_valeur, v_nom, 'Identifiants API B2B TheFork') INTO v_id;
  END IF;
  INSERT INTO public.crm_thefork_sync (groupe_id, vault_secret_id, identifiants_maj)
  VALUES (p_groupe_id, v_id, now())
  ON CONFLICT (groupe_id) DO UPDATE SET vault_secret_id = excluded.vault_secret_id, identifiants_maj = now();
  -- Nouveaux identifiants : l'ancien jeton ne vaut plus
  DELETE FROM public.crm_thefork_jetons WHERE groupe_id = p_groupe_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.thefork_identifiants(p_groupe_id uuid)
 RETURNS TABLE (client_id text, client_secret text)
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT (d.decrypted_secret::json ->> 'client_id'), (d.decrypted_secret::json ->> 'client_secret')
  FROM public.crm_thefork_sync s
  JOIN vault.decrypted_secrets d ON d.id = s.vault_secret_id
  WHERE s.groupe_id = p_groupe_id;
$function$;

REVOKE EXECUTE ON FUNCTION public.thefork_enregistrer_identifiants(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.thefork_identifiants(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.thefork_enregistrer_identifiants(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.thefork_identifiants(uuid) TO service_role;

-- Compteurs de la file par type et statut (écran superadmin)
CREATE OR REPLACE FUNCTION public.thefork_file_compteurs(p_groupe_id uuid)
 RETURNS TABLE (type text, statut text, nombre bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT type, statut, count(*) FROM public.crm_thefork_file WHERE groupe_id = p_groupe_id GROUP BY 1, 2;
$function$;
REVOKE EXECUTE ON FUNCTION public.thefork_file_compteurs(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.thefork_file_compteurs(uuid) TO service_role;
