-- Perf RLS : évaluer le contrôle d'accès UNE fois par requête, pas par ligne.
--
-- Les policies du type `user_has_client_access(client_id)` appellent une
-- fonction SECURITY DEFINER (non inlinable) avec une colonne en argument :
-- Postgres la réévalue pour CHAQUE ligne lue, soit 2 sous-requêtes
-- (profils + acces_clients) par ligne. Sur un gros client, la liste des
-- inventaires (11 400 lignes) prenait 1,3 s et la liste des achats 775 ms,
-- et le coût croît linéairement avec les données.
--
-- Réécriture, à sémantique identique :
--   user_has_client_access(client_id)
--     → (SELECT get_my_is_superadmin()) IS TRUE
--       OR client_id IN (SELECT my_client_ids())
--   user_can_read_section(client_id, 's')  → idem avec my_readable_client_ids('s')
--   user_can_write_section(client_id, 's') → idem avec my_writable_client_ids('s')
--   auth.uid(), is_superadmin(), get_my_is_superadmin(), get_my_role()
--     → (SELECT …) pour qu'ils deviennent des InitPlan (évalués une fois).
-- Les sous-requêtes ne dépendent plus de la ligne : Postgres les calcule une
-- fois (hashed SubPlan). Mesuré : 1 326 ms → 8 ms (inventaires), 775 → 6 ms
-- (achats).
--
-- Équivalence : auth.uid() NULL ⇒ get_my_is_superadmin() NULL (IS TRUE = false)
-- et my_client_ids() vide ⇒ refus, comme avant. Superadmin ⇒ tout, comme avant
-- (y compris client_id NULL).
--
-- Les ALTER POLICY ne touchent qu'à l'expression (nom, rôles, commande,
-- permissive inchangés). Les remplacements sont idempotents (lookbehind sur
-- "SELECT "), la migration peut être rejouée sans double-wrapping.

CREATE OR REPLACE FUNCTION public.my_client_ids()
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select client_id from public.acces_clients where user_id = auth.uid();
$function$;

-- Miroir de user_can_read_section (hors branche superadmin, gérée dans la policy).
CREATE OR REPLACE FUNCTION public.my_readable_client_ids(p_section text)
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select client_id from public.acces_clients
  where user_id = auth.uid()
    and (role in ('admin', 'directeur') or role = p_section);
$function$;

-- Miroir de user_can_write_section (hors branche superadmin).
CREATE OR REPLACE FUNCTION public.my_writable_client_ids(p_section text)
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select client_id from public.acces_clients
  where user_id = auth.uid()
    and (role = 'admin' or role = p_section);
$function$;

DO $migration$
DECLARE
  p record;
  nq text;
  nw text;
  sa constant text := '((SELECT public.get_my_is_superadmin()) IS TRUE)';
  expr text; -- expression en cours de réécriture (USING puis WITH CHECK)
BEGIN
  -- Déparse stable : noms non qualifiés pour public, qualifiés pour auth.
  SET LOCAL search_path TO public;

  FOR p IN
    SELECT schemaname, tablename, policyname, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
  LOOP
    nq := p.qual;
    nw := p.with_check;

    -- Ordre important : les wraps de fonctions sans argument passent AVANT
    -- l'insertion des nouvelles expressions (qui contiennent déjà des SELECT).
    FOR i IN 1..2 LOOP
      expr := CASE i WHEN 1 THEN nq ELSE nw END;
      CONTINUE WHEN expr IS NULL;

      expr := regexp_replace(expr, '(?<!SELECT )auth\.uid\(\)', '(SELECT auth.uid())', 'g');
      expr := regexp_replace(expr, '(?<!SELECT )(?<![_a-z.])is_superadmin\(\)', '(SELECT public.is_superadmin())', 'g');
      expr := regexp_replace(expr, '(?<!SELECT )(?<![a-z.])get_my_is_superadmin\(\)', '(SELECT public.get_my_is_superadmin())', 'g');
      expr := regexp_replace(expr, '(?<!SELECT )(?<![a-z.])get_my_role\(\)', '(SELECT public.get_my_role())', 'g');
      expr := regexp_replace(expr,
        'user_has_client_access\(client_id\)',
        '(' || sa || ' OR (client_id IN (SELECT public.my_client_ids())))', 'g');
      expr := regexp_replace(expr,
        'user_can_read_section\(client_id, (''[a-z_]+''::text)\)',
        '(' || sa || ' OR (client_id IN (SELECT public.my_readable_client_ids(\1))))', 'g');
      expr := regexp_replace(expr,
        'user_can_write_section\(client_id, (''[a-z_]+''::text)\)',
        '(' || sa || ' OR (client_id IN (SELECT public.my_writable_client_ids(\1))))', 'g');

      IF i = 1 THEN nq := expr; ELSE nw := expr; END IF;
    END LOOP;

    CONTINUE WHEN nq IS NOT DISTINCT FROM p.qual AND nw IS NOT DISTINCT FROM p.with_check;

    EXECUTE format('ALTER POLICY %I ON %I.%I%s%s',
      p.policyname, p.schemaname, p.tablename,
      CASE WHEN nq IS NOT NULL THEN ' USING (' || nq || ')' ELSE '' END,
      CASE WHEN nw IS NOT NULL THEN ' WITH CHECK (' || nw || ')' ELSE '' END);
  END LOOP;
END
$migration$;

-- Mêmes droits que user_has_client_access : pas d'exécution anonyme.
REVOKE EXECUTE ON FUNCTION public.my_client_ids() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.my_readable_client_ids(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.my_writable_client_ids(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_client_ids() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.my_readable_client_ids(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.my_writable_client_ids(text) TO authenticated, service_role;
