-- Montant TVA total saisi au pied de facture (override). Si NULL, on calcule
-- la TVA depuis achats_lignes.taux_tva (avec fallback sur achats_factures.taux_tva).
-- Si NOT NULL, le montant saisi prime sur le calcul (utile quand l'OCR détecte
-- mal les taux par ligne ou pour les factures multi-taux).
ALTER TABLE public.achats_factures
  ADD COLUMN IF NOT EXISTS montant_tva numeric;
