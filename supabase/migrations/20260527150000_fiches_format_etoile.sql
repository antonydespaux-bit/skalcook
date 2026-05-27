-- Format de fiche technique "étoilé" : permet aux restaurants étoilés d'afficher
-- une fiche regroupant plusieurs préparations (sections) avec leur descriptif
-- inline, comme sur un livret papier (ex. "Homard, navet, feuille moutarde" ADMO).
--
-- La donnée reste unifiée : les fiches existantes sans sections continuent
-- d'afficher en mode brasserie. Les fiches avec sections peuvent être affichées
-- soit en mode brasserie (à plat), soit en mode étoilé (regroupé). Le choix
-- d'affichage par défaut est porté par le client ; chaque fiche peut surcharger.

-- 1. Format de fiche par défaut sur clients (brasserie | etoile)
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS fiche_format_defaut text NOT NULL DEFAULT 'brasserie'
    CHECK (fiche_format_defaut IN ('brasserie', 'etoile'));

COMMENT ON COLUMN public.clients.fiche_format_defaut IS
  'Format d''affichage par défaut des fiches techniques pour cet établissement : brasserie (vue à plat, défaut) ou etoile (sections de préparation avec descriptif inline).';

-- 2. Override par fiche (NULL = utiliser le défaut du client)
ALTER TABLE public.fiches
  ADD COLUMN IF NOT EXISTS format_affichage text
    CHECK (format_affichage IS NULL OR format_affichage IN ('brasserie', 'etoile'));

COMMENT ON COLUMN public.fiches.format_affichage IS
  'Surcharge le format d''affichage par défaut de l''établissement pour cette fiche. NULL = hériter de clients.fiche_format_defaut.';

-- 3. Sections de préparation (mode étoilé) — table optionnelle
CREATE TABLE IF NOT EXISTS public.fiche_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  fiche_id uuid NOT NULL REFERENCES public.fiches(id) ON DELETE CASCADE,
  ordre integer NOT NULL DEFAULT 0,
  nom text NOT NULL,
  descriptif text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.fiche_sections IS
  'Sections de préparation d''une fiche en mode étoilé. Chaque section regroupe ses propres ingrédients (via fiche_ingredients.section_id) et porte son propre descriptif (méthode inline).';

CREATE INDEX IF NOT EXISTS fiche_sections_fiche_idx
  ON public.fiche_sections (fiche_id, ordre);

CREATE INDEX IF NOT EXISTS fiche_sections_client_idx
  ON public.fiche_sections (client_id);

-- RLS aligné sur le reste du schéma (user_has_client_access)
ALTER TABLE public.fiche_sections ENABLE ROW LEVEL SECURITY;

CREATE POLICY fiche_sections_select ON public.fiche_sections
  FOR SELECT USING (user_has_client_access(client_id));

CREATE POLICY fiche_sections_insert ON public.fiche_sections
  FOR INSERT WITH CHECK (user_has_client_access(client_id));

CREATE POLICY fiche_sections_update ON public.fiche_sections
  FOR UPDATE USING (user_has_client_access(client_id))
                WITH CHECK (user_has_client_access(client_id));

CREATE POLICY fiche_sections_delete ON public.fiche_sections
  FOR DELETE USING (user_has_client_access(client_id));

-- 4. Rattachement d'une ligne d'ingrédient à une section (NULL = section "par défaut" / mode brasserie)
ALTER TABLE public.fiche_ingredients
  ADD COLUMN IF NOT EXISTS section_id uuid
    REFERENCES public.fiche_sections(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.fiche_ingredients.section_id IS
  'Section de préparation à laquelle cette ligne d''ingrédient appartient en mode étoilé. NULL = ligne libre (mode brasserie ou ingrédient non rattaché à une préparation).';

CREATE INDEX IF NOT EXISTS fiche_ingredients_section_idx
  ON public.fiche_ingredients (section_id);
