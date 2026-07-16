-- Scope les policies du bucket public `fiches-photos` au tenant.
--
-- Problème : les 4 policies `fiches_photos_*_authenticated` ne vérifiaient que
-- `bucket_id = 'fiches-photos'`, sans scoping tenant. Un utilisateur connecté du
-- resto A pouvait donc LISTER, LIRE, ÉCRASER et SUPPRIMER les photos du resto B
-- (limitation documentée dans 20260715000000_fix_fiches_photos_storage_anon.sql).
--
-- Contrainte : les chemins sont `<cuisine|bar>/<ficheId>.<ext>` — indexés par
-- ficheId, pas par client_id. Plutôt qu'une migration de données irréversible
-- (re-pathing + réécriture des URLs stockées), on scope via sous-requête : le
-- ficheId extrait du chemin doit appartenir à une `fiches` (cuisine) ou
-- `fiches_bar` accessible au user courant. Les UUID étant globalement uniques,
-- tester les deux tables en OR est sans ambiguïté.
--
-- Notes :
--  * La lecture publique par URL (getPublicUrl) n'utilise PAS la policy SELECT
--    (bucket public) → l'affichage des photos reste fonctionnel.
--  * Le `.list(folder, {search: ficheId})` fait par lib/uploadPhoto.js avant
--    upload reste OK : l'utilisateur voit les fichiers de SES propres fiches.
--  * Les fichiers orphelins (fiche supprimée) et `.emptyFolderPlaceholder`
--    deviennent accessibles uniquement au service-role — sans impact (aucune
--    fiche ne les référence).
--  * `split_part(storage.filename(name), '.', 1)` isole le ficheId : les UUID
--    ne contiennent pas de point, la comparaison se fait en texte (pas de cast
--    → pas d'erreur sur les chemins non-UUID comme le placeholder).

DROP POLICY IF EXISTS "fiches_photos_select_authenticated" ON storage.objects;
DROP POLICY IF EXISTS "fiches_photos_insert_authenticated" ON storage.objects;
DROP POLICY IF EXISTS "fiches_photos_update_authenticated" ON storage.objects;
DROP POLICY IF EXISTS "fiches_photos_delete_authenticated" ON storage.objects;

CREATE POLICY fiches_photos_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'fiches-photos'
    AND (
      EXISTS (
        SELECT 1 FROM public.fiches f
        WHERE f.id::text = split_part(storage.filename(name), '.', 1)
          AND public.user_has_client_access(f.client_id)
      )
      OR EXISTS (
        SELECT 1 FROM public.fiches_bar fb
        WHERE fb.id::text = split_part(storage.filename(name), '.', 1)
          AND public.user_has_client_access(fb.client_id)
      )
    )
  );

CREATE POLICY fiches_photos_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'fiches-photos'
    AND (
      EXISTS (
        SELECT 1 FROM public.fiches f
        WHERE f.id::text = split_part(storage.filename(name), '.', 1)
          AND public.user_has_client_access(f.client_id)
      )
      OR EXISTS (
        SELECT 1 FROM public.fiches_bar fb
        WHERE fb.id::text = split_part(storage.filename(name), '.', 1)
          AND public.user_has_client_access(fb.client_id)
      )
    )
  );

CREATE POLICY fiches_photos_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'fiches-photos'
    AND (
      EXISTS (
        SELECT 1 FROM public.fiches f
        WHERE f.id::text = split_part(storage.filename(name), '.', 1)
          AND public.user_has_client_access(f.client_id)
      )
      OR EXISTS (
        SELECT 1 FROM public.fiches_bar fb
        WHERE fb.id::text = split_part(storage.filename(name), '.', 1)
          AND public.user_has_client_access(fb.client_id)
      )
    )
  )
  WITH CHECK (
    bucket_id = 'fiches-photos'
    AND (
      EXISTS (
        SELECT 1 FROM public.fiches f
        WHERE f.id::text = split_part(storage.filename(name), '.', 1)
          AND public.user_has_client_access(f.client_id)
      )
      OR EXISTS (
        SELECT 1 FROM public.fiches_bar fb
        WHERE fb.id::text = split_part(storage.filename(name), '.', 1)
          AND public.user_has_client_access(fb.client_id)
      )
    )
  );

CREATE POLICY fiches_photos_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'fiches-photos'
    AND (
      EXISTS (
        SELECT 1 FROM public.fiches f
        WHERE f.id::text = split_part(storage.filename(name), '.', 1)
          AND public.user_has_client_access(f.client_id)
      )
      OR EXISTS (
        SELECT 1 FROM public.fiches_bar fb
        WHERE fb.id::text = split_part(storage.filename(name), '.', 1)
          AND public.user_has_client_access(fb.client_id)
      )
    )
  );
