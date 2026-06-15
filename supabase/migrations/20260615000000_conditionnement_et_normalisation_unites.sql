-- ─────────────────────────────────────────────────────────────────────────────
-- Conditionnement des ingrédients + normalisation des unités
--
-- 1) Ajoute `conditionnement` sur ingredients / ingredients_bar : nombre d'unités
--    d'utilisation (unité de la recette) contenues dans UN achat.
--    Ex : poulpe vendu par unité de 10 tentacules → unite='u', conditionnement=10.
--        chocolat vendu par pack de 3 kg → unite='kg', conditionnement=3.
--    Le prix de référence (prix_kg) est alors le prix PAR unité d'utilisation,
--    calculé à l'enregistrement d'une facture = prix_ligne / conditionnement.
--
-- 2) Normalise les unités saisies en texte libre vers une forme canonique
--    ("Kg" → "kg", "Litre" → "L"…) sur ingredients, ingredients_bar et
--    achats_lignes, pour fiabiliser rapprochements et mercuriale.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Colonne conditionnement (défaut 1 = acheté directement dans l'unité d'usage)
alter table public.ingredients
  add column if not exists conditionnement numeric not null default 1;
alter table public.ingredients_bar
  add column if not exists conditionnement numeric not null default 1;

comment on column public.ingredients.conditionnement is
  'Nombre d''unités d''utilisation (unite) contenues dans un achat. prix_kg = prix d''achat / conditionnement.';
comment on column public.ingredients_bar.conditionnement is
  'Nombre d''unités d''utilisation (unite) contenues dans un achat. prix_kg = prix d''achat / conditionnement.';

-- 2. Normalisation des unités texte libre existantes.
do $$
declare
  tbl text;
begin
  foreach tbl in array array['ingredients', 'ingredients_bar', 'achats_lignes']
  loop
    execute format($f$
      update public.%I set unite = case lower(trim(both '. ' from unite))
        when 'kg' then 'kg' when 'kgs' then 'kg' when 'kilo' then 'kg' when 'kilos' then 'kg'
          when 'kilogramme' then 'kg' when 'kilogrammes' then 'kg'
        when 'g' then 'g' when 'gr' then 'g' when 'grs' then 'g'
          when 'gramme' then 'g' when 'grammes' then 'g'
        when 'l' then 'L' when 'litre' then 'L' when 'litres' then 'L' when 'lt' then 'L'
        when 'cl' then 'cl' when 'centilitre' then 'cl' when 'centilitres' then 'cl'
        when 'ml' then 'ml' when 'millilitre' then 'ml' when 'millilitres' then 'ml'
        when 'u' then 'u' when 'un' then 'u' when 'unite' then 'u' when 'unites' then 'u'
          when 'unité' then 'u' when 'unités' then 'u' when 'ea' then 'u' when 'article' then 'u'
        when 'piece' then 'pièce' when 'pieces' then 'pièce'
          when 'pièce' then 'pièce' when 'pièces' then 'pièce'
          when 'pce' then 'pièce' when 'pcs' then 'pièce' when 'pc' then 'pièce'
        when 'botte' then 'botte' when 'bottes' then 'botte'
        when 'bouteille' then 'bouteille' when 'bouteilles' then 'bouteille'
          when 'btl' then 'bouteille' when 'bt' then 'bouteille'
        when 'portion' then 'portions' when 'portions' then 'portions'
        else unite
      end
      where unite is not null and trim(unite) <> '';
    $f$, tbl);
  end loop;
end $$;
