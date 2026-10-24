-- CRM commun à un groupe (ex. groupe Hélène Darroze : MARSAN + JOIA).
--
-- 1. groupes.crm_partage : quand il est vrai, les clients, événements, devis
--    et activités CRM de chaque établissement du groupe sont visibles et
--    modifiables depuis tous les établissements du groupe (selon le droit
--    'crm' de l'utilisateur sur SON établissement). Une ligne garde son
--    client_id d'origine (établissement qui l'a créée, numérotation des devis).
--    Hors partage, rien ne change : périmètre = l'établissement seul.
--
-- 2. crm_lieux : lieux où se tient un événement. Un lieu appartient à un
--    groupe ou à un établissement ; client_id renseigné = lieu qui EST un
--    établissement skalcook (MARSAN, JOIA), NULL = lieu sans établissement
--    (ex. Maison Michodière, salle dédiée aux groupes, sans budget ni factures).
--
-- 3. Événements et devis : lieu_id (où) + etablissement_ca_id (établissement
--    qui encaisse le CA une fois signé, ex. un devis Michodière signé pour
--    MARSAN).
--
-- 4. Nouveau rôle 'commercial' dans la matrice des droits (CRM en
--    modification, fiches/menus/avis en lecture, le reste fermé).

-- ─── 1. Partage du CRM au niveau du groupe ──────────────────────────────────
ALTER TABLE public.groupes
  ADD COLUMN IF NOT EXISTS crm_partage boolean NOT NULL DEFAULT false;

-- Établissements dont l'utilisateur voit le CRM au niveau demandé : ceux où
-- son rôle a le droit 'crm', plus les autres établissements de leur groupe
-- quand le groupe partage son CRM.
CREATE OR REPLACE FUNCTION public.my_crm_client_ids(p_niveau text)
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with miens as (
    select public.my_client_ids_for('crm', p_niveau) as id
  )
  select id from miens
  union
  select autre.id
  from miens
  join public.clients c on c.id = miens.id
  join public.groupes g on g.id = c.groupe_id and g.crm_partage
  join public.clients autre on autre.groupe_id = g.id;
$function$;

-- Périmètre CRM vu depuis un établissement (pour filtrer les listes) : tout
-- le groupe si son CRM est partagé, sinon l'établissement seul. Vide si
-- l'appelant n'a pas accès au CRM de cet établissement.
CREATE OR REPLACE FUNCTION public.crm_perimetre(p_client_id uuid)
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with autorise as (
    select 1
    where coalesce(public.get_my_is_superadmin(), false)
       or p_client_id in (select public.my_crm_client_ids('lecture'))
  )
  select p_client_id from autorise
  union
  select autre.id
  from autorise, public.clients c
  join public.groupes g on g.id = c.groupe_id and g.crm_partage
  join public.clients autre on autre.groupe_id = g.id
  where c.id = p_client_id;
$function$;

