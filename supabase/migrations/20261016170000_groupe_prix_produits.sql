-- Vue groupe, étape 4 : prix d'achat par ingrédient et par établissement,
-- pour comparer un même produit entre les établissements d'un groupe.
--
-- Une entrée par (établissement, ingrédient cuisine) acheté sur la période :
--   qte     = Σ quantité × conditionnement (en unité d'utilisation de l'ingrédient)
--   montant = Σ montant HT de la ligne (sinon quantité × prix × (1 − remise))
-- Le prix moyen pondéré = montant / qte, dans l'unité de l'ingrédient
-- (invariant : la ligne porte le prix du conditionnement entier, cf.
-- 20260615 conditionnement). Le rapprochement entre établissements (nom
-- normalisé + unité) se fait côté serveur (lib/services/groupe.service.ts).
--
-- Renvoie un seul jsonb (pas de plafond PostgREST de 1000 lignes).
-- SECURITY INVOKER : RLS appliquée si appelée par un utilisateur ; la route
-- l'appelle en service_role avec des p_client_ids déjà filtrés.

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
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'client_id', client_id,
           'ingredient_id', ingredient_id,
           'nom', nom,
           'unite', unite,
           'qte', qte,
           'montant', montant,
           'nb_achats', nb,
           'dernier_achat', dernier
         )), '[]'::jsonb)
  FROM (
    SELECT client_id, ingredient_id, nom, unite,
           sum(qte) AS qte, sum(montant) AS montant, count(*) AS nb, max(date_facture) AS dernier
    FROM lignes
    GROUP BY client_id, ingredient_id, nom, unite
    HAVING sum(qte) > 0 AND sum(montant) > 0
  ) agg;
$function$;

REVOKE EXECUTE ON FUNCTION public.groupe_prix_produits(uuid[], date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.groupe_prix_produits(uuid[], date, date) TO authenticated, service_role;
