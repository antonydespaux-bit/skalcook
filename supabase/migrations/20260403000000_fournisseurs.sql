-- ─── Table fournisseurs ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fournisseurs (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id  uuid        NOT NULL,
  nom        text        NOT NULL,
  adresse    text,
  telephone  text,
  email      text,
  siret      text,
  notes      text,
  created_at timestamptz DEFAULT now()
);

-- Index pour les recherches par client
CREATE INDEX IF NOT EXISTS fournisseurs_client_id_idx ON fournisseurs (client_id);

-- ─── Colonne taux_tva sur achats_factures ────────────────────────────────────
-- Permet de stocker le taux de TVA (%) par facture pour calculer le TTC
ALTER TABLE achats_factures ADD COLUMN IF NOT EXISTS taux_tva numeric;

-- ─── Lien optionnel achats_factures → fournisseurs ───────────────────────────
ALTER TABLE achats_factures ADD COLUMN IF NOT EXISTS fournisseur_id uuid REFERENCES fournisseurs(id) ON DELETE SET NULL;
