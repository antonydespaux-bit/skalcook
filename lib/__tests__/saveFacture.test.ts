import { describe, it, expect } from 'vitest'
import { saveFacture } from '../services/achats.service'
import { ConflictError } from '../errors'

// Fausse base Supabase en mémoire : suffisante pour les requêtes de
// saveFacture (select / insert / update / upsert / delete, filtres eq, in,
// is, ilike, limit). Journalise chaque requête pour vérifier ce qui est écrit.
type Row = Record<string, unknown>

function fausseBase(tables: Record<string, Row[]>, options: { echecInsert?: string } = {}) {
  const journal: Array<{ table: string; op: string; rows?: Row[] }> = []
  let seq = 0

  function builder(table: string) {
    let op = 'select'
    let payload: Row[] = []
    let patch: Row = {}
    const filtres: Array<(r: Row) => boolean> = []
    let unique: 'single' | 'maybe' | null = null
    let limite: number | null = null

    const exec = () => {
      const lignes = (tables[table] ??= [])
      if (op === 'insert' || op === 'upsert') {
        if (op === 'insert' && options.echecInsert === table) {
          return { data: null, error: { message: 'échec simulé', code: 'XX000' } }
        }
        const crees = payload.map((r) => ({ id: `${table}-${++seq}`, ...r }))
        lignes.push(...crees)
        journal.push({ table, op, rows: crees })
        return { data: unique ? crees[0] : crees, error: null }
      }
      let res = lignes.filter((r) => filtres.every((f) => f(r)))
      if (op === 'update') {
        res.forEach((r) => Object.assign(r, patch))
        journal.push({ table, op, rows: res })
        return { data: null, error: null }
      }
      if (op === 'delete') {
        tables[table] = lignes.filter((r) => !res.includes(r))
        journal.push({ table, op, rows: res })
        return { data: null, error: null }
      }
      if (limite != null) res = res.slice(0, limite)
      if (unique) return { data: res[0] ?? null, error: null }
      return { data: res, error: null }
    }

    const b: Record<string, unknown> = {
      select: () => b,
      insert: (rows: Row | Row[]) => { op = 'insert'; payload = Array.isArray(rows) ? rows : [rows]; return b },
      upsert: (rows: Row | Row[]) => { op = 'upsert'; payload = Array.isArray(rows) ? rows : [rows]; return b },
      update: (p: Row) => { op = 'update'; patch = p; return b },
      delete: () => { op = 'delete'; return b },
      eq: (c: string, v: unknown) => { filtres.push((r) => r[c] === v); return b },
      in: (c: string, v: unknown[]) => { filtres.push((r) => v.includes(r[c])); return b },
      is: (c: string, v: unknown) => { filtres.push((r) => (r[c] ?? null) === v); return b },
      ilike: (c: string, v: string) => { filtres.push((r) => String(r[c] ?? '').toLowerCase() === v.replace(/\\(.)/g, '$1').toLowerCase()); return b },
      limit: (n: number) => { limite = n; return b },
      single: () => { unique = 'single'; return b },
      maybeSingle: () => { unique = 'maybe'; return b },
      then: (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve().then(exec).then(ok, ko),
    }
    return b
  }

  const db = {
    from: (t: string) => builder(t),
    storage: { from: () => ({ upload: async () => ({ error: null }) }) },
  }
  return { db: db as never, journal, tables }
}

const CLIENT = 'client-1'

function base() {
  return {
    fournisseurs: [{ id: 'f-1', client_id: CLIENT, nom: 'Vergers St Eustache' }],
    ingredients: [{ id: 'ing-carotte', client_id: CLIENT, nom: 'CAROTTE', conditionnement: 5, prix_kg: 1 }],
    categories_ingredients: [{ id: 'cat-1', client_id: CLIENT, section: 'cuisine', nom: 'À classer' }],
    achats_factures: [] as Row[],
    achats_lignes: [] as Row[],
    fournisseur_mapping: [] as Row[],
    transactions_api: [] as Row[],
  }
}

const entree = (surcharges: Record<string, unknown> = {}) => ({
  clientId: CLIENT,
  fournisseur: 'LES VERGERS SAINT EUSTACHE',
  numeroFacture: 'F-42',
  dateFacture: '2026-10-21',
  statut: 'facture',
  section: 'cuisine',
  forceInsert: false,
  autoCreateMissing: true,
  lignes: [
    { designation: 'CAROTTE / KG', ingredient_id: 'ing-carotte', quantite: 2, prix_unitaire_ht: 10, updatePrice: true, conditionnement: 1 },
    { designation: 'PANAIS BOTTE', ingredient_id: null, quantite: 1, prix_unitaire_ht: 6, conditionnement: 2 },
    { designation: 'Panais botte', ingredient_id: null, quantite: 3, prix_unitaire_ht: 6, conditionnement: 2 },
  ],
  ...surcharges,
}) as never

describe('saveFacture', () => {
  it('enregistre la facture, crée les ingrédients manquants en une fois et met à jour les prix', async () => {
    const { db, journal, tables } = fausseBase(base())
    const res = await saveFacture(db, entree(), 'user-1')

    // Fournisseur existant repris malgré l'écriture, pas de doublon.
    expect(tables.fournisseurs).toHaveLength(1)
    const facture = tables.achats_factures[0]
    expect(facture.fournisseur_id).toBe('f-1')
    expect(facture.total_ht).toBe(20 + 6 + 18)

    // Les deux lignes « panais » pointent vers un seul ingrédient créé, en une insertion.
    const insertsIng = journal.filter((j) => j.table === 'ingredients' && j.op === 'insert')
    expect(insertsIng).toHaveLength(1)
    expect(insertsIng[0].rows).toHaveLength(1)
    const panais = insertsIng[0].rows![0]
    expect(panais).toMatchObject({ nom: 'PANAIS BOTTE', categorie_id: 'cat-1', prix_kg: 3, conditionnement: 2 })
    const lignes = tables.achats_lignes
    expect(lignes).toHaveLength(3)
    expect(lignes[1].ingredient_id).toBe(panais.id)
    expect(lignes[2].ingredient_id).toBe(panais.id)
    expect(res.auto_created).toBe(1)

    // Prix de la carotte = prix de la ligne / conditionnement de l'ingrédient (5).
    expect(tables.ingredients.find((i) => i.id === 'ing-carotte')!.prix_kg).toBe(2)
    expect(res.prix_maj).toBe(1)
    expect(tables.fournisseur_mapping).toHaveLength(3)
    expect(tables.transactions_api).toHaveLength(1)
  })

  it("refuse un doublon sans rien écrire", async () => {
    const donnees = base()
    donnees.achats_factures.push({ id: 'old', client_id: CLIENT, numero_facture: 'f-42', deleted_at: null })
    const { db, journal } = fausseBase(donnees)
    await expect(saveFacture(db, entree(), 'user-1')).rejects.toBeInstanceOf(ConflictError)
    expect(journal.filter((j) => j.op !== 'select')).toHaveLength(0)
  })

  it("annule l'en-tête si l'insertion des lignes échoue", async () => {
    const { db, tables } = fausseBase(base(), { echecInsert: 'achats_lignes' })
    await expect(saveFacture(db, entree(), 'user-1')).rejects.toThrow('échec simulé')
    expect(tables.achats_factures).toHaveLength(0)
  })

  it('sans création automatique, ne lit ni ne crée d’ingrédient', async () => {
    const { db, journal, tables } = fausseBase(base())
    await saveFacture(db, entree({ autoCreateMissing: false }), 'user-1')
    expect(journal.filter((j) => j.table === 'ingredients' && j.op === 'insert')).toHaveLength(0)
    expect(tables.achats_lignes[1].ingredient_id).toBeNull()
  })

  it('crée le fournisseur s’il est nouveau', async () => {
    const { db, tables } = fausseBase(base())
    await saveFacture(db, entree({ fournisseur: 'Maison Durand' }), 'user-1')
    expect(tables.fournisseurs).toHaveLength(2)
    expect(tables.achats_factures[0].fournisseur_id).toBe(tables.fournisseurs[1].id)
  })
})
