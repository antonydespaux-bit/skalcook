import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

import {
  lendemain,
  bonsSortants,
  cumulerSorties,
  sommeCessions,
  sortiesRequisitions,
  cessionsInternesHt,
} from '../services/requisitionsStock.service'
import { computeTotaux } from '../foodCostExport'

const CLIENT = '11111111-1111-4111-8111-111111111111'
const ETAGES = 'etages'
const CUISINE = 'cuisine-svc'
const PATISSERIE = 'patisserie-svc'
const BAR = 'bar-svc'
const FRAISES = 'fraises'
const BEURRE = 'beurre'

const stocks = new Map([[ETAGES, 'aucun'], [CUISINE, 'cuisine'], [PATISSERIE, 'cuisine'], [BAR, 'bar']])

// ── Règles pures ─────────────────────────────────────────────────────────────

describe('effets des réquisitions sur le stock', () => {
  it('lendemain', () => {
    expect(lendemain('2026-10-19')).toBe('2026-10-20')
    expect(lendemain('2026-12-31')).toBe('2027-01-01')
  })

  it('un bon vers un service du même stock est un mouvement interne', () => {
    const bons = [
      { id: 'r1', service_demandeur_id: ETAGES },     // cuisine → étages : sortie
      { id: 'r2', service_demandeur_id: PATISSERIE }, // cuisine → pâtisserie (même stock) : interne
      { id: 'r3', service_demandeur_id: BAR },        // cuisine → bar : sortie de la cuisine
    ]
    expect([...bonsSortants(bons, stocks, 'cuisine')]).toEqual(['r1', 'r3'])
  })

  it("cumule les quantités livrées dans l'unité de l'ingrédient", () => {
    const lignes = [
      { requisition_id: 'r1', ingredient_id: FRAISES, unite: 'kg', quantite_livree: 1.5, valeur: 12.75 },
      { requisition_id: 'r1', ingredient_id: BEURRE, unite: 'g', quantite_livree: '250', valeur: 2.5 },
      { requisition_id: 'r3', ingredient_id: FRAISES, unite: 'kg', quantite_livree: 0.5, valeur: 4.25 },
      { requisition_id: 'r2', ingredient_id: FRAISES, unite: 'kg', quantite_livree: 9, valeur: 76.5 },  // interne : ignoré
      { requisition_id: 'r1', ingredient_id: null, unite: 'u', quantite_livree: 3, valeur: 1 },        // article : ignoré
    ]
    const sortants = new Set(['r1', 'r3'])
    expect(cumulerSorties(lignes, sortants, new Map([[FRAISES, 'kg'], [BEURRE, 'kg']]))).toEqual({ [FRAISES]: 2, [BEURRE]: 0.25 })
    expect(sommeCessions(lignes, sortants)).toBe(20.5)
  })

  it('le coût matière déduit les cessions internes', () => {
    const base = { inventaireDebut: 1000, inventaireFin: 800, achatsHt: 5000, ajustements: [{ montant: 50 }], caFoodHt: 20000 }
    expect(computeTotaux(base).coutMatiere).toBe(5250)
    const t = computeTotaux({ ...base, cessionsHt: 250 })
    expect(t.coutMatiere).toBe(5000)
    expect(t.cessions).toBe(250)
    expect(t.ratio).toBe(25)
  })
})

// ── Requêtes ─────────────────────────────────────────────────────────────────

type Row = Record<string, unknown>

function fakeDb(tables: Record<string, Row[]>, erreurs: Record<string, { code: string; message: string }> = {}) {
  const appels: { table: string; filtres: unknown[] }[] = []
  const from = (table: string) => {
    let rows = [...(tables[table] ?? [])]
    const appel = { table, filtres: [] as unknown[] }
    appels.push(appel)
    const builder = {
      select: () => builder,
      eq: (col: string, val: unknown) => { appel.filtres.push(['eq', col, val]); rows = rows.filter((r) => r[col] === val); return builder },
      in: (col: string, vals: unknown[]) => { appel.filtres.push(['in', col, vals]); rows = rows.filter((r) => vals.includes(r[col])); return builder },
      gte: (col: string, val: unknown) => { appel.filtres.push(['gte', col, val]); return builder },
      lt: (col: string, val: unknown) => { appel.filtres.push(['lt', col, val]); return builder },
      then: (resolve: (v: { data: Row[] | null; error: unknown }) => unknown) =>
        resolve(erreurs[table] ? { data: null, error: erreurs[table] } : { data: rows, error: null }),
    }
    return builder
  }
  return { db: { from } as unknown as SupabaseClient, appels }
}

const tables = () => ({
  requisitions: [
    { id: 'r1', client_id: CLIENT, stock: 'cuisine', statut: 'livree', service_demandeur_id: ETAGES },
    { id: 'r2', client_id: CLIENT, stock: 'cuisine', statut: 'livree', service_demandeur_id: PATISSERIE },
  ],
  services_internes: [...stocks].map(([id, stock]) => ({ id, client_id: CLIENT, stock })),
  requisition_lignes: [
    { client_id: CLIENT, requisition_id: 'r1', ingredient_id: FRAISES, unite: 'kg', quantite_livree: 2, valeur: 17 },
    { client_id: CLIENT, requisition_id: 'r2', ingredient_id: FRAISES, unite: 'kg', quantite_livree: 5, valeur: 42.5 },
  ],
})

describe('sortiesRequisitions / cessionsInternesHt', () => {
  it("sorties livrées après le jour de l'inventaire, bons livrés seulement", async () => {
    const { db, appels } = fakeDb(tables())
    expect(await sortiesRequisitions(db, CLIENT, 'cuisine', '2026-10-01', [{ id: FRAISES, unite: 'kg' }])).toEqual({ [FRAISES]: 2 })
    const lecture = appels.find((a) => a.table === 'requisitions')!
    expect(lecture.filtres).toEqual(expect.arrayContaining([
      ['eq', 'stock', 'cuisine'], ['eq', 'statut', 'livree'], ['gte', 'livree_at', '2026-10-02'],
    ]))
  })

  it('cessions de la période, fin incluse', async () => {
    const { db, appels } = fakeDb(tables())
    expect(await cessionsInternesHt(db, CLIENT, '2026-10-01', '2026-10-31')).toBe(17)
    const lecture = appels.find((a) => a.table === 'requisitions')!
    expect(lecture.filtres).toEqual(expect.arrayContaining([['gte', 'livree_at', '2026-10-01'], ['lt', 'livree_at', '2026-11-01']]))
  })

  it('tables absentes (migration pas encore appliquée) : aucun effet, pas d’erreur', async () => {
    const { db } = fakeDb(tables(), { requisitions: { code: 'PGRST205', message: 'table introuvable' } })
    await expect(sortiesRequisitions(db, CLIENT, 'cuisine', null, [])).resolves.toEqual({})
    await expect(cessionsInternesHt(db, CLIENT, '2026-10-01', '2026-10-31')).resolves.toBe(0)
  })

  it('une autre erreur remonte', async () => {
    const { db } = fakeDb(tables(), { requisitions: { code: '57014', message: 'timeout' } })
    await expect(cessionsInternesHt(db, CLIENT, '2026-10-01', '2026-10-31')).rejects.toThrow('timeout')
  })
})
