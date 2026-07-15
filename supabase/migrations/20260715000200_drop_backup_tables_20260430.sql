-- Suppression des tables de backup ponctuelles du 2026-04-30.
-- Ce sont des snapshots figés, supersédés par les tables live (plus récentes et
-- plus volumineuses : fiches 269 vs 123, cartes 6 vs 5, etc.). Elles remontaient
-- dans les advisors (rls_enabled_no_policy) et n'ont aucune valeur opérationnelle.
-- Confirmé pour suppression définitive par le propriétaire.

drop table if exists public.fiches_backup_20260430;
drop table if exists public.fiches_bar_backup_20260430;
drop table if exists public.cartes_backup_20260430;
drop table if exists public.menus_backup_20260430;
