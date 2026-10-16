-- Vue groupe, étape 2 : indicateurs agrégés par établissement, calculés en
-- base (une ligne par établissement, pas de plafond PostgREST de 1000 lignes).
--
-- Montants bruts (CA TTC par taux, achats HT par section, dernier stock
-- validé) : la conversion HT et les ratios se font côté serveur
-- (lib/services/groupe.service.ts), avec les mêmes constantes TVA que
-- lib/caAnalyses.js.
--
-- SECURITY INVOKER : appelée avec un client utilisateur, les policies RLS des
-- tables s'appliquent. La route /api/groupe/synthese l'appelle avec le
-- service_role APRÈS avoir restreint p_client_ids aux établissements
-- accessibles à l'utilisateur.
--
-- Achats : même règle que computeAchatsHt (foodCost.service.ts) — factures,
-- BL et avoirs non supprimés ; les BL fusionnés sont remis à 0 HT lors de la
-- fusion, donc pas de double compte.

CREATE OR REPLACE FUNCTION public.groupe_indicateurs(
  p_client_ids uuid[],
  p_debut date,
  p_fin date
)
RETURNS TABLE (
  client_id         uuid,
  ca_food_ttc       numeric,
  ca_bev_20_ttc     numeric,
  ca_bev_10_ttc     numeric,
  ca_autre_ttc      numeric,
  couverts          bigint,
  achats_cuisine_ht numeric,
  achats_bar_ht     numeric,
  nb_factures       bigint,
  stock_cuisine_ht  numeric,
  stock_cuisine_date date,
  stock_bar_ht      numeric,
  stock_bar_date    date
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH ids AS (
    SELECT DISTINCT unnest(p_client_ids) AS id
  ),
  ca AS (
    SELECT j.client_id,
           sum(coalesce(j.ca_food, 0))    AS food,
           sum(coalesce(j.ca_bev_20, 0))  AS bev20,
           sum(coalesce(j.ca_bev_10, 0))  AS bev10,
           sum(coalesce(j.ca_autre, 0))   AS autre,
           sum(coalesce(j.couverts, 0))::bigint AS couverts
    FROM public.ca_journalier j
    WHERE j.client_id = ANY (p_client_ids)
      AND j.jour BETWEEN p_debut AND p_fin
    GROUP BY j.client_id
  ),
  ach AS (
    SELECT f.client_id,
           sum(coalesce(f.total_ht, 0)) FILTER (WHERE coalesce(f.section, 'cuisine') = 'cuisine') AS cuisine,
           sum(coalesce(f.total_ht, 0)) FILTER (WHERE f.section = 'bar') AS bar,
           count(*) FILTER (WHERE f.facture_consolidee_id IS NULL) AS nb
    FROM public.achats_factures f
    WHERE f.client_id = ANY (p_client_ids)
      AND f.date_facture BETWEEN p_debut AND p_fin
      AND f.deleted_at IS NULL
    GROUP BY f.client_id
  ),
  -- Dernier inventaire validé à la fin de la période, par section.
  stock AS (
    SELECT DISTINCT ON (i.client_id, i.section)
           i.client_id, i.section, i.date_inventaire, t.valeur_stock
    FROM public.inventaires i
    JOIN public.inventaire_totaux t ON t.inventaire_id = i.id
    WHERE i.client_id = ANY (p_client_ids)
      AND i.statut = 'valide'
      AND i.date_inventaire <= p_fin
    ORDER BY i.client_id, i.section, i.date_inventaire DESC
  )
  SELECT ids.id,
         coalesce(ca.food, 0), coalesce(ca.bev20, 0), coalesce(ca.bev10, 0), coalesce(ca.autre, 0),
         coalesce(ca.couverts, 0),
         coalesce(ach.cuisine, 0), coalesce(ach.bar, 0), coalesce(ach.nb, 0),
         sc.valeur_stock, sc.date_inventaire,
         sb.valeur_stock, sb.date_inventaire
  FROM ids
  LEFT JOIN ca  ON ca.client_id  = ids.id
  LEFT JOIN ach ON ach.client_id = ids.id
  LEFT JOIN stock sc ON sc.client_id = ids.id AND sc.section = 'cuisine'
  LEFT JOIN stock sb ON sb.client_id = ids.id AND sb.section = 'bar';
$function$;

REVOKE EXECUTE ON FUNCTION public.groupe_indicateurs(uuid[], date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.groupe_indicateurs(uuid[], date, date) TO authenticated, service_role;
