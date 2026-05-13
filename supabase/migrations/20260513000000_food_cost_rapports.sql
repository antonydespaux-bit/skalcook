-- ============================================================================
-- food_cost_rapports : rapports de food cost ratio sauvegardés.
--
-- Un rapport = un couple (période début, période fin) sur un client donné.
-- Le CA Food et les achats sont recalculés live depuis ca_journalier et
-- achats_factures ; seuls sont persistés ici l'inventaire de début/fin
-- (saisis manuellement, HT) et les ajustements (table fille).
--
-- Ratio food cost = (inv_debut + achats - inv_fin + Σ ajustements) / CA_food_ht
--                   × 100
--
-- Inventaires optionnels : si NULL, traités comme 0 dans le calcul et un
-- avertissement est affiché côté UI ("ratio approximatif").
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.food_cost_rapports (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id             uuid        NOT NULL REFERENCES public.clients (id) ON DELETE CASCADE,
  periode_debut         date        NOT NULL,
  periode_fin           date        NOT NULL,
  inventaire_debut_ht   numeric(12,2),
  inventaire_fin_ht     numeric(12,2),
  notes                 text        NOT NULL DEFAULT '',
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  created_by            uuid        REFERENCES auth.users (id) ON DELETE SET NULL,
  deleted_at            timestamptz,
  CONSTRAINT food_cost_rapports_dates_check CHECK (periode_fin >= periode_debut)
);

-- Une seule période active par client (soft-delete permet de recréer un
-- rapport sur la même fenêtre si l'ancien est archivé).
CREATE UNIQUE INDEX IF NOT EXISTS food_cost_rapports_periode_uniq
  ON public.food_cost_rapports (client_id, periode_debut, periode_fin)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS food_cost_rapports_client_debut_idx
  ON public.food_cost_rapports (client_id, periode_debut DESC)
  WHERE deleted_at IS NULL;

COMMENT ON TABLE public.food_cost_rapports IS
  'Rapports food cost ratio : inventaires début/fin (optionnels) et ajustements (table fille). CA et achats recalculés live.';

DROP TRIGGER IF EXISTS trg_food_cost_rapports_updated_at ON public.food_cost_rapports;
CREATE TRIGGER trg_food_cost_rapports_updated_at
  BEFORE UPDATE ON public.food_cost_rapports
  FOR EACH ROW EXECUTE FUNCTION public.ca_set_updated_at();

ALTER TABLE public.food_cost_rapports ENABLE ROW LEVEL SECURITY;
CREATE POLICY food_cost_rapports_select ON public.food_cost_rapports FOR SELECT TO authenticated
  USING (public.user_has_client_access(client_id));
CREATE POLICY food_cost_rapports_insert ON public.food_cost_rapports FOR INSERT TO authenticated
  WITH CHECK (public.user_has_client_access(client_id));
CREATE POLICY food_cost_rapports_update ON public.food_cost_rapports FOR UPDATE TO authenticated
  USING (public.user_has_client_access(client_id))
  WITH CHECK (public.user_has_client_access(client_id));
CREATE POLICY food_cost_rapports_delete ON public.food_cost_rapports FOR DELETE TO authenticated
  USING (public.user_has_client_access(client_id));


-- ============================================================================
-- food_cost_ajustements : entrées libres ajoutées/retranchées au coût matière.
--
-- Ex. "Repas staff : -350", "Casse cave : +120", "Cadeau client : -80".
-- montant signé : valeur positive = ajout au coût ; valeur négative = déduction.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.food_cost_ajustements (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  rapport_id   uuid        NOT NULL REFERENCES public.food_cost_rapports (id) ON DELETE CASCADE,
  client_id    uuid        NOT NULL REFERENCES public.clients (id) ON DELETE CASCADE,
  libelle      text        NOT NULL,
  montant      numeric(12,2) NOT NULL,
  commentaire  text        NOT NULL DEFAULT '',
  created_at   timestamptz NOT NULL DEFAULT now(),
  created_by   uuid        REFERENCES auth.users (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS food_cost_ajustements_rapport_idx
  ON public.food_cost_ajustements (rapport_id);

COMMENT ON TABLE public.food_cost_ajustements IS
  'Lignes d''ajustement libres rattachées à un rapport food cost (repas staff, casse, cadeaux, etc.). Montant signé.';

ALTER TABLE public.food_cost_ajustements ENABLE ROW LEVEL SECURITY;
CREATE POLICY food_cost_ajustements_select ON public.food_cost_ajustements FOR SELECT TO authenticated
  USING (public.user_has_client_access(client_id));
CREATE POLICY food_cost_ajustements_insert ON public.food_cost_ajustements FOR INSERT TO authenticated
  WITH CHECK (public.user_has_client_access(client_id));
CREATE POLICY food_cost_ajustements_update ON public.food_cost_ajustements FOR UPDATE TO authenticated
  USING (public.user_has_client_access(client_id))
  WITH CHECK (public.user_has_client_access(client_id));
CREATE POLICY food_cost_ajustements_delete ON public.food_cost_ajustements FOR DELETE TO authenticated
  USING (public.user_has_client_access(client_id));
