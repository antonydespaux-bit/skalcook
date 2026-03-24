-- Seeding automatique lors de la création d’un nouvel établissement (client)
-- Objectif: créer des catégories de plats (categories_plats) et des lieux (lieux)
-- pour que l’établissement soit prêt à l’emploi.
-- Hors scope volontairement: categories_ingredients (écran matières premières) — uniquement plats / fiches.
--
-- Notes:
-- - Cette seed est idempotente par (client_id, section, nom) via NOT EXISTS.
-- - Elle s’appuie sur les colonnes utilisées par l’application:
--   - lieux: (client_id, nom, emoji, section, ordre)
--   - categories_plats: (client_id, nom, emoji, section, ordre)
--
-- Procédure recommandée:
-- - Coller ce fichier dans Supabase (SQL Editor) ou le mettre dans une migration.

-- 1) Fonction de seeding (appelée par le trigger)
create or replace function public.seed_client_defaults(p_client_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Catégories cuisine
  insert into public.categories_plats (client_id, nom, emoji, section, ordre)
  select
    p_client_id,
    v.nom,
    v.emoji,
    'cuisine',
    v.ordre
  from (
    values
      ('Crudo', '🥗', 1),
      ('Entrées', '🍖', 2),
      ('Plats', '🍮', 3),
      ('Plats à partager', '🥪', 4),
      ('Accompagnements', '⚙️', 5),
      ('Desserts', '🍰', 6),
      ('Café', '🥤', 7),
      ('Brunch', '🍺', 8),
      ('Roof Top', '🫕', 9),
      ('Room Service', '🥃', 10),
      ('Events', '🍾', 11),
      ('Sous-fiche', '🧃', 12)
  ) as v(nom, emoji, ordre)
  where not exists (
    select 1
    from public.categories_plats cp
    where cp.client_id = p_client_id
      and cp.section = 'cuisine'
      and cp.nom = v.nom
  );

  -- Catégories bar
  insert into public.categories_plats (client_id, nom, emoji, section, ordre)
  select
    p_client_id,
    v.nom,
    v.emoji,
    'bar',
    v.ordre
  from (
    values
      ('Sous-fiche', '🧃', 1),
      ('Cocktails', '🍹', 2),
      ('Vins', '🍷', 3),
      ('Champagnes', '🍾', 4),
      ('Bières', '🍺', 5),
      ('Spiritueux', '🥘', 6),
      ('Crudo', '🥗', 7),
      ('Entrées', '🍖', 8),
      ('Plats', '🍮', 9),
      ('Plats à partager', '🥪', 10),
      ('Accompagnements', '⚙️', 11),
      ('Desserts', '🍰', 12),
      ('Café', '🥤', 13),
      ('Brunch', '🥩', 14),
      ('Roof Top', '🫕', 15),
      ('Room Service', '🥃', 16),
      ('Events', '🧀', 17)
  ) as v(nom, emoji, ordre)
  where not exists (
    select 1
    from public.categories_plats cp
    where cp.client_id = p_client_id
      and cp.section = 'bar'
      and cp.nom = v.nom
  );

  -- Lieux cuisine (lieux de service)
  insert into public.lieux (client_id, nom, emoji, section, ordre)
  select
    p_client_id,
    v.nom,
    v.emoji,
    'cuisine',
    v.ordre
  from (
    values
      ('Salle', '🏨', 1),
      ('Terrasse', '🌅', 2)
  ) as v(nom, emoji, ordre)
  where not exists (
    select 1
    from public.lieux l
    where l.client_id = p_client_id
      and l.section = 'cuisine'
      and l.nom = v.nom
  );

  -- Lieux bar (lieux de service)
  insert into public.lieux (client_id, nom, emoji, section, ordre)
  select
    p_client_id,
    v.nom,
    v.emoji,
    'bar',
    v.ordre
  from (
    values
      ('Bar', '🍸', 1),
      ('Salon', '🎭', 2),
      ('Terrasse', '🌅', 3)
  ) as v(nom, emoji, ordre)
  where not exists (
    select 1
    from public.lieux l
    where l.client_id = p_client_id
      and l.section = 'bar'
      and l.nom = v.nom
  );
end;
$$;

-- 2) Trigger: après création d’un client dans `clients`
create or replace function public.__trigger_seed_client_defaults()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.seed_client_defaults(new.id);
  return new;
end;
$$;

drop trigger if exists seed_client_defaults_after_insert on public.clients;

create trigger seed_client_defaults_after_insert
after insert on public.clients
for each row
execute function public.__trigger_seed_client_defaults();

