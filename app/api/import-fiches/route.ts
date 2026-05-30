import { apiHandler } from '../../../lib/apiHandler'
import { z } from 'zod'

// Import en masse de fiches techniques (cuisine) depuis un fichier Excel parsé
// côté client. Format "long" : une ligne par ingrédient, regroupée par fiche.
//
// Stratégie (tout en batch, service_role => RLS bypassée mais scope forcé au
// client_id de la cible, déjà vérifié par le guard adminOrSuperadmin) :
//   1. Crée les ingrédients du catalogue absents (prix = prix_ht fourni ou 0).
//   2. Crée les catégories de plat absentes.
//   3. Skip les fiches dont le nom existe déjà (évite les doublons au ré-import).
//   4. Insère les fiches (cout_portion calculé ici, même formule que la RPC
//      recalculer_cout_portions : SUM(prix_kg * quantite) / nb_portions).
//   5. Insère les lignes fiche_ingredients.

const ligneSchema = z.object({
  ingredient: z.string().trim().min(1),
  quantite: z.coerce.number().nonnegative(),
  unite: z.string().trim().optional().default('kg'),
  prix_ht: z.coerce.number().nonnegative().nullable().optional(),
})

const ficheSchema = z.object({
  nom: z.string().trim().min(1),
  categorie: z.string().trim().optional().default(''),
  nb_portions: z.coerce.number().positive(),
  prix_ttc: z.coerce.number().nonnegative().nullable().optional(),
  lignes: z.array(ligneSchema).default([]),
})

const importFichesSchema = z.object({
  client_id: z.string().uuid(),
  fiches: z.array(ficheSchema).min(1).max(2000),
})

const norm = (s: string) => s.toLowerCase().trim()

async function batchInsert<T>(
  db: ReturnType<typeof import('../../../lib/apiGuards').getServiceClient>,
  table: string,
  rows: T[],
  select: string
) {
  const out: Record<string, unknown>[] = []
  const size = 200
  for (let i = 0; i < rows.length; i += size) {
    const chunk = rows.slice(i, i + size)
    const { data, error } = await db.from(table).insert(chunk).select(select)
    if (error) throw new Error(`${table}: ${error.message}`)
    if (data) out.push(...data)
  }
  return out
}

