-- Correction de la migration 20260427120000_split_saison_annee.sql qui avait
-- oublié la table fiches_bar. La page de création de fiches bar tentait
-- d'écrire la colonne `annee` après le merge → "column not found in schema cache".
--
-- Applique le même traitement (split saison/année + check + index) à fiches_bar
-- que ce qui avait été fait sur fiches/menus/cartes.

BEGIN;

ALTER TABLE fiches_bar ADD COLUMN IF NOT EXISTS annee INTEGER;

UPDATE fiches_bar SET annee = (substring(saison from '(\d{4})'))::INTEGER
WHERE annee IS NULL AND saison ~ '\d{4}';

UPDATE fiches_bar SET saison = trim(regexp_replace(saison, '\s*\d{4}\s*', '', 'g'))
WHERE saison ~ '\d{4}';

UPDATE fiches_bar SET saison = 'Été' WHERE lower(saison) = 'ete';

ALTER TABLE fiches_bar DROP CONSTRAINT IF EXISTS fiches_bar_saison_check;
ALTER TABLE fiches_bar ADD CONSTRAINT fiches_bar_saison_check
  CHECK (saison IS NULL OR saison = '' OR saison IN ('Printemps','Été','Automne','Hiver','Toutes'));

CREATE INDEX IF NOT EXISTS fiches_bar_saison_annee_idx ON fiches_bar (saison, annee);

COMMIT;
