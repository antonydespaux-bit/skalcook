-- TVA par ligne pour factures avec plusieurs taux (ex: alimentaire 5,5% + non-alim 20%).
-- Si NULL, fallback sur achats_factures.taux_tva pour la rétro-compatibilité.
ALTER TABLE public.achats_lignes
  ADD COLUMN IF NOT EXISTS taux_tva numeric;
