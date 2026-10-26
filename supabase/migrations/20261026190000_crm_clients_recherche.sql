-- Liste des clients CRM filtrée, triée et paginée côté base (≈ 40 000 fiches
-- après l'import TheFork : impossible à charger en entier dans le navigateur,
-- PostgREST plafonne d'ailleurs à 1 000 lignes).
--
-- Statistiques de visites calculées sur crm_reservations, mêmes règles que
-- lib/crmVisites.js : une visite = repas passé, ni annulé, ni refusé, ni « non
-- venu » ; VIP = VIP TheFork ou p_vip_visites visites sur p_vip_mois mois ;
-- à relancer (perdu) = déjà venu, plus revenu depuis p_perdu_mois mois et
-- aucune réservation à venir.
--
-- SECURITY INVOKER : les policies RLS du CRM (périmètre du groupe) s'appliquent.
-- Chaque ligne porte `total` (nombre de lignes avant pagination).

CREATE OR REPLACE FUNCTION public.crm_clients_recherche(
  p_ids uuid[],
  p_recherche text DEFAULT NULL,
  p_maisons uuid[] DEFAULT NULL,
  p_type text DEFAULT NULL,
  p_vip boolean DEFAULT NULL,
  p_perdu boolean DEFAULT NULL,
  p_contactable boolean DEFAULT NULL,
  p_prescripteur boolean DEFAULT NULL,
  p_tag text DEFAULT NULL,
  p_vip_visites integer DEFAULT 5,
  p_vip_mois integer DEFAULT 12,
  p_perdu_mois integer DEFAULT 6,
  p_tri text DEFAULT 'creation',
  p_desc boolean DEFAULT true,
  p_limit integer DEFAULT 100,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid, client_id uuid, type text, nom text, prenom text, raison_sociale text,
  email text, telephone text, adresse text, code_postal text, ville text, tags text[],
  source text, langue text, vip_thefork boolean, contactable boolean, desinscrit_at timestamptz,
  prescripteur boolean, rang text, preferences text, champs_thefork jsonb, created_at timestamptz,
  visites bigint, visites_periode bigint, derniere_visite timestamptz, prochaine_reservation timestamptz,
  vip boolean, perdu boolean, total bigint
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- Requête dynamique : planifiée à chaque appel avec les vraies valeurs des
  -- filtres. Une fonction SQL appelée par PostgREST (arguments liés) était
  -- planifiée à l'aveugle : ≈ 5 s au lieu de ≈ 50 ms.
  RETURN QUERY EXECUTE $q$
WITH base AS (
    SELECT c.*
    FROM public.crm_clients c
    WHERE c.client_id = ANY ($1)
      AND ($3 IS NULL OR c.client_id = ANY ($3))
      AND ($4 IS NULL OR c.type = $4)
      AND ($8 IS NULL OR c.prescripteur = $8)
      AND ($9 IS NULL OR $9 = ANY (c.tags))
      AND ($7 IS NULL
           OR ((c.desinscrit_at IS NULL AND (c.contactable OR c.type = 'entreprise')) = $7))
      AND ($2 IS NULL OR concat_ws(' ', c.nom, c.prenom, c.raison_sociale, c.email, c.telephone, c.ville)
           ILIKE '%' || $2 || '%')
  ),
  resas AS (
    SELECT r.crm_client_id, r.date_repas,
           upper(coalesce(r.statut, '')) NOT IN ('CANCELED', 'CANCELLED', 'NO_SHOW', 'NOSHOW', 'REFUSED', 'REJECTED') AS venu
    FROM public.crm_reservations r
    WHERE r.crm_client_id IN (SELECT b.id FROM base b) AND r.date_repas IS NOT NULL
  ),
  stats AS (
    SELECT crm_client_id,
           count(*) FILTER (WHERE venu AND date_repas <= now()) AS visites,
           count(*) FILTER (WHERE venu AND date_repas <= now()
                            AND date_repas >= now() - make_interval(months => $11)) AS visites_periode,
           max(date_repas) FILTER (WHERE venu AND date_repas <= now()) AS derniere,
           min(date_repas) FILTER (WHERE venu AND date_repas > now()) AS prochaine
    FROM resas GROUP BY crm_client_id
  ),
  res AS (
    SELECT b.id, b.client_id, b.type, b.nom, b.prenom, b.raison_sociale, b.email, b.telephone,
           b.adresse, b.code_postal, b.ville, b.tags, b.source, b.langue, b.vip_thefork, b.contactable,
           b.desinscrit_at, b.prescripteur, b.rang, b.preferences, b.champs_thefork, b.created_at,
           coalesce(s.visites, 0) AS visites,
           coalesce(s.visites_periode, 0) AS visites_periode,
           s.derniere AS derniere_visite,
           s.prochaine AS prochaine_reservation,
           (b.vip_thefork OR coalesce(s.visites_periode, 0) >= $10) AS vip,
           (s.derniere IS NOT NULL AND s.derniere < now() - make_interval(months => $12)
            AND s.prochaine IS NULL) AS perdu
    FROM base b LEFT JOIN stats s ON s.crm_client_id = b.id
  )
  SELECT res.*, count(*) OVER () AS total
  FROM res
  WHERE ($5 IS NULL OR res.vip = $5)
    AND ($6 IS NULL OR res.perdu = $6)
  ORDER BY
    CASE WHEN $13 = 'nom' AND NOT $14 THEN lower(coalesce(nullif(res.nom, ''), res.raison_sociale)) END ASC NULLS LAST,
    CASE WHEN $13 = 'nom' AND $14 THEN lower(coalesce(nullif(res.nom, ''), res.raison_sociale)) END DESC NULLS LAST,
    CASE WHEN $13 = 'derniere_visite' AND NOT $14 THEN res.derniere_visite END ASC NULLS LAST,
    CASE WHEN $13 = 'derniere_visite' AND $14 THEN res.derniere_visite END DESC NULLS LAST,
    CASE WHEN $13 = 'visites' AND NOT $14 THEN res.visites END ASC,
    CASE WHEN $13 = 'visites' AND $14 THEN res.visites END DESC,
    CASE WHEN $13 = 'prochaine' THEN res.prochaine_reservation END ASC NULLS LAST,
    CASE WHEN NOT $14 THEN res.created_at END ASC,
    res.created_at DESC, res.id
  LIMIT greatest(least($15, 1000), 1) OFFSET greatest($16, 0)
  $q$
  USING p_ids, p_recherche, p_maisons, p_type, p_vip, p_perdu, p_contactable, p_prescripteur, p_tag, p_vip_visites, p_vip_mois, p_perdu_mois, p_tri, p_desc, p_limit, p_offset;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.crm_clients_recherche(uuid[], text, uuid[], text, boolean, boolean, boolean, boolean, text, integer, integer, integer, text, boolean, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_clients_recherche(uuid[], text, uuid[], text, boolean, boolean, boolean, boolean, text, integer, integer, integer, text, boolean, integer, integer) TO authenticated, service_role;

