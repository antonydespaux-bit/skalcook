-- Journal : autoriser les lignes sans établissement (client_id NULL) pour les
-- actions et connexions du superadmin hors de tout établissement (écran
-- superadmin, création de groupe…). Sans cela, son activité n'apparaissait
-- jamais dans Superadmin › Activité.
--
-- Isolation inchangée : les policies de logs autorisent
-- « superadmin OU client_id IN my_client_ids() » ; pour un non-superadmin,
-- NULL IN (…) est faux, donc ces lignes restent invisibles aux clients.
-- Les écritures passent par le service_role (lib/serverLog.ts).
ALTER TABLE public.logs ALTER COLUMN client_id DROP NOT NULL;
