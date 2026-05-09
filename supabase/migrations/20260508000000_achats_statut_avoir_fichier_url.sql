-- ─── achats_factures : capture des colonnes existantes en prod + ajout 'avoir' ──
--
-- Contexte : les colonnes `statut` et `fichier_url` étaient utilisées dans le
-- code (services + UI) mais absentes des migrations. Cette migration les
-- déclare formellement et étend l'enum statut pour gérer les avoirs.

-- 1. Colonnes (idempotent)
ALTER TABLE public.achats_factures
  ADD COLUMN IF NOT EXISTS statut      text,
  ADD COLUMN IF NOT EXISTS fichier_url text;

-- 2. Backfill : toute ligne sans statut devient 'facture'
UPDATE public.achats_factures
   SET statut = 'facture'
 WHERE statut IS NULL;

-- 3. NOT NULL + DEFAULT
ALTER TABLE public.achats_factures
  ALTER COLUMN statut SET DEFAULT 'facture',
  ALTER COLUMN statut SET NOT NULL;

-- 4. Check constraint : bl | facture | avoir
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'achats_factures_statut_check'
       AND conrelid = 'public.achats_factures'::regclass
  ) THEN
    ALTER TABLE public.achats_factures DROP CONSTRAINT achats_factures_statut_check;
  END IF;
END $$;

ALTER TABLE public.achats_factures
  ADD CONSTRAINT achats_factures_statut_check
  CHECK (statut IN ('bl', 'facture', 'avoir'));

-- 5. Index sur (client_id, date_facture) pour les filtres et exports
CREATE INDEX IF NOT EXISTS achats_factures_client_date_idx
  ON public.achats_factures (client_id, date_facture DESC);

-- 6. Index sur statut pour les filtres
CREATE INDEX IF NOT EXISTS achats_factures_client_statut_idx
  ON public.achats_factures (client_id, statut);

-- NOTE : l'unique partiel sur (client_id, numero_facture) est reporté à une
-- migration ultérieure car il existe au moins 1 doublon en prod à arbitrer.
