-- Droits par établissement : matrice Rôle × Fonctionnalité à 3 niveaux
-- (aucun / lecture / modification), réglée par le superadmin.
--
-- Ne stocke que les écarts aux valeurs par défaut définies dans
-- lib/permissions.js (qui reproduisent les droits codés en dur avant) :
-- sans ligne, le défaut s'applique.
--
-- Lecture : membres de l'établissement (leur appli doit connaître la
-- matrice pour afficher menus et boutons) et superadmin.
-- Écriture : uniquement via /api/superadmin/permissions (service_role) ;
-- aucune policy INSERT / UPDATE / DELETE.

CREATE TABLE IF NOT EXISTS public.permissions_roles (
  client_id      uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  role           text NOT NULL CHECK (role IN ('admin', 'directeur', 'cuisine', 'bar', 'consultant')),
  fonctionnalite text NOT NULL CHECK (length(fonctionnalite) BETWEEN 1 AND 64),
  niveau         text NOT NULL CHECK (niveau IN ('aucun', 'lecture', 'modification')),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (client_id, role, fonctionnalite)
);

ALTER TABLE public.permissions_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS permissions_roles_select ON public.permissions_roles;
CREATE POLICY permissions_roles_select ON public.permissions_roles
  FOR SELECT TO authenticated
  USING (
    ((SELECT public.get_my_is_superadmin()) IS TRUE)
    OR client_id IN (SELECT public.my_client_ids())
  );

REVOKE ALL ON public.permissions_roles FROM anon;
