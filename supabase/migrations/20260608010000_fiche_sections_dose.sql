-- Dose par portion sur les sections d'une fiche étoilée.
-- Permet d'unifier « préparations » et « dressage » dans une seule fiche : une
-- section liée à une sous-fiche peut indiquer la quantité utilisée par assiette,
-- et le coût/portion du dessert = Σ (coût unitaire sous-fiche × dose).
--
-- Colonnes additives et nullables → rétro-compatible : dose NULL = section non
-- dosée (coût = ses lignes, comportement actuel).

ALTER TABLE public.fiche_sections
  ADD COLUMN IF NOT EXISTS dose_portion numeric,
  ADD COLUMN IF NOT EXISTS dose_unite text;

COMMENT ON COLUMN public.fiche_sections.dose_portion IS
  'Quantité de cette préparation utilisée par portion (assiette). NULL = section non dosée (coût = ses lignes). Voir dose_unite.';
COMMENT ON COLUMN public.fiche_sections.dose_unite IS
  'Unité de la dose par portion (g, kg, ml, cl, L, u, portions).';

-- RLS : aucune nouvelle policy — fiche_sections_* filtrent déjà sur client_id.
