import { supabase } from './supabase'

/** 20 ingrédients de base (prix indicatifs). */
export const STARTER_INGREDIENTS = [
  { nom: 'Sel fin', prix_kg: 2.5, unite: 'kg' },
  { nom: 'Poivre noir', prix_kg: 28, unite: 'kg' },
  { nom: 'Beurre doux', prix_kg: 9.5, unite: 'kg' },
  { nom: 'Huile d\'olive', prix_kg: 12, unite: 'L' },
  { nom: 'Oignon jaune', prix_kg: 1.8, unite: 'kg' },
  { nom: 'Farine T55', prix_kg: 1.2, unite: 'kg' },
  { nom: 'Œuf', prix_kg: 0.35, unite: 'u' },
  { nom: 'Crème 35%', prix_kg: 6.2, unite: 'L' },
  { nom: 'Pain burger', prix_kg: 1.2, unite: 'u' },
  { nom: 'Steak haché 15%', prix_kg: 14, unite: 'kg' },
  { nom: 'Cheddar', prix_kg: 18, unite: 'kg' },
  { nom: 'Cornichons', prix_kg: 8, unite: 'kg' },
  { nom: 'Ketchup', prix_kg: 4.5, unite: 'kg' },
  { nom: 'Moutarde de Dijon', prix_kg: 6, unite: 'kg' },
  { nom: 'Laitue iceberg', prix_kg: 3.2, unite: 'kg' },
  { nom: 'Tomate', prix_kg: 3.5, unite: 'kg' },
  { nom: 'Ail', prix_kg: 12, unite: 'kg' },
  { nom: 'Persil', prix_kg: 1.8, unite: 'botte' },
  { nom: 'Paprika', prix_kg: 22, unite: 'kg' },
  { nom: 'Sauce BBQ', prix_kg: 8.5, unite: 'L' },
]

const DEMO_FICHE_NOM = 'Burger Signature'

/** Lignes démo (noms = STARTER_INGREDIENTS), 4 portions. */
const DEMO_RECIPE_LINES = [
  { nom: 'Pain burger', quantite: 4, unite: 'u' },
  { nom: 'Steak haché 15%', quantite: 0.6, unite: 'kg' },
  { nom: 'Cheddar', quantite: 0.08, unite: 'kg' },
  { nom: 'Oignon jaune', quantite: 0.06, unite: 'kg' },
  { nom: 'Tomate', quantite: 0.1, unite: 'kg' },
  { nom: 'Laitue iceberg', quantite: 0.05, unite: 'kg' },
  { nom: 'Cornichons', quantite: 0.04, unite: 'kg' },
  { nom: 'Sauce BBQ', quantite: 0.06, unite: 'L' },
  { nom: 'Huile d\'olive', quantite: 0.02, unite: 'L' },
  { nom: 'Moutarde de Dijon', quantite: 0.015, unite: 'kg' },
  { nom: 'Sel fin', quantite: 0.002, unite: 'kg' },
  { nom: 'Poivre noir', quantite: 0.001, unite: 'kg' },
]

const DEMO_ALLERGENES = ['gluten', 'lait', 'oeufs', 'moutarde']

function localStarterDoneKey(clientId) {
  return `sk_starter_kit_done_${clientId}`
}

/**
 * Nouvel établissement : souvent aucune ligne dans `categories_ingredients` alors que `ingredients.categorie_id` est NOT NULL.
 * Aligné sur `app/ingredients/page.js` (insert avec categorie_id optionnel).
 */
