-- Sépare le champ texte saison ("Printemps 2026") en deux colonnes :
--   saison : Printemps | Été | Automne | Hiver | Toutes
--   annee  : entier (2025 → année courante + 2 côté UI)
--
-- Stratégie : ajout de la colonne `annee` + backfill depuis le texte existant,
-- puis normalisation du champ `saison` pour ne contenir que le nom de saison.
-- CHECK constraint pour garantir l'intégrité des valeurs autorisées.
-- Pas de drop de colonne — on garde la place pour rollback applicatif.

BEGIN;

-- 1. Ajout colonne annee
ALTER TABLE fiches ADD COLUMN IF NOT EXISTS annee INTEGER;
ALTER TABLE menus  ADD COLUMN IF NOT EXISTS annee INTEGER;
ALTER TABLE cartes ADD COLUMN IF NOT EXISTS annee INTEGER;

-- 2. Backfill annee depuis saison texte ("Printemps 2026" → 2026)
UPDATE fiches
SET annee = (substring(saison from '(\d{4})'))::INTEGER
WHERE annee IS NULL AND saison ~ '\d{4}';

UPDATE menus
SET annee = (substring(saison from '(\d{4})'))::INTEGER
WHERE annee IS NULL AND saison ~ '\d{4}';

UPDATE cartes
SET annee = (substring(saison from '(\d{4})'))::INTEGER
WHERE annee IS NULL AND saison ~ '\d{4}';

-- 3. Strip de l'année dans saison ("Printemps 2026" → "Printemps")
UPDATE fiches
SET saison = trim(regexp_replace(saison, '\s*\d{4}\s*', '', 'g'))
WHERE saison ~ '\d{4}';

UPDATE menus
SET saison = trim(regexp_replace(saison, '\s*\d{4}\s*', '', 'g'))
WHERE saison ~ '\d{4}';

UPDATE cartes
SET saison = trim(regexp_replace(saison, '\s*\d{4}\s*', '', 'g'))
WHERE saison ~ '\d{4}';

-- 4. Normalisation des graphies historiques (Ete → Été, etc.)
UPDATE fiches SET saison = 'Été'      WHERE lower(saison) = 'ete';
UPDATE menus  SET saison = 'Été'      WHERE lower(saison) = 'ete';
UPDATE cartes SET saison = 'Été'      WHERE lower(saison) = 'ete';

-- 5. CHECK constraint sur saison (autorise NULL et chaîne vide pour le legacy)
ALTER TABLE fiches DROP CONSTRAINT IF EXISTS fiches_saison_check;
ALTER TABLE fiches ADD  CONSTRAINT fiches_saison_check
  CHECK (saison IS NULL OR saison = '' OR saison IN ('Printemps','Été','Automne','Hiver','Toutes'));

ALTER TABLE menus DROP CONSTRAINT IF EXISTS menus_saison_check;
ALTER TABLE menus ADD  CONSTRAINT menus_saison_check
  CHECK (saison IS NULL OR saison = '' OR saison IN ('Printemps','Été','Automne','Hiver','Toutes'));

ALTER TABLE cartes DROP CONSTRAINT IF EXISTS cartes_saison_check;
ALTER TABLE cartes ADD  CONSTRAINT cartes_saison_check
  CHECK (saison IS NULL OR saison = '' OR saison IN ('Printemps','Été','Automne','Hiver','Toutes'));

-- 6. Index pour les filtres combinés saison+annee
CREATE INDEX IF NOT EXISTS fiches_saison_annee_idx ON fiches (saison, annee);
CREATE INDEX IF NOT EXISTS menus_saison_annee_idx  ON menus  (saison, annee);
CREATE INDEX IF NOT EXISTS cartes_saison_annee_idx ON cartes (saison, annee);

COMMIT;
