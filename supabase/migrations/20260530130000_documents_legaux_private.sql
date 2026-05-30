-- documents_legaux (KBIS, RIB) : données légales/bancaires sensibles.
-- Avant : bucket public + SELECT pour tout authentifié → lisibles par URL et
-- accessibles cross-tenant par n'importe quel utilisateur connecté.
-- Après : bucket privé + SELECT réservé au superadmin (seul à gérer les
-- établissements). L'app génère des signed URLs à la demande côté superadmin.

update storage.buckets set public = false where id = 'documents_legaux';

drop policy if exists "Utilisateurs authentifiés peuvent voir les documents" on storage.objects;
create policy documents_legaux_select_superadmin on storage.objects
  for select to authenticated
  using (bucket_id = 'documents_legaux' and public.is_superadmin());
