-- Durcissement : retirer l'exposition RPC anon des helpers RLS de sections.
--
-- `user_can_read_section` / `user_can_write_section` sont des SECURITY DEFINER
-- utilisés uniquement DANS les policies RLS de fiches/ingredients (toutes
-- `TO authenticated`). Ils n'ont aucune raison d'être appelables par `anon` via
-- /rest/v1/rpc/* (advisor `anon_security_definer_function_executable`). On
-- révoque PUBLIC/anon et on garde `authenticated` (nécessaire à l'évaluation
-- des policies). Aligne ces 2 fonctions sur les autres helpers déjà durcis en
-- 20260530150000.

REVOKE EXECUTE ON FUNCTION public.user_can_read_section(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.user_can_write_section(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_can_read_section(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_can_write_section(uuid, text) TO authenticated;
