-- Vue groupe, étape 1 : regrouper des établissements (clients) sous un groupe.
--
-- Un groupe (ex. un groupe hôtelier) rassemble plusieurs établissements. La
-- vue groupe consolidera les indicateurs des établissements d'un même groupe
-- AUXQUELS L'UTILISATEUR A DÉJÀ ACCÈS (acces_clients) : le groupe ne donne
-- aucun accès supplémentaire, il ne fait que regrouper. L'option est activée
-- par établissement via clients.modules_actifs ('groupe').
--
-- Écritures : uniquement par le service_role (routes /api/superadmin/*),
-- comme pour la table clients. Aucune policy INSERT/UPDATE/DELETE.

CREATE TABLE IF NOT EXISTS public.groupes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nom        text NOT NULL CHECK (length(trim(nom)) > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS groupe_id uuid REFERENCES public.groupes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS clients_groupe_id_idx ON public.clients(groupe_id);

ALTER TABLE public.groupes ENABLE ROW LEVEL SECURITY;

-- Lecture : superadmin, ou membre d'au moins un établissement du groupe.
-- Motif "une fois par requête" (cf. 20260930120000_rls_initplan_perf.sql).
DROP POLICY IF EXISTS groupes_select_scoped ON public.groupes;
CREATE POLICY groupes_select_scoped ON public.groupes
  FOR SELECT TO authenticated
  USING (
    ((SELECT public.get_my_is_superadmin()) IS TRUE)
    OR id IN (
      SELECT c.groupe_id FROM public.clients c
      WHERE c.id IN (SELECT public.my_client_ids())
    )
  );

REVOKE ALL ON public.groupes FROM anon;

-- clients_update_scoped laisse un membre modifier SA ligne clients (paramètres,
-- demande de résiliation). Il ne doit pas pouvoir se rattacher à un groupe ni
-- s'activer des modules payants : seuls le superadmin et le service_role
-- (auth.uid() NULL) touchent à groupe_id et modules_actifs.
CREATE OR REPLACE FUNCTION public.clients_protect_admin_columns()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF auth.uid() IS NOT NULL
     AND COALESCE(public.get_my_is_superadmin(), false) IS NOT TRUE
     AND (NEW.groupe_id IS DISTINCT FROM OLD.groupe_id
          OR NEW.modules_actifs IS DISTINCT FROM OLD.modules_actifs)
  THEN
    RAISE EXCEPTION 'Modification réservée au superadmin (groupe, modules).'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.clients_protect_admin_columns() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS clients_protect_admin_columns ON public.clients;
CREATE TRIGGER clients_protect_admin_columns
  BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.clients_protect_admin_columns();
