-- Réquisitions, étape 2 : services internes paramétrables.
--
-- Un service est une équipe de l'établissement qui passe et/ou prépare des
-- réquisitions : Étages, Room service, Économat, Cuisine, Bar, Spa… Aucun nom
-- n'est écrit en dur, chaque établissement crée les siens (Paramètres ›
-- Services).
--   peut_demander  le service passe des commandes
--   peut_preparer  le service reçoit des commandes et sort de son stock
--   stock          catalogue servi par le service quand il prépare :
--                  'cuisine' (ingredients), 'bar' (ingredients_bar),
--                  'articles' (catalogue hors F&B, étape 3), 'aucun'
--
-- Les membres (service_membres) disent qui est de quel service : la personne
-- connectée commande au nom de ses services, et voit les commandes à
-- préparer des siens. Le responsable valide les demandes de son service
-- quand l'établissement l'exige (clients.requisitions_validation).
--
-- RLS (motif « une fois par requête », cf. 20260930120000_rls_initplan_perf) :
--   services_internes : lecture par tout membre de l'établissement (il faut
--     voir les services pour choisir un destinataire), écriture
--     « administration » en modification.
--   service_membres : lecture de ses propres appartenances, ou
--     « administration » en lecture ; écriture « administration ».
-- L'appli écrit via les routes /api/requisitions/* (service_role, guard
-- requirePermission) ; les policies ferment l'accès direct PostgREST.

-- ── Réglage de l'établissement ─────────────────────────────────────────────
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS requisitions_validation boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.clients.requisitions_validation IS
  'Réquisitions : une demande doit être validée par le responsable du service demandeur avant préparation.';

-- ── Services internes ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.services_internes (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id      uuid        NOT NULL REFERENCES public.clients (id) ON DELETE CASCADE,
  nom            text        NOT NULL CHECK (length(btrim(nom)) BETWEEN 1 AND 80),
  emoji          text        CHECK (emoji IS NULL OR length(emoji) <= 16),
  ordre          integer     NOT NULL DEFAULT 0,
  actif          boolean     NOT NULL DEFAULT true,
  peut_demander  boolean     NOT NULL DEFAULT true,
  peut_preparer  boolean     NOT NULL DEFAULT false,
  stock          text        NOT NULL DEFAULT 'aucun'
                             CHECK (stock IN ('aucun', 'cuisine', 'bar', 'articles')),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT services_internes_role_check CHECK (peut_demander OR peut_preparer),
  CONSTRAINT services_internes_stock_check CHECK (NOT peut_preparer OR stock <> 'aucun'),
  -- Cible de la clé composée de service_membres (même établissement garanti).
  CONSTRAINT services_internes_id_client_key UNIQUE (id, client_id)
);

COMMENT ON TABLE public.services_internes IS
  'Services internes de l''établissement (étages, économat, cuisine…) qui passent et/ou préparent des réquisitions.';

-- Nom unique par établissement, sans tenir compte de la casse ni des espaces.
CREATE UNIQUE INDEX IF NOT EXISTS services_internes_client_nom_key
  ON public.services_internes (client_id, lower(btrim(nom)));

CREATE INDEX IF NOT EXISTS services_internes_client_ordre_idx
  ON public.services_internes (client_id, ordre);

-- ── Membres des services ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.service_membres (
  service_id   uuid        NOT NULL,
  client_id    uuid        NOT NULL REFERENCES public.clients (id) ON DELETE CASCADE,
  user_id      uuid        NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  responsable  boolean     NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (service_id, user_id),
  CONSTRAINT service_membres_service_fkey FOREIGN KEY (service_id, client_id)
    REFERENCES public.services_internes (id, client_id) ON DELETE CASCADE
);

COMMENT ON TABLE public.service_membres IS
  'Appartenance des utilisateurs aux services internes (responsable = valide les demandes du service).';

CREATE INDEX IF NOT EXISTS service_membres_user_idx
  ON public.service_membres (user_id, client_id);

CREATE INDEX IF NOT EXISTS service_membres_client_idx
  ON public.service_membres (client_id);

-- ── updated_at ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.services_internes_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  new.updated_at := now();
  return new;
end;
$function$;

DROP TRIGGER IF EXISTS trg_services_internes_updated_at ON public.services_internes;
CREATE TRIGGER trg_services_internes_updated_at
  BEFORE UPDATE ON public.services_internes
  FOR EACH ROW EXECUTE FUNCTION public.services_internes_set_updated_at();

