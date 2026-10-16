-- Vue groupe : fournisseurs.
--
-- 1. groupe_prix_produits : ajoute le détail par fournisseur (nom saisi sur
--    la facture) pour chaque (établissement, ingrédient) — permet d'afficher
--    chez qui chaque établissement paie son prix.
-- 2. groupe_fournisseurs : montant HT et nombre de factures par
--    (établissement, fournisseur) sur la période, toutes sections, pour
--    repérer les fournisseurs communs (levier de négociation groupe).
--
-- Le rapprochement des noms de fournisseurs entre établissements (espaces,
-- accents, SAS/SARL…) se fait côté serveur (lib/services/groupe.service.ts).
-- SECURITY INVOKER, jsonb unique (pas de plafond 1000 lignes), comme
-- 20261016170000_groupe_prix_produits.sql.

CREATE OR REPLACE FUNCTION public.groupe_prix_produits(
  p_client_ids uuid[],
  p_debut date,
  p_fin date
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH lignes AS (
    SELECT l.client_id,
           i.id   AS ingredient_id,
           i.nom,
           i.unite,
           coalesce(nullif(trim(f.fournisseur), ''), '—') AS fournisseur,
           l.quantite * coalesce(nullif(i.conditionnement, 0), 1) AS qte,
           coalesce(l.montant_ht,
                    l.quantite * l.prix_unitaire_ht * (1 - coalesce(l.remise, 0) / 100)) AS montant,
           f.date_facture
    FROM public.achats_lignes l
    JOIN public.achats_factures f ON f.id = l.facture_id
    JOIN public.ingredients i ON i.id = l.ingredient_id AND i.client_id = l.client_id
    WHERE l.client_id = ANY (p_client_ids)
      AND f.date_facture BETWEEN p_debut AND p_fin
      AND f.deleted_at IS NULL
      AND coalesce(f.section, 'cuisine') = 'cuisine'
      AND f.statut <> 'avoir'
      AND coalesce(i.est_sous_fiche, false) = false
      AND l.quantite > 0
  ),
  par_fourn AS (
    SELECT client_id, ingredient_id, nom, unite, fournisseur,
           sum(qte) AS qte, sum(montant) AS montant, count(*) AS nb, max(date_facture) AS dernier
    FROM lignes
    GROUP BY client_id, ingredient_id, nom, unite, fournisseur
  ),
  agg AS (
    SELECT client_id, ingredient_id, nom, unite,
           sum(qte) AS qte, sum(montant) AS montant, sum(nb) AS nb, max(dernier) AS dernier,
           jsonb_agg(jsonb_build_object('fournisseur', fournisseur, 'qte', qte, 'montant', montant)
                     ORDER BY montant DESC) AS fournisseurs
    FROM par_fourn
    GROUP BY client_id, ingredient_id, nom, unite
    HAVING sum(qte) > 0 AND sum(montant) > 0
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'client_id', client_id,
           'ingredient_id', ingredient_id,
           'nom', nom,
           'unite', unite,
           'qte', qte,
           'montant', montant,
           'nb_achats', nb,
           'dernier_achat', dernier,
           'fournisseurs', fournisseurs
         )), '[]'::jsonb)
  FROM agg;
$function$;

CREATE OR REPLACE FUNCTION public.groupe_fournisseurs(
  p_client_ids uuid[],
  p_debut date,
  p_fin date
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'client_id', client_id,
           'fournisseur', fournisseur,
           'montant', montant,
           'nb_factures', nb,
           'dernier_achat', dernier
         )), '[]'::jsonb)
  FROM (
    SELECT f.client_id,
           coalesce(nullif(trim(f.fournisseur), ''), '—') AS fournisseur,
           sum(coalesce(f.total_ht, 0)) AS montant,
           count(*) FILTER (WHERE f.facture_consolidee_id IS NULL) AS nb,
           max(f.date_facture) AS dernier
    FROM public.achats_factures f
    WHERE f.client_id = ANY (p_client_ids)
      AND f.date_facture BETWEEN p_debut AND p_fin
      AND f.deleted_at IS NULL
    GROUP BY 1, 2
    HAVING sum(coalesce(f.total_ht, 0)) <> 0
  ) agg;
$function$;

REVOKE EXECUTE ON FUNCTION public.groupe_prix_produits(uuid[], date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.groupe_prix_produits(uuid[], date, date) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.groupe_fournisseurs(uuid[], date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.groupe_fournisseurs(uuid[], date, date) TO authenticated, service_role;
