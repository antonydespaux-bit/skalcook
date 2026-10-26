-- ============================================================================
-- Import du CA journalier depuis l'export « tickets » de Lightspeed
-- (Rapport des reçus) + export « Départements » (optionnel).
--
-- 1. ca_import_reglages : réglages propres à chaque établissement
--      - heure de coupure de la journée (défaut 05:30, comme Lightspeed) et
--        fin du service du midi (défaut 18:30) ;
--      - lieux : profil Lightspeed → lieu par défaut + lieux possibles
--        (ex. Table de partage → Salle à manger ou Privat, choisi à l'import) ;
--      - départements : département Lightspeed → colonne du suivi CA.
-- 2. ca_imports : journal des imports (empreinte des fichiers pour repérer
--    un fichier déjà importé).
--
-- Droits : fonctionnalité 'ventes' (lecture / modification), comme
-- ca_journalier. Motif RLS évalué une fois par requête.
-- ============================================================================

create table if not exists public.ca_import_reglages (
  client_id uuid primary key references public.clients (id) on delete cascade,
  coupure_jour time not null default '05:30',
  fin_midi time not null default '18:30',
  -- { "<profil normalisé>": { "libelle": "Table de Partage", "defaut": "<lieu_id>", "possibles": ["<lieu_id>", ...] } }
  lieux jsonb not null default '{}'::jsonb,
  -- { "<département normalisé>": { "libelle": "Boissons sans alcool", "colonne": "ca_bev_10" } }
  departements jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

comment on table public.ca_import_reglages is
  'Réglages par établissement de l''import du CA depuis Lightspeed (tickets + départements).';

create table if not exists public.ca_imports (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  jour_debut date not null,
  jour_fin date not null,
  -- [{ "nom": "marsan_tickets_….csv", "empreinte": "<sha-256>", "type": "tickets" }]
  fichiers jsonb not null default '[]'::jsonb,
  cellules integer not null default 0,
  total numeric(12, 2) not null default 0,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

comment on table public.ca_imports is
  'Journal des imports du CA depuis Lightspeed (repère les fichiers déjà importés).';

create index if not exists ca_imports_client_idx on public.ca_imports (client_id, created_at desc);

drop trigger if exists trg_ca_import_reglages_updated_at on public.ca_import_reglages;
create trigger trg_ca_import_reglages_updated_at
  before update on public.ca_import_reglages
  for each row execute function public.ca_set_updated_at();

alter table public.ca_import_reglages enable row level security;
alter table public.ca_imports enable row level security;

create policy ca_import_reglages_select on public.ca_import_reglages for select to authenticated
  using (((select public.get_my_is_superadmin()) is true) or client_id in (select public.my_client_ids_for('ventes', 'lecture')));
create policy ca_import_reglages_insert on public.ca_import_reglages for insert to authenticated
  with check (((select public.get_my_is_superadmin()) is true) or client_id in (select public.my_client_ids_for('ventes', 'modification')));
create policy ca_import_reglages_update on public.ca_import_reglages for update to authenticated
  using (((select public.get_my_is_superadmin()) is true) or client_id in (select public.my_client_ids_for('ventes', 'modification')))
  with check (((select public.get_my_is_superadmin()) is true) or client_id in (select public.my_client_ids_for('ventes', 'modification')));

create policy ca_imports_select on public.ca_imports for select to authenticated
  using (((select public.get_my_is_superadmin()) is true) or client_id in (select public.my_client_ids_for('ventes', 'lecture')));
create policy ca_imports_insert on public.ca_imports for insert to authenticated
  with check (((select public.get_my_is_superadmin()) is true) or client_id in (select public.my_client_ids_for('ventes', 'modification')));

revoke all on public.ca_import_reglages from anon;
revoke all on public.ca_imports from anon;
grant select, insert, update on public.ca_import_reglages to authenticated;
grant select, insert on public.ca_imports to authenticated;
grant all on public.ca_import_reglages to service_role;
grant all on public.ca_imports to service_role;
