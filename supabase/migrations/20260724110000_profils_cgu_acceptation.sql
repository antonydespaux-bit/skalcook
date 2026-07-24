-- Traçabilité de l'acceptation des CGU / politique de confidentialité.
-- Renseigné lors de l'activation du compte (page /nouveau-mot-de-passe) pour
-- rendre l'acceptation opposable (date + version acceptée).
-- Additif et non destructif : colonnes nullables, aucun impact sur l'existant.

ALTER TABLE public.profils
  ADD COLUMN IF NOT EXISTS cgu_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS cgu_version text;

COMMENT ON COLUMN public.profils.cgu_accepted_at IS 'Horodatage de l''acceptation des CGU/politique de confidentialité par l''utilisateur.';
COMMENT ON COLUMN public.profils.cgu_version IS 'Version des CGU acceptée (ex. "1.0").';
