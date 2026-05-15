-- ============================================================================
-- ingredients : remplace l'UNIQUE global sur `nom` par un UNIQUE (client_id, nom)
--
-- Bug historique : la contrainte `ingredients_nom_unique UNIQUE (nom)` était
-- globale, donc deux clients distincts (ex : Joia et Marsan) ne pouvaient pas
-- créer un ingrédient portant le même nom (ex : "TRANSPORT"). L'UI remontait
-- "L'ingrédient X est déjà utilisé par un autre établissement" — mais en
-- réalité les data des établissements doivent être strictement isolées.
--
-- Cette migration scope la contrainte au tenant en remplaçant `(nom)` par
-- `(client_id, nom)`. Aucun doublon par (client_id, nom) en base avant
-- migration (vérifié en amont).
--
-- Le code applicatif (`findOrCreateIngredient`) normalise déjà le nom en
-- UPPERCASE et fait son lookup par `ilike`, donc la contrainte sensible à la
-- casse au niveau SQL est suffisante en pratique.
-- ============================================================================

ALTER TABLE public.ingredients
  DROP CONSTRAINT IF EXISTS ingredients_nom_unique;

ALTER TABLE public.ingredients
  ADD CONSTRAINT ingredients_client_nom_unique
  UNIQUE (client_id, nom);

COMMENT ON CONSTRAINT ingredients_client_nom_unique ON public.ingredients IS
  'Chaque client a son propre namespace de noms d''ingrédients. Avant 2026-05-15, la contrainte était UNIQUE (nom) global, ce qui faisait collisionner deux établissements distincts sur le même nom.';
