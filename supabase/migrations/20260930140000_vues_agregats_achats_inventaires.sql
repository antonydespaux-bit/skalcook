-- Agrégats calculés en base pour les listes achats / inventaires.
--
-- Les pages rapatriaient toutes les lignes (5 000 lignes d'achats, 11 400
-- lignes d'inventaire chez un gros client) juste pour compter et sommer
-- côté navigateur. Côté achats, la requête n'était pas paginée : au-delà du
-- plafond PostgREST (1000 lignes) les comptes et la TVA calculée étaient
-- faux, et le `.in('facture_id', [1000+ uuids])` gonflait l'URL.
--
-- security_invoker = true : la vue s'exécute avec les droits de l'appelant,
-- donc les policies RLS des tables sous-jacentes s'appliquent.

CREATE OR REPLACE VIEW public.inventaire_totaux
WITH (security_invoker = true) AS
SELECT
  l.inventaire_id,
  l.client_id,
  count(*)::int AS nb_lignes,
  coalesce(sum(l.valeur_stock), 0) AS valeur_stock
FROM public.inventaire_lignes l
GROUP BY l.inventaire_id, l.client_id;

-- TVA calculée = Σ montant_ht × taux (taux de la ligne, sinon taux global
-- de la facture, sinon 0) — même règle que l'ancien calcul client-side.
CREATE OR REPLACE VIEW public.achats_factures_stats
WITH (security_invoker = true) AS
SELECT
  l.facture_id,
  l.client_id,
  count(*)::int AS nb_lignes,
  coalesce(sum(coalesce(l.montant_ht, 0) * coalesce(l.taux_tva, f.taux_tva, 0) / 100), 0) AS tva_calculee
FROM public.achats_lignes l
JOIN public.achats_factures f ON f.id = l.facture_id
GROUP BY l.facture_id, l.client_id;

REVOKE ALL ON public.inventaire_totaux, public.achats_factures_stats FROM anon;
GRANT SELECT ON public.inventaire_totaux, public.achats_factures_stats TO authenticated, service_role;
