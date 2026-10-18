-- Droits par établissement, phase 2 : la matrice Rôle × Fonctionnalité
-- (permissions_roles, cf. lib/permissions.js) appliquée dans les policies RLS.
--
-- Phase 1 (20261018150000_permissions_roles.sql) appliquait la matrice dans
-- l'interface et les routes API. Mais l'appli lit et écrit surtout en direct
-- (PostgREST, clé anon + JWT) : un utilisateur privé d'une fonctionnalité
-- pouvait encore lire ou modifier ses tables à la main. Désormais :
--   SELECT                   → niveau « lecture » au moins sur la fonctionnalité
--   INSERT / UPDATE / DELETE → niveau « modification »
--   superadmin               → toujours autorisé (comme avant)
--
-- Les défauts de la matrice sont dupliqués ici (permission_defaut) : SQL et
-- JS doivent rester identiques, ce que vérifie
-- lib/__tests__/permissionsSql.test.ts (il lit la dernière migration qui
-- définit permission_defaut). Ajouter une fonctionnalité ou changer un
-- défaut = modifier lib/permissions.js ET recréer permission_defaut dans
-- une nouvelle migration.
--
-- Motif « une fois par requête » (cf. 20260930120000_rls_initplan_perf.sql) :
-- les policies appellent `client_id IN (SELECT my_client_ids_for(f, n))`,
-- sous-requête indépendante de la ligne, calculée une fois (hashed SubPlan).
--
-- Ce que la migration ne couvre pas (inchangé) : profils, clients,
-- acces_clients, groupes, user_dashboard_preferences, permissions_roles et
-- les tables superadmin ; les fichiers Storage ; les fonctions SECURITY
-- DEFINER ; le niveau « couts_fiches » (des colonnes, pas des lignes) ;
-- « analyses », « ecarts_conso », « vue_groupe », « export_donnees » (pas de
-- table propre : ils lisent celles des autres fonctionnalités, ou passent
-- par l'API en service_role).

-- ── Défauts de la matrice (miroir de FONCTIONNALITES dans lib/permissions.js)
-- Ordre des niveaux : admin, directeur, cuisine, bar, consultant.
CREATE OR REPLACE FUNCTION public.permission_defaut(p_fonctionnalite text, p_role text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select coalesce((
    select d.niveaux[array_position(array['admin', 'directeur', 'cuisine', 'bar', 'consultant'], p_role)]
    from (values
      ('fiches_cuisine', ARRAY['modification', 'lecture', 'modification', 'aucun', 'lecture']),
      ('fiches_bar', ARRAY['modification', 'lecture', 'aucun', 'modification', 'lecture']),
      ('couts_fiches', ARRAY['modification', 'lecture', 'aucun', 'aucun', 'lecture']),
      ('ingredients', ARRAY['modification', 'lecture', 'modification', 'modification', 'aucun']),
      ('menus_cartes', ARRAY['modification', 'modification', 'modification', 'modification', 'modification']),
      ('avis', ARRAY['modification', 'lecture', 'modification', 'lecture', 'lecture']),
      ('achats', ARRAY['modification', 'lecture', 'lecture', 'lecture', 'lecture']),
      ('fournisseurs', ARRAY['modification', 'lecture', 'lecture', 'lecture', 'lecture']),
      ('inventaire', ARRAY['modification', 'lecture', 'modification', 'modification', 'lecture']),
      ('food_cost', ARRAY['modification', 'modification', 'aucun', 'aucun', 'aucun']),
      ('analyses', ARRAY['modification', 'modification', 'aucun', 'aucun', 'aucun']),
      ('ventes', ARRAY['modification', 'modification', 'modification', 'modification', 'modification']),
      ('budgets', ARRAY['modification', 'modification', 'modification', 'modification', 'modification']),
      ('rapport_hebdo', ARRAY['modification', 'modification', 'aucun', 'aucun', 'aucun']),
      ('import_ventes', ARRAY['modification', 'aucun', 'aucun', 'aucun', 'aucun']),
      ('ecarts_conso', ARRAY['modification', 'lecture', 'lecture', 'lecture', 'lecture']),
      ('vue_groupe', ARRAY['modification', 'modification', 'aucun', 'aucun', 'aucun']),
      ('crm', ARRAY['modification', 'modification', 'aucun', 'aucun', 'aucun']),
      ('administration', ARRAY['modification', 'aucun', 'aucun', 'aucun', 'aucun']),
      ('export_donnees', ARRAY['modification', 'modification', 'aucun', 'aucun', 'aucun'])
    ) as d(fonctionnalite, niveaux)
    where d.fonctionnalite = p_fonctionnalite
  ), 'aucun');
$function$;

-- Rang d'un niveau (miroir de RANG). Niveau requis inconnu → 99 (jamais
-- atteint), niveau détenu inconnu → 0, comme atteint() côté JS.
CREATE OR REPLACE FUNCTION public.permission_rang(p_niveau text, p_requis boolean DEFAULT false)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select case p_niveau
    when 'aucun' then 0
    when 'lecture' then 1
    when 'modification' then 2
    else case when p_requis then 99 else 0 end
  end;
$function$;

-- Établissements où l'utilisateur courant atteint `p_niveau` sur
-- `p_fonctionnalite` : écart stocké pour son rôle dans l'établissement,
-- sinon défaut (miroir de niveauEffectif). Hors branche superadmin, gérée
-- dans les policies comme pour my_client_ids().
CREATE OR REPLACE FUNCTION public.my_client_ids_for(p_fonctionnalite text, p_niveau text)
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select ac.client_id
  from public.acces_clients ac
  left join public.permissions_roles pr
    on pr.client_id = ac.client_id
   and pr.role = ac.role
   and pr.fonctionnalite = p_fonctionnalite
  where ac.user_id = auth.uid()
    and public.permission_rang(coalesce(pr.niveau, public.permission_defaut(p_fonctionnalite, ac.role)))
        >= public.permission_rang(p_niveau, true);
$function$;

REVOKE EXECUTE ON FUNCTION public.permission_defaut(text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.permission_rang(text, boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.my_client_ids_for(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.permission_defaut(text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.permission_rang(text, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.my_client_ids_for(text, text) TO authenticated, service_role;

-- ── Suppression d'un ingrédient : détacher l'historique ────────────────────
-- La page Ingrédients remet à NULL ingredient_id dans achats_lignes,
-- inventaire_lignes et fournisseur_mapping avant de supprimer. Avec la
-- matrice, un rôle cuisine (achats en lecture) ne peut plus modifier
-- achats_lignes : le détachement est fait ici, quel que soit le rôle (pas de
-- clé étrangère sur ces colonnes, rien d'autre ne l'empêcherait).
CREATE OR REPLACE FUNCTION public.ingredients_detacher_historique()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  update public.achats_lignes l set ingredient_id = null
    from supprimes s where l.ingredient_id = s.id and l.client_id = s.client_id;
  update public.inventaire_lignes l set ingredient_id = null
    from supprimes s where l.ingredient_id = s.id and l.client_id = s.client_id;
  update public.fournisseur_mapping m set ingredient_id = null
    from supprimes s where m.ingredient_id = s.id and m.client_id = s.client_id;
  return null;
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.ingredients_detacher_historique() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_ingredients_detacher_historique ON public.ingredients;
CREATE TRIGGER trg_ingredients_detacher_historique
  AFTER DELETE ON public.ingredients
  REFERENCING OLD TABLE AS supprimes
  FOR EACH STATEMENT EXECUTE FUNCTION public.ingredients_detacher_historique();

DROP TRIGGER IF EXISTS trg_ingredients_bar_detacher_historique ON public.ingredients_bar;
CREATE TRIGGER trg_ingredients_bar_detacher_historique
  AFTER DELETE ON public.ingredients_bar
  REFERENCING OLD TABLE AS supprimes
  FOR EACH STATEMENT EXECUTE FUNCTION public.ingredients_detacher_historique();

-- ── Policies ───────────────────────────────────────────────────────────────
-- Table → fonctionnalité(s). Pour chaque table listée, TOUTES les policies
-- existantes sont supprimées (y compris les doublons hérités du dashboard,
-- ex. « Autoriser lecture ventes ») puis recréées, une par commande.
--
--   lecture   fonctionnalités requises en lecture, « a|b » = l'une ou l'autre ;
--             '*' = tout membre de l'établissement (référentiels partagés) ;
--             NULL avec section = cloisonnement de section inchangé.
--   ecriture  fonctionnalités requises en modification (INSERT/UPDATE/DELETE).
--   cmds      commandes couvertes : s(elect) i(nsert) u(pdate) d(elete).
--   section   'cuisine' / 'bar' : l'écriture exige EN PLUS le cloisonnement
--             de section existant (my_writable_client_ids).
--   option    'auteur' : UPDATE/DELETE réservés à l'auteur (created_by) ;
--             'log'    : INSERT ouvert à tout membre (chaque action est
--                        journalisée, quel que soit le rôle).
CREATE TEMP TABLE _rls_matrice (tbl text, lecture text, ecriture text, cmds text, section text, option text);
INSERT INTO _rls_matrice VALUES
  -- Achats et factures
  ('achats_factures',          'achats',                  'achats',                     'siud', NULL, NULL),
  ('achats_lignes',            'achats',                  'achats',                     'siud', NULL, NULL),
  ('fournisseur_mapping',      'achats',                  'achats',                     'siud', NULL, NULL),
  ('transactions_api',         'achats',                  'achats',                     'si',   NULL, NULL),
  -- Fournisseurs (l'import de factures en crée aussi)
  ('fournisseurs',             'fournisseurs|achats',     'fournisseurs|achats',        'siud', NULL, NULL),
  -- Inventaires
  ('inventaires',              'inventaire',              'inventaire',                 'siud', NULL, NULL),
  ('inventaire_lignes',        'inventaire',              'inventaire',                 'siud', NULL, NULL),
  -- Fiches techniques cuisine / bar
  ('fiches',                   'fiches_cuisine',          'fiches_cuisine',             'siud', NULL, NULL),
  ('fiche_ingredients',        'fiches_cuisine',          'fiches_cuisine',             'siud', NULL, NULL),
  ('fiche_sections',           'fiches_cuisine',          'fiches_cuisine',             'siud', NULL, NULL),
  ('fiches_bar',               'fiches_bar',              'fiches_bar',                 'siud', NULL, NULL),
  ('fiche_bar_ingredients',    'fiches_bar',              'fiches_bar',                 'siud', NULL, NULL),
  -- Ingrédients : référentiel lu par les fiches, inventaires, achats,
  -- écarts… Lecture inchangée (cloisonnement de section). Écriture :
  -- section ET modification des ingrédients ou des fiches de la section
  -- (créer une fiche ou une sous-fiche crée l'ingrédient lié).
  ('ingredients',              NULL,                      'ingredients|fiches_cuisine', 'siud', 'cuisine', NULL),
  ('ingredients_bar',          NULL,                      'ingredients|fiches_bar',     'siud', 'bar', NULL),
  ('categories_ingredients',   '*',                       'ingredients|achats',         'siud', NULL, NULL),
  -- Paramètres de l'établissement (lus partout dans l'appli)
  ('categories_plats',         '*',                       'administration',             'siud', NULL, NULL),
  ('lieux',                    '*',                       'administration',             'siud', NULL, NULL),
  -- Menus et cartes
  ('menus',                    'menus_cartes',            'menus_cartes',               'siud', NULL, NULL),
  ('menu_fiches',              'menus_cartes',            'menus_cartes',               'siud', NULL, NULL),
  ('menus_bar',                'menus_cartes',            'menus_cartes',               'siud', NULL, NULL),
  ('menu_bar_fiches',          'menus_cartes',            'menus_cartes',               'siud', NULL, NULL),
  ('cartes',                   'menus_cartes',            'menus_cartes',               'siud', NULL, NULL),
  ('carte_sections',           'menus_cartes',            'menus_cartes',               'siud', NULL, NULL),
  ('carte_items',              'menus_cartes',            'menus_cartes',               'siud', NULL, NULL),
  -- Avis clients
  ('avis',                     'avis',                    'avis',                       'siud', NULL, NULL),
  -- Suivi du CA et saisie des ventes
  ('ca_journalier',            'ventes',                  'ventes',                     'siud', NULL, NULL),
  ('ca_offerts',               'ventes',                  'ventes',                     'siud', NULL, NULL),
  ('ca_budget_privatisations', 'ventes',                  'ventes',                     'siud', NULL, NULL),
  ('lieux_service',            '*',                       'ventes|budgets',             'siud', NULL, NULL),
  -- Ventes par plat importées de la caisse : lues comme le CA, écrites par
  -- l'import (qui passe en pratique par l'API en service_role).
  ('ventes_journalieres',      'ventes',                  'import_ventes',              'siud', NULL, NULL),
  ('mapping_ventes',           'import_ventes',           'import_ventes',              'siud', NULL, NULL),
  -- Budgets CA
  ('ca_budgets',               'budgets',                 'budgets',                    'siud', NULL, NULL),
  ('ca_budget_jours_override', 'budgets',                 'budgets',                    'siud', NULL, NULL),
  ('ca_budgets_audit',         'budgets',                 NULL,                         's',    NULL, NULL),
  ('ca_jours_fermes',          'ventes|budgets',          'budgets',                    'siud', NULL, NULL),
  ('ca_jours_fermes_hebdo',    'ventes|budgets',          'budgets',                    'siud', NULL, NULL),
  -- Rapport hebdomadaire
  ('ca_rapports_hebdo',        'rapport_hebdo',           'rapport_hebdo',              'siud', NULL, NULL),
  ('ca_articles',              'rapport_hebdo',           'rapport_hebdo',              'siud', NULL, NULL),
  -- Food cost
  ('food_cost_rapports',       'food_cost',               'food_cost',                  'siud', NULL, NULL),
  ('food_cost_ajustements',    'food_cost',               'food_cost',                  'siud', NULL, NULL),
  -- CRM traiteur
  ('crm_clients',              'crm',                     'crm',                        'siud', NULL, NULL),
  ('crm_evenements',           'crm',                     'crm',                        'siud', NULL, NULL),
  ('crm_devis',                'crm',                     'crm',                        'siud', NULL, NULL),
  ('crm_devis_lignes',         'crm',                     'crm',                        'siud', NULL, NULL),
  ('crm_devis_revisions',      'crm',                     NULL,                         's',    NULL, NULL),
  ('crm_client_activities',    'crm',                     'crm',                        'siud', NULL, 'auteur'),
  -- Journal d'activité (Utilisateurs et paramètres)
  ('logs',                     'administration',          'administration',             'siud', NULL, 'log');

DO $migration$
DECLARE
  sa constant text := '((SELECT public.get_my_is_superadmin()) IS TRUE)';
  membre constant text := '(client_id IN (SELECT public.my_client_ids()))';
  m record;
  p record;
  c text;
  lire text;
  ecrire text;
  expr_using text;
  expr_check text;
BEGIN
  FOR m IN SELECT * FROM _rls_matrice LOOP
    -- « a|b » → (client_id IN (… 'a' …)) OR (client_id IN (… 'b' …))
    SELECT '(' || string_agg(format('(client_id IN (SELECT public.my_client_ids_for(%L, %L)))', f, 'lecture'), ' OR ') || ')'
      INTO lire FROM unnest(string_to_array(m.lecture, '|')) AS f;
    SELECT '(' || string_agg(format('(client_id IN (SELECT public.my_client_ids_for(%L, %L)))', f, 'modification'), ' OR ') || ')'
      INTO ecrire FROM unnest(string_to_array(m.ecriture, '|')) AS f;

    IF m.lecture = '*' THEN
      lire := membre;
    ELSIF m.lecture IS NULL THEN
      lire := format('(client_id IN (SELECT public.my_readable_client_ids(%L)))', m.section);
    END IF;
    IF m.section IS NOT NULL THEN
      ecrire := format('((client_id IN (SELECT public.my_writable_client_ids(%L))) AND %s)', m.section, ecrire);
    END IF;

    FOR p IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = m.tbl LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, m.tbl);
    END LOOP;

    FOREACH c IN ARRAY string_to_array(m.cmds, NULL) LOOP
      expr_using := format('(%s OR %s)', sa, CASE c WHEN 's' THEN lire ELSE ecrire END);
      expr_check := format('(%s OR %s)', sa, CASE WHEN c = 'i' AND m.option = 'log' THEN membre ELSE ecrire END);
      IF m.option = 'auteur' AND c IN ('u', 'd') THEN
        expr_using := format('(%s AND (created_by = (SELECT auth.uid())))', expr_using);
      END IF;

      EXECUTE format('CREATE POLICY %I ON public.%I FOR %s TO authenticated%s%s',
        m.tbl || '_' || CASE c WHEN 's' THEN 'select' WHEN 'i' THEN 'insert' WHEN 'u' THEN 'update' ELSE 'delete' END,
        m.tbl,
        CASE c WHEN 's' THEN 'SELECT' WHEN 'i' THEN 'INSERT' WHEN 'u' THEN 'UPDATE' ELSE 'DELETE' END,
        CASE WHEN c IN ('s', 'u', 'd') THEN ' USING ' || expr_using ELSE '' END,
        CASE WHEN c IN ('i', 'u') THEN ' WITH CHECK ' || expr_check ELSE '' END);
    END LOOP;
  END LOOP;
END
$migration$;

DROP TABLE _rls_matrice;
