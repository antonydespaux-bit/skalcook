-- Lien optionnel d'une section de fiche étoilée vers une vraie sous-fiche
-- réutilisable. Une section peut être « promue » (transformée en sous-fiche) ou
-- « importée » (créée à partir d'une sous-fiche existante). Le lien permet
-- d'afficher un badge « réutilisable » et de retrouver la sous-fiche source.
--
-- ON DELETE SET NULL : supprimer la sous-fiche déliera la section sans casser la
-- fiche consommatrice (la section garde sa copie d'ingrédients pour le livret).
--
-- Colonne additive et nullable → rétro-compatible : l'ancien code l'ignore.

ALTER TABLE public.fiche_sections
  ADD COLUMN IF NOT EXISTS sous_fiche_id uuid
    REFERENCES public.fiches(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.fiche_sections.sous_fiche_id IS
  'Sous-fiche réutilisable liée à cette section (promue depuis la section ou importée). NULL = section autonome. ON DELETE SET NULL.';

CREATE INDEX IF NOT EXISTS fiche_sections_sous_fiche_idx
  ON public.fiche_sections (sous_fiche_id);

-- RLS : aucune nouvelle policy. Les policies fiche_sections_* (migration
-- 20260527150000) filtrent déjà sur client_id via user_has_client_access, et
-- toutes les écritures passent par des requêtes tenant-scoped.
