-- Durcissement du bucket public `fiches-photos`.
--
-- Avant : les policies auto-générées (Insert gxhezc_0..3) ouvraient
--   INSERT / SELECT / UPDATE / DELETE aux rôles {anon, authenticated}, avec pour
--   seule condition `bucket_id = 'fiches-photos'`. La clé anon étant publique
--   (embarquée dans le client web), n'importe qui sur internet pouvait lister,
--   écraser ou SUPPRIMER les photos de n'importe quel restaurant.
--
-- Après : seules les sessions authentifiées peuvent lister/écrire/supprimer.
--   Le bucket reste public EN LECTURE par URL : getPublicUrl() ne passe pas par
--   ces policies, donc l'affichage des photos dans l'app n'est pas impacté.
--
-- Limite connue (suivi) : les chemins ne sont pas scopés par tenant
--   (`cuisine/<uuid>.jpg`), donc un utilisateur authentifié d'un resto pourrait
--   encore énumérer les photos d'un autre. Fermeture complète = re-pathing
--   `<client_id>/<section>/...` + scoping des policies (change lib/uploadPhoto.js
--   et les URLs stockées). Hors périmètre de ce correctif.

drop policy if exists "Insert gxhezc_0" on storage.objects;
drop policy if exists "Insert gxhezc_1" on storage.objects;
drop policy if exists "Insert gxhezc_2" on storage.objects;
drop policy if exists "Insert gxhezc_3" on storage.objects;

drop policy if exists "fiches_photos_select_authenticated" on storage.objects;
drop policy if exists "fiches_photos_insert_authenticated" on storage.objects;
drop policy if exists "fiches_photos_update_authenticated" on storage.objects;
drop policy if exists "fiches_photos_delete_authenticated" on storage.objects;

create policy "fiches_photos_select_authenticated"
  on storage.objects for select to authenticated
  using (bucket_id = 'fiches-photos');

create policy "fiches_photos_insert_authenticated"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'fiches-photos');

create policy "fiches_photos_update_authenticated"
  on storage.objects for update to authenticated
  using (bucket_id = 'fiches-photos')
  with check (bucket_id = 'fiches-photos');

create policy "fiches_photos_delete_authenticated"
  on storage.objects for delete to authenticated
  using (bucket_id = 'fiches-photos');
