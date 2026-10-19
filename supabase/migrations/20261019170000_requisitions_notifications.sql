-- Réquisitions, étape 7 : notifications.
--
-- Une notification prévient un utilisateur qu'une réquisition l'attend ou a
-- avancé : nouvelle commande à préparer, demande à valider, demande validée,
-- livrée ou refusée. Elle est affichée en pop-up / pastille à la connexion
-- et doublée d'un email (Resend). Les textes sont construits à l'affichage
-- (type + données), dans la langue de l'utilisateur.
--
-- Écriture : uniquement par l'API (service_role), au moment de l'action.
-- Lecture : ses propres notifications, dans un établissement auquel on a
-- encore accès (motif « une fois par requête »). Marquer comme lu passe par
-- l'API (pas de policy UPDATE).

CREATE TABLE IF NOT EXISTS public.notifications (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       uuid        NOT NULL REFERENCES public.clients (id) ON DELETE CASCADE,
  user_id         uuid        NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  type            text        NOT NULL CHECK (type IN (
                                'requisition_a_preparer', 'requisition_a_valider',
                                'requisition_validee', 'requisition_livree', 'requisition_refusee')),
  requisition_id  uuid,
  donnees         jsonb       NOT NULL DEFAULT '{}'::jsonb,
  lu_at           timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notifications_requisition_fkey FOREIGN KEY (requisition_id, client_id)
    REFERENCES public.requisitions (id, client_id) ON DELETE CASCADE
);

COMMENT ON TABLE public.notifications IS
  'Notifications in-app (pop-up / pastille) des réquisitions, doublées d''un email.';

-- Non lues d'un utilisateur dans un établissement (la requête du pop-up).
CREATE INDEX IF NOT EXISTS notifications_user_non_lues_idx
  ON public.notifications (user_id, client_id, created_at DESC) WHERE lu_at IS NULL;
CREATE INDEX IF NOT EXISTS notifications_user_idx
  ON public.notifications (user_id, client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_requisition_idx
  ON public.notifications (requisition_id) WHERE requisition_id IS NOT NULL;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notifications_select ON public.notifications;
CREATE POLICY notifications_select ON public.notifications FOR SELECT TO authenticated
  USING ((user_id = (SELECT auth.uid()))
         AND (client_id IN (SELECT public.my_client_ids())));

REVOKE ALL ON public.notifications FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.notifications FROM authenticated;
