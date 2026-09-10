-- Passe check_ingredient_quota_per_client() en SECURITY DEFINER.
--
-- Le trigger BEFORE INSERT sur ingredients / ingredients_bar exécutait son
-- SELECT COUNT(*) en SECURITY INVOKER, donc filtré par les RLS de la table :
-- la policy SELECT user_can_read_section (→ get_my_is_superadmin) était
-- réévaluée par ligne comptée, pour chaque ligne insérée. Sur un import Excel
-- par lots de 200 lignes chez un gros client (>1800 ingrédients), cela faisait
-- ~200 × 1800 évaluations de policy et dépassait le statement_timeout (8s) :
-- HTTP 500 côté PostgREST → import entièrement en erreur (0 traité).
--
-- En SECURITY DEFINER, le COUNT s'exécute en tant que propriétaire (postgres),
-- bypasse les RLS (~0,7 ms via idx_ingredients_client_id) — comportement
-- attendu d'un contrôle de quota, qui doit compter TOUTES les lignes du client.
CREATE OR REPLACE FUNCTION public.check_ingredient_quota_per_client()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    current_count INTEGER;
BEGIN
    -- TG_TABLE_NAME = ingredients ou ingredients_bar (trigger partagé).
    EXECUTE format('SELECT COUNT(*) FROM %I WHERE client_id = $1', TG_TABLE_NAME)
    INTO current_count
    USING NEW.client_id;

    IF current_count >= 5000 THEN
        RAISE EXCEPTION 'Quota atteint : Cet établissement possède déjà 5000 lignes dans cette catégorie.';
    END IF;

    RETURN NEW;
END;
$function$;
