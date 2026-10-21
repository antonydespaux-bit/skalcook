-- Réquisitions, étape 3 : catalogue d'articles hors cuisine et bar.
--
-- Les services dont le stock est « articles » (économat, lingerie,
-- entretien…) servent des produits qui ne sont pas des ingrédients : pas de
-- fiche technique ni de food cost, juste un nom, une unité et un prix
-- unitaire HT pour valoriser les sorties. Chaque article appartient au
-- catalogue d'un service : une demande à l'Économat propose les articles de
-- l'Économat.
--
-- Droits (motif « une fois par requête », cf. 20260930120000_rls_initplan_perf) :
--   lecture   « requisitions » en lecture (le demandeur choisit dans le
--             catalogue du service destinataire)
--   écriture  « administration » en modification, ou membre du service avec
--             « requisitions » en modification (l'économe tient son
--             catalogue)
-- L'appli écrit via /api/requisitions/articles (service_role + mêmes règles).

-- Services dont l'utilisateur courant est membre (hors branche superadmin).
CREATE OR REPLACE FUNCTION public.my_service_ids()
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select service_id from public.service_membres where user_id = auth.uid();
$function$;

REVOKE EXECUTE ON FUNCTION public.my_service_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_service_ids() TO authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.articles (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id      uuid        NOT NULL REFERENCES public.clients (id) ON DELETE CASCADE,
  service_id     uuid        NOT NULL,
  nom            text        NOT NULL CHECK (length(btrim(nom)) BETWEEN 1 AND 120),
  categorie      text        CHECK (categorie IS NULL OR length(categorie) <= 60),
  reference      text        CHECK (reference IS NULL OR length(reference) <= 60),
  unite          text        NOT NULL DEFAULT 'u' CHECK (length(btrim(unite)) BETWEEN 1 AND 20),
  prix_unitaire  numeric(12, 4) CHECK (prix_unitaire IS NULL OR prix_unitaire >= 0),
  actif          boolean     NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  -- Un service ne peut pas être supprimé tant qu'il a un catalogue : on le
  -- désactive (l'historique des réquisitions pointera sur ces articles).
  CONSTRAINT articles_service_fkey FOREIGN KEY (service_id, client_id)
    REFERENCES public.services_internes (id, client_id) ON DELETE RESTRICT
);

COMMENT ON TABLE public.articles IS
  'Catalogue d''articles hors F&B (économat, entretien…) servis par un service interne. prix_unitaire = HT par unité.';

CREATE UNIQUE INDEX IF NOT EXISTS articles_service_nom_key
  ON public.articles (service_id, lower(btrim(nom)));

CREATE INDEX IF NOT EXISTS articles_client_service_idx
  ON public.articles (client_id, service_id);

CREATE OR REPLACE FUNCTION public.articles_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  new.updated_at := now();
  return new;
end;
$function$;

DROP TRIGGER IF EXISTS trg_articles_updated_at ON public.articles;
CREATE TRIGGER trg_articles_updated_at
  BEFORE UPDATE ON public.articles
  FOR EACH ROW EXECUTE FUNCTION public.articles_set_updated_at();

-- ── RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE public.articles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS articles_select ON public.articles;
DROP POLICY IF EXISTS articles_insert ON public.articles;
DROP POLICY IF EXISTS articles_update ON public.articles;
DROP POLICY IF EXISTS articles_delete ON public.articles;

CREATE POLICY articles_select ON public.articles FOR SELECT TO authenticated
  USING (((SELECT public.get_my_is_superadmin()) IS TRUE)
         OR (client_id IN (SELECT public.my_client_ids_for('requisitions', 'lecture'))));
CREATE POLICY articles_insert ON public.articles FOR INSERT TO authenticated
  WITH CHECK (((SELECT public.get_my_is_superadmin()) IS TRUE)
         OR (client_id IN (SELECT public.my_client_ids_for('administration', 'modification')))
         OR ((client_id IN (SELECT public.my_client_ids_for('requisitions', 'modification')))
             AND (service_id IN (SELECT public.my_service_ids()))));
CREATE POLICY articles_update ON public.articles FOR UPDATE TO authenticated
  USING (((SELECT public.get_my_is_superadmin()) IS TRUE)
         OR (client_id IN (SELECT public.my_client_ids_for('administration', 'modification')))
         OR ((client_id IN (SELECT public.my_client_ids_for('requisitions', 'modification')))
             AND (service_id IN (SELECT public.my_service_ids()))))
  WITH CHECK (((SELECT public.get_my_is_superadmin()) IS TRUE)
         OR (client_id IN (SELECT public.my_client_ids_for('administration', 'modification')))
         OR ((client_id IN (SELECT public.my_client_ids_for('requisitions', 'modification')))
             AND (service_id IN (SELECT public.my_service_ids()))));
CREATE POLICY articles_delete ON public.articles FOR DELETE TO authenticated
  USING (((SELECT public.get_my_is_superadmin()) IS TRUE)
         OR (client_id IN (SELECT public.my_client_ids_for('administration', 'modification')))
         OR ((client_id IN (SELECT public.my_client_ids_for('requisitions', 'modification')))
             AND (service_id IN (SELECT public.my_service_ids()))));

-- ── Droits d'accès à la Data API ───────────────────────────────────────────
-- À partir du 2026-10-30, Supabase n'accorde plus automatiquement l'accès
-- aux nouvelles tables de « public » : chaque table créée ici reçoit ses
-- GRANT explicites (sans eux, même les routes API en service_role
-- reçoivent « permission denied »). anon : aucun accès ; la RLS filtre
-- ensuite ce qu'authenticated voit et modifie.
REVOKE ALL ON public.articles FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.articles TO authenticated;
GRANT ALL ON public.articles TO service_role;
