-- Réquisitions, étape 4 : les bons de réquisition et leurs lignes.
--
-- Une réquisition est une commande interne d'un service demandeur à un
-- service préparateur (Étages → Cuisine, Bar → Économat…). Les produits
-- viennent du stock du préparateur, figé sur le bon à la création :
--   cuisine  → ingredients        bar → ingredients_bar
--   articles → articles (catalogue du service préparateur)
--
-- Cycle de vie (statut) :
--   a_valider       envoyée, attend le responsable du service demandeur
--                   (si clients.requisitions_validation)
--   a_preparer      envoyée (ou validée), attend le préparateur
--   en_preparation  prise en charge par le préparateur
--   livree          livrée : quantités et prix figés, sortie de stock
--   refusee         refusée par le valideur ou le préparateur
--   annulee         annulée par le demandeur avant livraison
-- type « sortie_directe » : sortie de stock sans commande, saisie par le
-- préparateur (étape 6).
--
-- Écriture : uniquement via /api/requisitions* (service_role) et la fonction
-- requisition_creer (atomique). Aucune policy INSERT/UPDATE/DELETE : l'accès
-- direct PostgREST est en lecture seule.
-- Lecture (motif « une fois par requête ») : « requisitions » en lecture ET
-- (membre du service demandeur ou préparateur, ou « requisitions_analyses »
-- en lecture, ou « administration » en lecture).

CREATE TABLE IF NOT EXISTS public.requisitions (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id               uuid        NOT NULL REFERENCES public.clients (id) ON DELETE CASCADE,
  numero                  integer     NOT NULL,
  type                    text        NOT NULL DEFAULT 'demande'
                                      CHECK (type IN ('demande', 'sortie_directe')),
  statut                  text        NOT NULL
                                      CHECK (statut IN ('a_valider', 'a_preparer', 'en_preparation', 'livree', 'refusee', 'annulee')),
  service_demandeur_id    uuid        NOT NULL,
  service_preparateur_id  uuid        NOT NULL,
  stock                   text        NOT NULL CHECK (stock IN ('cuisine', 'bar', 'articles')),
  demandeur_id            uuid        REFERENCES auth.users (id) ON DELETE SET NULL,
  date_souhaitee          date,
  commentaire             text        CHECK (commentaire IS NULL OR length(commentaire) <= 1000),
  envoyee_at              timestamptz NOT NULL DEFAULT now(),
  valideur_id             uuid        REFERENCES auth.users (id) ON DELETE SET NULL,
  validee_at              timestamptz,
  preparateur_id          uuid        REFERENCES auth.users (id) ON DELETE SET NULL,
  prise_en_charge_at      timestamptz,
  livree_at               timestamptz,
  refusee_par             uuid        REFERENCES auth.users (id) ON DELETE SET NULL,
  refusee_at              timestamptz,
  motif_refus             text        CHECK (motif_refus IS NULL OR length(motif_refus) <= 500),
  annulee_at              timestamptz,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT requisitions_numero_key UNIQUE (client_id, numero),
  CONSTRAINT requisitions_id_client_key UNIQUE (id, client_id),
  CONSTRAINT requisitions_services_distincts CHECK (service_demandeur_id <> service_preparateur_id),
  -- Un service ne peut pas être supprimé s'il a des réquisitions : on le désactive.
  CONSTRAINT requisitions_demandeur_fkey FOREIGN KEY (service_demandeur_id, client_id)
    REFERENCES public.services_internes (id, client_id) ON DELETE RESTRICT,
  CONSTRAINT requisitions_preparateur_fkey FOREIGN KEY (service_preparateur_id, client_id)
    REFERENCES public.services_internes (id, client_id) ON DELETE RESTRICT
);

COMMENT ON TABLE public.requisitions IS
  'Bons de réquisition : commandes internes entre services (et sorties directes de stock).';

CREATE INDEX IF NOT EXISTS requisitions_client_statut_idx
  ON public.requisitions (client_id, statut, envoyee_at DESC);
CREATE INDEX IF NOT EXISTS requisitions_demandeur_idx
  ON public.requisitions (service_demandeur_id, envoyee_at DESC);