async function ensureDefaultIngredientCategory(db, clientId) {
  const { data: first, error: selErr } = await db
    .from('categories_ingredients')
    .select('id')
    .eq('client_id', clientId)
    .order('ordre', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (selErr) {
    console.error('[starterKit] categories_ingredients.select', selErr)
    return null
  }
  if (first?.id) return first.id

  const { data: created, error: insErr } = await db
    .from('categories_ingredients')
    .insert({
      nom: 'Non classé',
      emoji: '📦',
      client_id: clientId,
      ordre: 1,
    })
    .select('id')
    .single()

  if (insErr) {
    console.error('[starterKit] categories_ingredients.insert (défaut)', insErr)
    return null
  }
  return created?.id ?? null
}

/**
 * Objet aligné sur les inserts existants (cuisine) : `nom`, `prix_kg`, `unite`, `client_id`, `est_sous_fiche`, `categorie_id`.
 * Pas de `prix_achat` dans ce dépôt — la colonne attendue est `prix_kg`.
 */
function buildIngredientRows(clientId, categorieId) {
  return STARTER_INGREDIENTS.map((r) => {
    const row = {
      nom: r.nom,
      prix_kg: r.prix_kg,
      unite: r.unite,
      client_id: clientId,
      est_sous_fiche: false,
    }
    if (categorieId != null) row.categorie_id = categorieId
    return row
  })
}

/**
 * Noyau du starter kit : inserts via le client Supabase fourni (anon côté navigateur, service_role côté API).
 * @param {import('@supabase/supabase-js').SupabaseClient} db
 * @param {{ checkLocalStorage?: boolean }} opts
 */
async function seedStarterKitWithClient(db, userId, clientId, opts = {}) {
  const { checkLocalStorage = false, force = false } = opts
  if (!clientId) return { seeded: false, skipped: 'no_client' }

  try {
    if (checkLocalStorage && !force && typeof window !== 'undefined') {
      try {
        if (window.localStorage.getItem(localStarterDoneKey(clientId)) === '1') {
          return { seeded: false, skipped: 'local_flag' }
        }
      } catch {
        // no-op
      }
    }

    const { data: clientRow } = await db
      .from('clients')
      .select('starter_kit_seeded_at')
      .eq('id', clientId)
      .maybeSingle()

    if (!force && clientRow?.starter_kit_seeded_at) {
      return { seeded: false, skipped: 'already_seeded' }
    }

    if (force && clientRow?.starter_kit_seeded_at) {
      await db.from('clients').update({ starter_kit_seeded_at: null }).eq('id', clientId)
    }

    const { data: demoExists } = await db
      .from('fiches')
      .select('id')
      .eq('client_id', clientId)
      .ilike('nom', `${DEMO_FICHE_NOM}%`)
      .limit(1)
      .maybeSingle()

    if (demoExists?.id) {
      if (force) {
        await db
          .from('fiche_ingredients')
          .delete()
          .eq('fiche_id', demoExists.id)
          .eq('client_id', clientId)
        await db.from('fiches').delete().eq('id', demoExists.id).eq('client_id', clientId)
        console.warn('[starterKit] force: ancienne fiche démo supprimée pour régénération (client_id:', clientId, ')')
      } else {
        await db
          .from('clients')
          .update({ starter_kit_seeded_at: new Date().toISOString() })
          .eq('id', clientId)
        console.warn(
          '[starterKit] skip demo_exists: une fiche nommée comme la démo existe déjà (sans force, pas de nouvel insert)',
        )
        return { seeded: false, skipped: 'demo_exists' }
      }
    }

    const { count: ingCount } = await db
      .from('ingredients')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', clientId)
      .eq('est_sous_fiche', false)

    if ((ingCount ?? 0) > 0) {
      await db
        .from('clients')
        .update({ starter_kit_seeded_at: new Date().toISOString() })
        .eq('id', clientId)
      if (force) {
        console.warn('[starterKit] force ignoré: des ingrédients existent déjà (évite les doublons)')
        return { seeded: false, skipped: 'has_ingredients' }
      }
      return { seeded: false, skipped: 'has_ingredients' }
    }

    const categorieId = await ensureDefaultIngredientCategory(db, clientId)
    const rows = buildIngredientRows(clientId, categorieId)

    const { data: insertedIngs, error: errIng } = await db
      .from('ingredients')
      .insert(rows)
      .select('id, nom')

    if (errIng || !insertedIngs?.length) {
      console.error("[starterKit] Détail de l'erreur d'insertion:", errIng)
      console.error(
        "[starterKit] Détail de l'erreur d'insertion (sérialisé):",
        errIng
          ? JSON.stringify(
              {
                message: errIng.message,
                code: errIng.code,
                details: errIng.details,
                hint: errIng.hint,
              },
              null,
              2,
            )
          : '(null)',
      )
      return { seeded: false, skipped: 'insert_ingredients_failed' }
    }

    const byNom = Object.fromEntries(insertedIngs.map((i) => [i.nom, i.id]))

    let { data: catPlat } = await db
      .from('categories_plats')
      .select('id')
      .eq('client_id', clientId)
      .eq('section', 'cuisine')
      .eq('nom', 'Plats')
      .maybeSingle()

    if (!catPlat) {
      const { data: anyCat } = await db
        .from('categories_plats')
        .select('id')
        .eq('client_id', clientId)
        .eq('section', 'cuisine')
        .order('ordre')
        .limit(1)
        .maybeSingle()
      catPlat = anyCat
    }

    let coutBrut = 0
    for (const line of DEMO_RECIPE_LINES) {
      const ingId = byNom[line.nom]
      const meta = STARTER_INGREDIENTS.find((s) => s.nom === line.nom)
      if (ingId && meta?.prix_kg) {
        coutBrut += meta.prix_kg * line.quantite
      }
    }

    const nbPortions = 4
    const coutPortion = coutBrut / nbPortions
    const prixTTC = 48

    const { data: fiche, error: errFiche } = await db
      .from('fiches')
      .insert([
        {
          nom: DEMO_FICHE_NOM,
          categorie: 'Plats',
          categorie_plat_id: catPlat?.id || null,
          nb_portions: nbPortions,
          prix_ttc: prixTTC,
          description:
            'Fiche de démonstration — explorez les ingrédients, le food cost et les allergènes. Modifiez ou supprimez-la quand vous voulez.',
          saison: 'Printemps 2026',
          allergenes: DEMO_ALLERGENES,
          cout_portion: parseFloat(coutPortion.toFixed(4)),
          perte: 0,
          client_id: clientId,
          is_sub_fiche: false,
          archive: false,
        },
      ])
      .select('id')
      .single()

    if (errFiche || !fiche) {
      console.error('starterKit: fiche', errFiche)
      return { seeded: false, skipped: 'insert_fiche_failed' }
    }

    const fiRows = DEMO_RECIPE_LINES.map((line) => {
      const ingredient_id = byNom[line.nom]
      if (!ingredient_id) return null
      return {
        fiche_id: fiche.id,
        ingredient_id,
        quantite: line.quantite,
        unite: line.unite,
        client_id: clientId,
      }
    }).filter(Boolean)

    if (fiRows.length) {
      const { error: errFi } = await db.from('fiche_ingredients').insert(fiRows)
      if (errFi) console.error('starterKit: fiche_ingredients', errFi)
    }

    const { error: errClient } = await db
      .from('clients')
      .update({ starter_kit_seeded_at: new Date().toISOString() })
      .eq('id', clientId)

    if (errClient && typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(localStarterDoneKey(clientId), '1')
      } catch {
        // no-op
      }
    }

    void userId
    return { seeded: true }
  } catch (e) {
    console.error('starterKit', e)
    return { seeded: false, skipped: 'exception' }
  }
}

/**
 * Seed ingrédients + fiche démo une fois par établissement (navigateur, session utilisateur + RLS).
 * @param {string} userId — auth user (traçabilité)
 * @returns {Promise<{ seeded: boolean, skipped?: string }>}
 */
export async function seedUserIngredients(userId, clientId) {
  return seedStarterKitWithClient(supabase, userId, clientId, { checkLocalStorage: true })
}

/**
 * Seed starter kit côté serveur (service role) — ex. après inscription (`complete-registration`).
 * @param {string} clientId — UUID du nouvel établissement
 * @param {{ force?: boolean }} [options] — `force`: ignore drapeaux / supprime fiche démo orpheline (bouton dashboard).
 */
export async function seedStarterKit(clientId, options = {}) {
  const { getServiceClient } = await import('./apiGuards')
  return seedStarterKitWithClient(getServiceClient(), null, clientId, {
    checkLocalStorage: false,
    force: Boolean(options.force),
  })
}
