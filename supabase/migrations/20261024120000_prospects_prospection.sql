-- Prospects trouvés par prospection (agent / recherche manuelle), en plus des
-- demandes arrivées par le formulaire de contact de la landing.
--
--   - source            : 'formulaire' (landing) ou 'prospection'
--   - fiche resto       : adresse, arrondissement, site web, type de cuisine,
--                         contact public (nom + rôle)
--   - accroche          : angle d'approche propre à ce resto
--   - brouillon_objet / brouillon_email : premier e-mail prêt à relire/envoyer
--   - date_relance      : prochaine relance à faire
--
-- nom/email deviennent facultatifs : en prospection on n'a parfois qu'un
-- téléphone ou un formulaire, et pas toujours le nom du chef. Le formulaire
-- public continue de les exiger (validation Zod dans /api/prospects).
-- Table existante : pas de nouveau GRANT nécessaire.

ALTER TABLE public.prospects
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'formulaire',
  ADD COLUMN IF NOT EXISTS adresse text,
  ADD COLUMN IF NOT EXISTS arrondissement text,
  ADD COLUMN IF NOT EXISTS site_web text,
  ADD COLUMN IF NOT EXISTS type_cuisine text,
  ADD COLUMN IF NOT EXISTS contact_nom text,
  ADD COLUMN IF NOT EXISTS contact_role text,
  ADD COLUMN IF NOT EXISTS accroche text,
  ADD COLUMN IF NOT EXISTS brouillon_objet text,
  ADD COLUMN IF NOT EXISTS brouillon_email text,
  ADD COLUMN IF NOT EXISTS date_relance date;

ALTER TABLE public.prospects
  DROP CONSTRAINT IF EXISTS prospects_source_check;
ALTER TABLE public.prospects
  ADD CONSTRAINT prospects_source_check CHECK (source IN ('formulaire', 'prospection'));

ALTER TABLE public.prospects ALTER COLUMN nom DROP NOT NULL;
ALTER TABLE public.prospects ALTER COLUMN email DROP NOT NULL;