-- ── Retrait d'un accès : retirer l'utilisateur des services ────────────────
-- Sans cela, un ancien employé resterait membre (et recevrait les
-- notifications) d'un établissement auquel il n'a plus accès.
CREATE OR REPLACE FUNCTION public.acces_clients_retirer_services()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  delete from public.service_membres m
    where m.user_id = old.user_id and m.client_id = old.client_id;
  return null;
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.acces_clients_retirer_services() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_acces_clients_retirer_services ON public.acces_clients;
CREATE TRIGGER trg_acces_clients_retirer_services
  AFTER DELETE ON public.acces_clients
  FOR EACH ROW EXECUTE FUNCTION public.acces_clients_retirer_services();

-- ── RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE public.services_internes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_membres ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS services_internes_select ON public.services_internes;
DROP POLICY IF EXISTS services_internes_insert ON public.services_internes;
DROP POLICY IF EXISTS services_internes_update ON public.services_internes;
DROP POLICY IF EXISTS services_internes_delete ON public.services_internes;

CREATE POLICY services_internes_select ON public.services_internes FOR SELECT TO authenticated
  USING (((SELECT public.get_my_is_superadmin()) IS TRUE)
         OR (client_id IN (SELECT public.my_client_ids())));
CREATE POLICY services_internes_insert ON public.services_internes FOR INSERT TO authenticated
  WITH CHECK (((SELECT public.get_my_is_superadmin()) IS TRUE)
         OR (client_id IN (SELECT public.my_client_ids_for('administration', 'modification'))));
CREATE POLICY services_internes_update ON public.services_internes FOR UPDATE TO authenticated
  USING (((SELECT public.get_my_is_superadmin()) IS TRUE)
         OR (client_id IN (SELECT public.my_client_ids_for('administration', 'modification'))))
  WITH CHECK (((SELECT public.get_my_is_superadmin()) IS TRUE)
         OR (client_id IN (SELECT public.my_client_ids_for('administration', 'modification'))));
CREATE POLICY services_internes_delete ON public.services_internes FOR DELETE TO authenticated
  USING (((SELECT public.get_my_is_superadmin()) IS TRUE)
         OR (client_id IN (SELECT public.my_client_ids_for('administration', 'modification'))));

DROP POLICY IF EXISTS service_membres_select ON public.service_membres;
DROP POLICY IF EXISTS service_membres_insert ON public.service_membres;
DROP POLICY IF EXISTS service_membres_update ON public.service_membres;
DROP POLICY IF EXISTS service_membres_delete ON public.service_membres;

CREATE POLICY service_membres_select ON public.service_membres FOR SELECT TO authenticated
  USING (((SELECT public.get_my_is_superadmin()) IS TRUE)
         OR (user_id = (SELECT auth.uid()) AND client_id IN (SELECT public.my_client_ids()))
         OR (client_id IN (SELECT public.my_client_ids_for('administration', 'lecture'))));
CREATE POLICY service_membres_insert ON public.service_membres FOR INSERT TO authenticated
  WITH CHECK (((SELECT public.get_my_is_superadmin()) IS TRUE)
         OR (client_id IN (SELECT public.my_client_ids_for('administration', 'modification'))));
CREATE POLICY service_membres_update ON public.service_membres FOR UPDATE TO authenticated
  USING (((SELECT public.get_my_is_superadmin()) IS TRUE)
         OR (client_id IN (SELECT public.my_client_ids_for('administration', 'modification'))))
  WITH CHECK (((SELECT public.get_my_is_superadmin()) IS TRUE)
         OR (client_id IN (SELECT public.my_client_ids_for('administration', 'modification'))));
CREATE POLICY service_membres_delete ON public.service_membres FOR DELETE TO authenticated
  USING (((SELECT public.get_my_is_superadmin()) IS TRUE)
         OR (client_id IN (SELECT public.my_client_ids_for('administration', 'modification'))));

-- ── Droits d'accès à la Data API ───────────────────────────────────────────
-- À partir du 2026-10-30, Supabase n'accorde plus automatiquement l'accès
-- aux nouvelles tables de « public » : chaque table créée ici reçoit ses
-- GRANT explicites (sans eux, même les routes API en service_role
-- reçoivent « permission denied »). anon : aucun accès ; la RLS filtre
-- ensuite ce qu'authenticated voit et modifie.
REVOKE ALL ON public.services_internes FROM anon;
REVOKE ALL ON public.service_membres FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.services_internes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_membres TO authenticated;
GRANT ALL ON public.services_internes TO service_role;
GRANT ALL ON public.service_membres TO service_role;