CREATE INDEX IF NOT EXISTS requisitions_preparateur_idx
  ON public.requisitions (service_preparateur_id, statut);

CREATE TABLE IF NOT EXISTS public.requisition_lignes (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  requisition_id           uuid        NOT NULL,
  client_id                uuid        NOT NULL REFERENCES public.clients (id) ON DELETE CASCADE,
  ordre                    integer     NOT NULL DEFAULT 0,
  -- Produit : un ingrédient (cuisine/bar, sans clé étrangère comme
  -- inventaire_lignes) ou un article du catalogue. Nom et unité figés.
  ingredient_id            uuid,
  article_id               uuid        REFERENCES public.articles (id) ON DELETE RESTRICT,
  nom                      text        NOT NULL CHECK (length(btrim(nom)) BETWEEN 1 AND 200),
  unite                    text        NOT NULL CHECK (length(btrim(unite)) BETWEEN 1 AND 20),
  quantite_demandee        numeric(12, 3) CHECK (quantite_demandee IS NULL OR quantite_demandee > 0),
  quantite_livree          numeric(12, 3) CHECK (quantite_livree IS NULL OR quantite_livree >= 0),
  -- Prix unitaire HT figé à la livraison (étape 6).
  prix_unitaire            numeric(12, 4) CHECK (prix_unitaire IS NULL OR prix_unitaire >= 0),
  valeur                   numeric     GENERATED ALWAYS AS (coalesce(quantite_livree, 0) * coalesce(prix_unitaire, 0)) STORED,
  ajoutee_par_preparateur  boolean     NOT NULL DEFAULT false,
  commentaire              text        CHECK (commentaire IS NULL OR length(commentaire) <= 300),
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT requisition_lignes_requisition_fkey FOREIGN KEY (requisition_id, client_id)
    REFERENCES public.requisitions (id, client_id) ON DELETE CASCADE,
  CONSTRAINT requisition_lignes_un_produit CHECK ((ingredient_id IS NULL) <> (article_id IS NULL)),
  -- Une ligne demandée a une quantité ; une ligne ajoutée par le préparateur
  -- (produit sorti « à la voix ») peut n'avoir que la quantité livrée.
  CONSTRAINT requisition_lignes_quantite CHECK (quantite_demandee IS NOT NULL OR ajoutee_par_preparateur)
);

COMMENT ON TABLE public.requisition_lignes IS
  'Lignes d''une réquisition : produit (ingrédient ou article), quantités demandée et livrée, prix HT figé à la livraison.';

CREATE INDEX IF NOT EXISTS requisition_lignes_requisition_idx
  ON public.requisition_lignes (requisition_id, ordre);
CREATE INDEX IF NOT EXISTS requisition_lignes_ingredient_idx
  ON public.requisition_lignes (client_id, ingredient_id) WHERE ingredient_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS requisition_lignes_article_idx
  ON public.requisition_lignes (article_id) WHERE article_id IS NOT NULL;

-- ── updated_at ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.requisitions_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  new.updated_at := now();
  return new;
end;
$function$;

DROP TRIGGER IF EXISTS trg_requisitions_updated_at ON public.requisitions;
CREATE TRIGGER trg_requisitions_updated_at
  BEFORE UPDATE ON public.requisitions
  FOR EACH ROW EXECUTE FUNCTION public.requisitions_set_updated_at();

DROP TRIGGER IF EXISTS trg_requisition_lignes_updated_at ON public.requisition_lignes;
CREATE TRIGGER trg_requisition_lignes_updated_at
  BEFORE UPDATE ON public.requisition_lignes
  FOR EACH ROW EXECUTE FUNCTION public.requisitions_set_updated_at();

-- ── Création atomique (en-tête + lignes, numéro séquentiel) ────────────────
-- Appelée par l'API en service_role après ses contrôles (membre du service,
-- services actifs, produits du bon catalogue, noms/unités figés).
-- p_entete : {client_id, type, statut, service_demandeur_id,
--             service_preparateur_id, stock, demandeur_id, date_souhaitee,
--             commentaire}
-- p_lignes : [{ingredient_id | article_id, nom, unite, quantite_demandee,
--              quantite_livree, prix_unitaire, ajoutee_par_preparateur,
--              commentaire}]
CREATE OR REPLACE FUNCTION public.requisition_creer(p_entete jsonb, p_lignes jsonb)
 RETURNS TABLE (id uuid, numero integer)
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
#variable_conflict use_column
declare
  v_client uuid := (p_entete->>'client_id')::uuid;
  v_id uuid;
  v_numero integer;
