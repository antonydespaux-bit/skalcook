-- ============================================================================
-- Soft-delete pour les factures (obligation DGCCRF : rétention 10 ans)
--
-- Les factures ne sont plus supprimées physiquement. Elles sont marquées
-- comme "supprimées" avec date, utilisateur et motif.
-- Rétention automatique : 10 ans après la date de facture.
-- ============================================================================

-- Colonnes soft-delete sur achats_factures
ALTER TABLE public.achats_factures
  ADD COLUMN IF NOT EXISTS deleted_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by       UUID,
  ADD COLUMN IF NOT EXISTS retention_until   DATE;

-- Colonnes traçabilité HACCP sur achats_lignes
ALTER TABLE public.achats_lignes
  ADD COLUMN IF NOT EXISTS numero_lot       TEXT,
  ADD COLUMN IF NOT EXISTS dlc              DATE,
  ADD COLUMN IF NOT EXISTS dluo             DATE;

-- Index pour exclure les factures supprimées des requêtes courantes
CREATE INDEX IF NOT EXISTS achats_factures_not_deleted_idx
  ON public.achats_factures (client_id, date_facture)
  WHERE deleted_at IS NULL;

-- Fonction trigger : calcul automatique de la date de rétention (10 ans)
CREATE OR REPLACE FUNCTION public.set_facture_retention()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NEW.retention_until IS NULL AND NEW.date_facture IS NOT NULL THEN
    NEW.retention_until := NEW.date_facture + INTERVAL '10 years';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_facture_retention ON public.achats_factures;
CREATE TRIGGER trg_facture_retention
  BEFORE INSERT OR UPDATE ON public.achats_factures
  FOR EACH ROW
  EXECUTE FUNCTION public.set_facture_retention();

-- Backfill : rétention pour les factures existantes
UPDATE public.achats_factures
SET retention_until = date_facture + INTERVAL '10 years'
WHERE retention_until IS NULL AND date_facture IS NOT NULL;

COMMENT ON COLUMN public.achats_factures.deleted_at IS
  'Soft-delete : date de suppression logique. NULL = facture active.';
COMMENT ON COLUMN public.achats_factures.retention_until IS
  'Date jusqu''à laquelle la facture DOIT être conservée (DGCCRF : 10 ans).';
COMMENT ON COLUMN public.achats_lignes.numero_lot IS
  'Numéro de lot fournisseur (traçabilité HACCP).';
COMMENT ON COLUMN public.achats_lignes.dlc IS
  'Date Limite de Consommation.';
COMMENT ON COLUMN public.achats_lignes.dluo IS
  'Date Limite d''Utilisation Optimale.';
