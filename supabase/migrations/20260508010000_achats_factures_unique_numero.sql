-- Unicité partielle sur (client_id, numero_facture) hors soft-delete.
-- Les doublons existants ont été arbitrés (soft-deletés) avant l'ajout.
CREATE UNIQUE INDEX IF NOT EXISTS achats_factures_client_numero_unique
  ON public.achats_factures (client_id, numero_facture)
  WHERE numero_facture IS NOT NULL AND deleted_at IS NULL;
