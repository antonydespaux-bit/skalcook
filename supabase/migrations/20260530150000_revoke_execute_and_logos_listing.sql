-- Durcissement EXECUTE sur fonctions SECURITY DEFINER exposées via RPC
-- (advisors anon_/authenticated_security_definer_function_executable) + retrait
-- du listing du bucket public clients-logos.

-- ── Fonctions trigger / serveur uniquement → EXECUTE retiré à tous les rôles ──
-- Les triggers se déclenchent sans vérif du privilège EXECUTE de l'appelant ;
-- seed_client_defaults n'est appelée que depuis le trigger / service_role.
revoke execute on function public.__trigger_seed_client_defaults() from public, anon, authenticated;
revoke execute on function public.ca_budgets_log_change() from public, anon, authenticated;
revoke execute on function public.creer_profil() from public, anon, authenticated;
revoke execute on function public.seed_client_defaults(uuid) from public, anon, authenticated;

-- ── Helpers RLS + RPC CRM → retirés à anon/public, conservés à authenticated ──
-- Ces fonctions sont appelées dans les policies RLS (évaluées comme authenticated)
-- ou en .rpc() côté navigateur authentifié (crm_next_devis_numero). anon n'en a
-- jamais besoin (aucune policy anon ne les référence).
revoke execute on function public.get_client_id() from public, anon;
grant execute on function public.get_client_id() to authenticated;

revoke execute on function public.get_my_is_superadmin() from public, anon;
grant execute on function public.get_my_is_superadmin() to authenticated;

revoke execute on function public.get_my_role() from public, anon;
grant execute on function public.get_my_role() to authenticated;

revoke execute on function public.user_has_client_access(uuid) from public, anon;
grant execute on function public.user_has_client_access(uuid) to authenticated;

revoke execute on function public.crm_next_devis_numero(uuid, integer) from public, anon;
grant execute on function public.crm_next_devis_numero(uuid, integer) to authenticated;

-- ── clients-logos : retire le listing (bucket public) ────────────────────────
-- getPublicUrl sert les logos via le CDN public sans policy SELECT ; cette
-- policy n'autorisait que l'énumération des fichiers (.list()), non utilisée.
drop policy if exists "read_clients_logos" on storage.objects;
