-- Réquisitions, étape 1 : rôle « service » et fonctionnalités de la matrice.
--
-- Nouveau rôle « service » : personnel d'un service interne (étages, room
-- service, spa…) qui passe des réquisitions. Par défaut il n'a accès qu'aux
-- réquisitions (fonctionnalité « requisitions » en modification) ; tout le
-- reste est à « aucun », modifiable par établissement dans la matrice.
--
-- Deux fonctionnalités ajoutées (miroir de lib/permissions.js) :
--   requisitions           demandes, préparation, livraison, sorties
--   requisitions_analyses  consommation par service
-- Aucune table n'est encore rattachée à ces fonctionnalités : les tables des
-- réquisitions arrivent avec les étapes suivantes.
--
-- Ce que voit un rôle « service » côté RLS, sans changement ici :
--   * les référentiels lus par tout membre ('*' dans la matrice) :
--     categories_plats, categories_ingredients, lieux, lieux_service ;
--   * pas les ingrédients : my_readable_client_ids / my_writable_client_ids
--     ne retiennent que admin, directeur et le rôle de la section.
-- acces_clients n'a pas de contrainte sur role (vérifié en prod le
-- 2026-10-19) : rien à modifier de ce côté.

-- ── Rôles autorisés dans les écarts de la matrice
ALTER TABLE public.permissions_roles DROP CONSTRAINT IF EXISTS permissions_roles_role_check;
ALTER TABLE public.permissions_roles ADD CONSTRAINT permissions_roles_role_check
  CHECK (role IN ('admin', 'directeur', 'cuisine', 'bar', 'consultant', 'service'));

-- ── Défauts de la matrice (miroir de FONCTIONNALITES dans lib/permissions.js)
-- Ordre des niveaux : admin, directeur, cuisine, bar, consultant, service.
CREATE OR REPLACE FUNCTION public.permission_defaut(p_fonctionnalite text, p_role text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select coalesce((
    select d.niveaux[array_position(array['admin', 'directeur', 'cuisine', 'bar', 'consultant', 'service'], p_role)]
    from (values
      ('fiches_cuisine', ARRAY['modification', 'lecture', 'modification', 'aucun', 'lecture', 'aucun']),
      ('fiches_bar', ARRAY['modification', 'lecture', 'aucun', 'modification', 'lecture', 'aucun']),
      ('couts_fiches', ARRAY['modification', 'lecture', 'aucun', 'aucun', 'lecture', 'aucun']),
      ('ingredients', ARRAY['modification', 'lecture', 'modification', 'modification', 'aucun', 'aucun']),
      ('menus_cartes', ARRAY['modification', 'modification', 'modification', 'modification', 'modification', 'aucun']),
      ('avis', ARRAY['modification', 'lecture', 'modification', 'lecture', 'lecture', 'aucun']),
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
      ('requisitions', ARRAY['modification', 'modification', 'modification', 'modification', 'lecture', 'modification']),
      ('requisitions_analyses', ARRAY['modification', 'modification', 'aucun', 'aucun', 'lecture', 'aucun']),
      ('crm', ARRAY['modification', 'modification', 'aucun', 'aucun', 'aucun', 'aucun']),
      ('administration', ARRAY['modification', 'aucun', 'aucun', 'aucun', 'aucun', 'aucun']),
      ('export_donnees', ARRAY['modification', 'modification', 'aucun', 'aucun', 'aucun', 'aucun'])
    ) as d(fonctionnalite, niveaux)
    where d.fonctionnalite = p_fonctionnalite
  ), 'aucun');
$function$;

REVOKE EXECUTE ON FUNCTION public.permission_defaut(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.permission_defaut(text, text) TO authenticated, service_role;