REVOKE EXECUTE ON FUNCTION public.my_crm_client_ids(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.crm_perimetre(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_crm_client_ids(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crm_perimetre(uuid) TO authenticated, service_role;

-- Policies CRM : my_client_ids_for('crm', …) → my_crm_client_ids(…).
-- Mêmes règles qu'avant (20261018170000) hors partage de groupe.
DO $migration$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['crm_clients', 'crm_evenements', 'crm_devis', 'crm_devis_lignes'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_select', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_insert', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_update', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_delete', t);
    EXECUTE format($p$CREATE POLICY %I ON public.%I FOR SELECT TO authenticated
      USING (((SELECT public.get_my_is_superadmin()) IS TRUE)
             OR client_id IN (SELECT public.my_crm_client_ids('lecture')))$p$, t || '_select', t);
    EXECUTE format($p$CREATE POLICY %I ON public.%I FOR INSERT TO authenticated
      WITH CHECK (((SELECT public.get_my_is_superadmin()) IS TRUE)
             OR client_id IN (SELECT public.my_crm_client_ids('modification')))$p$, t || '_insert', t);
    EXECUTE format($p$CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated
      USING (((SELECT public.get_my_is_superadmin()) IS TRUE)
             OR client_id IN (SELECT public.my_crm_client_ids('modification')))
      WITH CHECK (((SELECT public.get_my_is_superadmin()) IS TRUE)
             OR client_id IN (SELECT public.my_crm_client_ids('modification')))$p$, t || '_update', t);
    EXECUTE format($p$CREATE POLICY %I ON public.%I FOR DELETE TO authenticated
      USING (((SELECT public.get_my_is_superadmin()) IS TRUE)
             OR client_id IN (SELECT public.my_crm_client_ids('modification')))$p$, t || '_delete', t);
  END LOOP;
END
$migration$;

DROP POLICY IF EXISTS crm_devis_revisions_select ON public.crm_devis_revisions;
CREATE POLICY crm_devis_revisions_select ON public.crm_devis_revisions FOR SELECT TO authenticated
  USING (((SELECT public.get_my_is_superadmin()) IS TRUE)
         OR client_id IN (SELECT public.my_crm_client_ids('lecture')));

-- Activités : modification/suppression réservées à leur auteur (inchangé).
DROP POLICY IF EXISTS crm_client_activities_select ON public.crm_client_activities;
DROP POLICY IF EXISTS crm_client_activities_insert ON public.crm_client_activities;
DROP POLICY IF EXISTS crm_client_activities_update ON public.crm_client_activities;
DROP POLICY IF EXISTS crm_client_activities_delete ON public.crm_client_activities;
CREATE POLICY crm_client_activities_select ON public.crm_client_activities FOR SELECT TO authenticated
  USING (((SELECT public.get_my_is_superadmin()) IS TRUE)
         OR client_id IN (SELECT public.my_crm_client_ids('lecture')));
CREATE POLICY crm_client_activities_insert ON public.crm_client_activities FOR INSERT TO authenticated
  WITH CHECK (((SELECT public.get_my_is_superadmin()) IS TRUE)
         OR client_id IN (SELECT public.my_crm_client_ids('modification')));
CREATE POLICY crm_client_activities_update ON public.crm_client_activities FOR UPDATE TO authenticated
  USING ((((SELECT public.get_my_is_superadmin()) IS TRUE)
          OR client_id IN (SELECT public.my_crm_client_ids('modification')))
         AND created_by = (SELECT auth.uid()))
  WITH CHECK (((SELECT public.get_my_is_superadmin()) IS TRUE)
         OR client_id IN (SELECT public.my_crm_client_ids('modification')));
CREATE POLICY crm_client_activities_delete ON public.crm_client_activities FOR DELETE TO authenticated
  USING ((((SELECT public.get_my_is_superadmin()) IS TRUE)
          OR client_id IN (SELECT public.my_crm_client_ids('modification')))
         AND created_by = (SELECT auth.uid()));

-- ─── 2. Lieux ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.crm_lieux (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  groupe_id   uuid REFERENCES public.groupes(id) ON DELETE CASCADE,
  client_id   uuid REFERENCES public.clients(id) ON DELETE CASCADE,
  nom         text NOT NULL CHECK (length(trim(nom)) > 0),
  actif       boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT crm_lieux_rattachement CHECK (groupe_id IS NOT NULL OR client_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS crm_lieux_groupe_idx ON public.crm_lieux (groupe_id);
CREATE INDEX IF NOT EXISTS crm_lieux_client_idx ON public.crm_lieux (client_id);

ALTER TABLE public.crm_lieux ENABLE ROW LEVEL SECURITY;

-- Lecture : lieux des établissements du périmètre CRM, ou de leur groupe.
DROP POLICY IF EXISTS crm_lieux_select ON public.crm_lieux;
CREATE POLICY crm_lieux_select ON public.crm_lieux FOR SELECT TO authenticated
  USING (
    ((SELECT public.get_my_is_superadmin()) IS TRUE)
    OR client_id IN (SELECT public.my_crm_client_ids('lecture'))
    OR groupe_id IN (
      SELECT c.groupe_id FROM public.clients c
      WHERE c.id IN (SELECT public.my_crm_client_ids('lecture'))
    )
  );

-- Écritures : superadmin uniquement (liste des lieux réglée à la mise en service).
DROP POLICY IF EXISTS crm_lieux_write ON public.crm_lieux;
CREATE POLICY crm_lieux_write ON public.crm_lieux FOR ALL TO authenticated
  USING ((SELECT public.get_my_is_superadmin()) IS TRUE)
  WITH CHECK ((SELECT public.get_my_is_superadmin()) IS TRUE);

REVOKE ALL ON public.crm_lieux FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_lieux TO authenticated;
GRANT ALL ON public.crm_lieux TO service_role;

-- ─── 3. Lieu + établissement qui encaisse, sur événements et devis ─────────
ALTER TABLE public.crm_evenements
  ADD COLUMN IF NOT EXISTS lieu_id uuid REFERENCES public.crm_lieux(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS etablissement_ca_id uuid REFERENCES public.clients(id) ON DELETE SET NULL;

ALTER TABLE public.crm_devis
  ADD COLUMN IF NOT EXISTS lieu_id uuid REFERENCES public.crm_lieux(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS etablissement_ca_id uuid REFERENCES public.clients(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS crm_evenements_lieu_idx ON public.crm_evenements (lieu_id);
CREATE INDEX IF NOT EXISTS crm_devis_lieu_idx ON public.crm_devis (lieu_id);
CREATE INDEX IF NOT EXISTS crm_evenements_etab_ca_idx ON public.crm_evenements (etablissement_ca_id);
CREATE INDEX IF NOT EXISTS crm_devis_etab_ca_idx ON public.crm_devis (etablissement_ca_id);

-- ─── 4. Rôle 'commercial' : défauts de la matrice (cf. lib/permissions.js) ──
CREATE OR REPLACE FUNCTION public.permission_defaut(p_fonctionnalite text, p_role text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select coalesce((
    select d.niveaux[array_position(array['admin', 'directeur', 'cuisine', 'bar', 'consultant', 'commercial'], p_role)]
    from (values
      ('fiches_cuisine', ARRAY['modification', 'lecture', 'modification', 'aucun', 'lecture', 'lecture']),
      ('fiches_bar', ARRAY['modification', 'lecture', 'aucun', 'modification', 'lecture', 'lecture']),
      ('couts_fiches', ARRAY['modification', 'lecture', 'aucun', 'aucun', 'lecture', 'aucun']),
      ('ingredients', ARRAY['modification', 'lecture', 'modification', 'modification', 'aucun', 'aucun']),
      ('menus_cartes', ARRAY['modification', 'modification', 'modification', 'modification', 'modification', 'lecture']),
      ('avis', ARRAY['modification', 'lecture', 'modification', 'lecture', 'lecture', 'lecture']),
      ('achats', ARRAY['modification', 'lecture', 'lecture', 'lecture', 'lecture', 'aucun']),
      ('fournisseurs', ARRAY['modification', 'lecture', 'lecture', 'lecture', 'lecture', 'aucun']),
      ('inventaire', ARRAY['modification', 'lecture', 'modification', 'modification', 'lecture', 'aucun']),
      ('food_cost', ARRAY['modification', 'modification', 'aucun', 'aucun', 'aucun', 'aucun']),
      ('analyses', ARRAY['modification', 'modification', 'aucun', 'aucun', 'aucun', 'aucun']),
      ('ventes', ARRAY['modification', 'modification', 'modification', 'modification', 'modification', 'aucun']),
      ('budgets', ARRAY['modification', 'modification', 'modification', 'modification', 'modification', 'aucun']),
      ('rapport_hebdo', ARRAY['modification', 'modification', 'aucun', 'aucun', 'aucun', 'aucun']),
      ('import_ventes', ARRAY['modification', 'aucun', 'aucun', 'aucun', 'aucun', 'aucun']),
      ('ecarts_conso', ARRAY['modification', 'lecture', 'lecture', 'lecture', 'lecture', 'aucun']),
      ('vue_groupe', ARRAY['modification', 'modification', 'aucun', 'aucun', 'aucun', 'aucun']),
      ('crm', ARRAY['modification', 'modification', 'aucun', 'aucun', 'aucun', 'modification']),
      ('administration', ARRAY['modification', 'aucun', 'aucun', 'aucun', 'aucun', 'aucun']),
      ('export_donnees', ARRAY['modification', 'modification', 'aucun', 'aucun', 'aucun', 'aucun'])
    ) as d(fonctionnalite, niveaux)
    where d.fonctionnalite = p_fonctionnalite
  ), 'aucun');
$function$;

-- Le rôle commercial peut recevoir des écarts dans la matrice des droits.
ALTER TABLE public.permissions_roles DROP CONSTRAINT IF EXISTS permissions_roles_role_check;
ALTER TABLE public.permissions_roles
  ADD CONSTRAINT permissions_roles_role_check
  CHECK (role IN ('admin', 'directeur', 'cuisine', 'bar', 'consultant', 'commercial'));
