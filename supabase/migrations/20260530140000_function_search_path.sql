-- Durcissement : fige search_path sur les fonctions qui ne l'avaient pas
-- (advisor function_search_path_mutable). Évite le détournement de résolution
-- de noms (schemas malveillants) — critique pour les fonctions SECURITY DEFINER
-- (creer_profil, get_client_id). Aucun changement de comportement.

alter function public.mapping_ventes_fill_designation_norm() set search_path = public, pg_temp;
alter function public.get_client_id() set search_path = public, pg_temp;
alter function public.trg_fournisseur_mapping_fill_norm() set search_path = public, pg_temp;
alter function public.trg_fournisseur_mapping_updated_at() set search_path = public, pg_temp;
alter function public.delete_linked_ingredient() set search_path = public, pg_temp;
alter function public.check_ingredient_quota_per_client() set search_path = public, pg_temp;
alter function public.creer_profil() set search_path = public, pg_temp;
alter function public.recalculer_cout_portions() set search_path = public, pg_temp;
alter function public.track_prix_ingredients() set search_path = public, pg_temp;
alter function public.recalculer_cout_portions_bar() set search_path = public, pg_temp;
alter function public.track_prix_ingredients_bar() set search_path = public, pg_temp;