export const POST = apiHandler({
  schema: importFichesSchema,
  guard: 'adminOrSuperadmin',
  clientIdFrom: 'body.client_id',
  handler: async ({ data, db }) => {
    const clientId = data.client_id
    const fiches = data.fiches

    // ── 1. Catalogue d'ingrédients existant ──────────────────────────────────
    const { data: existingIngs, error: errIngs } = await db
      .from('ingredients')
      .select('id, nom, prix_kg')
      .eq('client_id', clientId)
    if (errIngs) return Response.json({ error: errIngs.message }, { status: 500 })

    const ingMap = new Map<string, { id: string; prix_kg: number | null }>()
    for (const ing of existingIngs ?? []) {
      ingMap.set(norm(ing.nom), { id: ing.id, prix_kg: ing.prix_kg })
    }

    // ── 2. Ingrédients absents → création (1ère occurrence dans le fichier) ───
    const missing = new Map<string, { nom: string; prix: number }>()
    for (const f of fiches) {
      for (const l of f.lignes) {
        const key = norm(l.ingredient)
        if (!key || ingMap.has(key) || missing.has(key)) continue
        missing.set(key, { nom: l.ingredient.trim(), prix: l.prix_ht ?? 0 })
      }
    }

    let ingredientsCrees = 0
    if (missing.size > 0) {
      const toInsert = [...missing.values()].map((m) => ({
        nom: m.nom,
        prix_kg: m.prix,
        unite: 'kg',
        client_id: clientId,
      }))
      const created = await batchInsert(db, 'ingredients', toInsert, 'id, nom, prix_kg')
      for (const c of created as Array<{ id: string; nom: string; prix_kg: number | null }>) {
        ingMap.set(norm(c.nom), { id: c.id, prix_kg: c.prix_kg })
      }
      ingredientsCrees = created.length
    }

    // ── 3. Catégories de plat absentes → création ────────────────────────────
    const { data: existingCats, error: errCats } = await db
      .from('categories_plats')
      .select('id, nom, ordre')
      .eq('client_id', clientId)
      .eq('section', 'cuisine')
    if (errCats) return Response.json({ error: errCats.message }, { status: 500 })

    const catMap = new Map<string, string>()
    let maxOrdre = 0
    for (const cat of existingCats ?? []) {
      catMap.set(norm(cat.nom), cat.id)
      if ((cat.ordre ?? 0) > maxOrdre) maxOrdre = cat.ordre ?? 0
    }

    const missingCats = [
      ...new Set(
        fiches
          .map((f) => f.categorie.trim())
          .filter((nom) => nom && !catMap.has(norm(nom)))
      ),
    ]
    let categoriesCreees = 0
    if (missingCats.length > 0) {
      const toInsert = missingCats.map((nom, idx) => ({
        nom,
        emoji: '🍽',
        client_id: clientId,
        section: 'cuisine',
        ordre: maxOrdre + idx + 1,
      }))
      const created = await batchInsert(db, 'categories_plats', toInsert, 'id, nom')
      for (const c of created as Array<{ id: string; nom: string }>) {
        catMap.set(norm(c.nom), c.id)
      }
      categoriesCreees = created.length
    }

    // ── 4. Fiches : skip celles dont le nom existe déjà ──────────────────────
    const { data: existingFiches, error: errFiches } = await db
      .from('fiches')
      .select('nom')
      .eq('client_id', clientId)
    if (errFiches) return Response.json({ error: errFiches.message }, { status: 500 })

    const existingNames = new Set(
      ((existingFiches ?? []) as Array<{ nom: string }>).map((f) => norm(f.nom))
    )

    const fichesToInsert: Record<string, unknown>[] = []
    const fichesRetenues: typeof fiches = []
    const ignorees: string[] = []
    const seen = new Set<string>()

    for (const f of fiches) {
      const key = norm(f.nom)
      if (existingNames.has(key) || seen.has(key)) {
        ignorees.push(f.nom)
        continue
      }
      seen.add(key)

      let sum = 0
      for (const l of f.lignes) {
        const ing = ingMap.get(norm(l.ingredient))
        if (ing?.prix_kg != null) sum += ing.prix_kg * l.quantite
      }
      const coutPortion = f.nb_portions > 0 ? sum / f.nb_portions : null

      fichesToInsert.push({
        nom: f.nom.trim(),
        categorie: f.categorie.trim() || null,
        categorie_plat_id: f.categorie.trim() ? catMap.get(norm(f.categorie)) ?? null : null,
        nb_portions: f.nb_portions,
        prix_ttc: f.prix_ttc ?? null,
        cout_portion: coutPortion,
        format_affichage: 'brasserie',
        client_id: clientId,
      })
      fichesRetenues.push(f)
    }

    if (fichesToInsert.length === 0) {
      return Response.json({
        ok: true,
        fiches_creees: 0,
        fiches_ignorees: ignorees.length,
        ingredients_crees: ingredientsCrees,
        categories_creees: categoriesCreees,
        lignes_creees: 0,
      })
    }

    const insertedFiches = (await batchInsert(
      db,
      'fiches',
      fichesToInsert,
      'id, nom'
    )) as Array<{ id: string; nom: string }>

    const ficheNameToId = new Map<string, string>()
    for (const f of insertedFiches) ficheNameToId.set(norm(f.nom), f.id)

    // ── 5. Lignes fiche_ingredients ──────────────────────────────────────────
    const lignesToInsert: Record<string, unknown>[] = []
    for (const f of fichesRetenues) {
      const ficheId = ficheNameToId.get(norm(f.nom))
      if (!ficheId) continue
      for (const l of f.lignes) {
        const ing = ingMap.get(norm(l.ingredient))
        if (!ing) continue
        lignesToInsert.push({
          fiche_id: ficheId,
          ingredient_id: ing.id,
          quantite: l.quantite,
          unite: l.unite || 'kg',
          client_id: clientId,
        })
      }
    }

    let lignesCreees = 0
    if (lignesToInsert.length > 0) {
      const created = await batchInsert(db, 'fiche_ingredients', lignesToInsert, 'id')
      lignesCreees = created.length
    }

    return Response.json({
      ok: true,
      fiches_creees: insertedFiches.length,
      fiches_ignorees: ignorees.length,
      ingredients_crees: ingredientsCrees,
      categories_creees: categoriesCreees,
      lignes_creees: lignesCreees,
    })
  },
})
