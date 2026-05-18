-- ============================================================================
-- lieux_service : ajout colonne couverts_indicatifs.
--
-- Cas Marsan Privat : les couverts saisis sur le lieu Privat sont
-- indicatifs (variables d'un événement à l'autre) et faussent les TM
-- réels du restaurant si on les agrège. Le CA reste compté normalement,
-- mais les couverts (réels et budget) sont exclus des agrégations
-- couverts du rapport hebdo.
--
-- Effet attendu côté app :
--   - Tableau couverts jour-par-jour : ignore les couverts Privat
--   - Total couverts midi/soir : ignore Privat
--   - TM par lieu × service : Privat n'apparaît plus (CA/0 = N/A)
--   - TM Food/Bev par service : couverts du dénominateur excluent Privat
--   - CA TTC, écart budget, Autres CA : INCHANGÉS (Privat reste compté)
-- ============================================================================

ALTER TABLE public.lieux_service
  ADD COLUMN IF NOT EXISTS couverts_indicatifs boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.lieux_service.couverts_indicatifs IS
  'Si true, les couverts saisis sur ce lieu sont indicatifs et ne sont pas comptés dans les agrégations couverts du rapport hebdo. Le CA reste compté. Cas Marsan Privat.';