begin
  if jsonb_typeof(p_lignes) <> 'array' or jsonb_array_length(p_lignes) = 0 then
    raise exception 'Une réquisition doit avoir au moins une ligne.' using errcode = '22023';
  end if;

  -- Numérotation par établissement sans trou ni doublon en concurrence.
  perform pg_advisory_xact_lock(hashtextextended('requisitions:' || v_client::text, 0));
  select coalesce(max(r.numero), 0) + 1 into v_numero from public.requisitions r where r.client_id = v_client;

  insert into public.requisitions (
    client_id, numero, type, statut, service_demandeur_id, service_preparateur_id,
    stock, demandeur_id, date_souhaitee, commentaire,
    preparateur_id, prise_en_charge_at, livree_at
  ) values (
    v_client, v_numero,
    coalesce(p_entete->>'type', 'demande'),
    p_entete->>'statut',
    (p_entete->>'service_demandeur_id')::uuid,
    (p_entete->>'service_preparateur_id')::uuid,
    p_entete->>'stock',
    nullif(p_entete->>'demandeur_id', '')::uuid,
    nullif(p_entete->>'date_souhaitee', '')::date,
    nullif(p_entete->>'commentaire', ''),
    nullif(p_entete->>'preparateur_id', '')::uuid,
    nullif(p_entete->>'prise_en_charge_at', '')::timestamptz,
    nullif(p_entete->>'livree_at', '')::timestamptz
  ) returning requisitions.id into v_id;

  insert into public.requisition_lignes (
    requisition_id, client_id, ordre, ingredient_id, article_id, nom, unite,
    quantite_demandee, quantite_livree, prix_unitaire, ajoutee_par_preparateur, commentaire
  )
  select v_id, v_client, l.ord::integer,
         nullif(l.val->>'ingredient_id', '')::uuid,
         nullif(l.val->>'article_id', '')::uuid,
         l.val->>'nom',
         l.val->>'unite',
         nullif(l.val->>'quantite_demandee', '')::numeric,
         nullif(l.val->>'quantite_livree', '')::numeric,
         nullif(l.val->>'prix_unitaire', '')::numeric,
         coalesce((l.val->>'ajoutee_par_preparateur')::boolean, false),
         nullif(l.val->>'commentaire', '')
  from jsonb_array_elements(p_lignes) with ordinality as l(val, ord);

  return query select v_id, v_numero;
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.requisition_creer(jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.requisition_creer(jsonb, jsonb) TO service_role;

-- ── RLS (lecture seule en accès direct) ────────────────────────────────────
ALTER TABLE public.requisitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.requisition_lignes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS requisitions_select ON public.requisitions;
CREATE POLICY requisitions_select ON public.requisitions FOR SELECT TO authenticated
  USING (((SELECT public.get_my_is_superadmin()) IS TRUE)
         OR ((client_id IN (SELECT public.my_client_ids_for('requisitions', 'lecture')))
             AND ((service_demandeur_id IN (SELECT public.my_service_ids()))
                  OR (service_preparateur_id IN (SELECT public.my_service_ids()))
                  OR (client_id IN (SELECT public.my_client_ids_for('requisitions_analyses', 'lecture')))
                  OR (client_id IN (SELECT public.my_client_ids_for('administration', 'lecture'))))));

-- Lignes visibles quand l'en-tête l'est (sous-requête non corrélée, soumise
-- à la policy ci-dessus, calculée une fois).
DROP POLICY IF EXISTS requisition_lignes_select ON public.requisition_lignes;
CREATE POLICY requisition_lignes_select ON public.requisition_lignes FOR SELECT TO authenticated
  USING (requisition_id IN (SELECT r.id FROM public.requisitions r));

REVOKE ALL ON public.requisitions FROM anon;
REVOKE ALL ON public.requisition_lignes FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.requisitions FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.requisition_lignes FROM authenticated;
