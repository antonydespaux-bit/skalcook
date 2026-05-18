-- Permet de tracer qu'un BL a été fusionné dans une facture consolidée.
-- Le BL conserve son entrée (et son fichier) mais ses lignes sont
-- déplacées vers la facture cible et ses totaux mis à zéro pour éviter
-- le double-comptage.

ALTER TABLE public.achats_factures
  ADD COLUMN IF NOT EXISTS facture_consolidee_id uuid
  REFERENCES public.achats_factures(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.achats_factures.facture_consolidee_id IS
  'Si renseigné, ce BL a été fusionné dans la facture pointée. Les lignes ont été déplacées et les totaux mis à zéro.';

CREATE INDEX IF NOT EXISTS achats_factures_consolidee_idx
  ON public.achats_factures (facture_consolidee_id) WHERE facture_consolidee_id IS NOT NULL;
