-- ============================================================================
-- Bucket "devis" — stockage privé des PDFs de devis générés.
--
-- Convention de chemin : {client_id}/{devis_id}.pdf
--   - client_id = tenant id (public.clients.id)
--   - le 1er segment du path sert à la policy RLS
--
-- Bucket privé (public = false) : les PDFs ne sont accessibles que via
-- signed URL générée côté serveur. Les policies storage.objects autorisent
-- lecture/écriture uniquement aux users ayant accès au tenant.
-- ============================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('devis', 'devis', false)
ON CONFLICT (id) DO NOTHING;

-- ─── Policies storage.objects (bucket = 'devis') ────────────────────────────
-- Path format attendu : `{client_id}/...` — on check que le 1er segment est
-- un tenant auquel l'utilisateur a accès.

DROP POLICY IF EXISTS crm_devis_bucket_select ON storage.objects;
CREATE POLICY crm_devis_bucket_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'devis'
    AND public.user_has_client_access(
      ((storage.foldername(name))[1])::uuid
    )
  );

DROP POLICY IF EXISTS crm_devis_bucket_insert ON storage.objects;
CREATE POLICY crm_devis_bucket_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'devis'
    AND public.user_has_client_access(
      ((storage.foldername(name))[1])::uuid
    )
  );

DROP POLICY IF EXISTS crm_devis_bucket_update ON storage.objects;
CREATE POLICY crm_devis_bucket_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'devis'
    AND public.user_has_client_access(
      ((storage.foldername(name))[1])::uuid
    )
  )
  WITH CHECK (
    bucket_id = 'devis'
    AND public.user_has_client_access(
      ((storage.foldername(name))[1])::uuid
    )
  );

DROP POLICY IF EXISTS crm_devis_bucket_delete ON storage.objects;
CREATE POLICY crm_devis_bucket_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'devis'
    AND public.user_has_client_access(
      ((storage.foldername(name))[1])::uuid
    )
  );
