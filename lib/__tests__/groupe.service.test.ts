import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

vi.mock('../superadmin', () => ({
  isSuperadminEmail: (email: string) => email === 'boss@skalcook.com',
}))

import {
  statutRatio,
  calculerIndicateurs,
  calculerTotaux,
  etablissementsAccessibles,
  getSyntheseGroupe,
  listGroupesAccessibles,
  comparerPrix,
  cleProduit,
  getPrixGroupe,
  type IndicateursBruts,
  type PrixProduitBrut,
  type EtablissementMeta,
} from '../services/groupe.service'

// ── Fausse base en mémoire (select / eq / in / not is null / order / maybeSingle / rpc) ──

type Row = Record<string, unknown>

function fakeDb(tables: Record<string, Row[]>, rpcRows: Row[] = []) {
  const rpcCalls: { fn: string; args: Record<string, unknown> }[] = []
  const from = (table: string) => {
    let rows = [...(tables[table] ?? [])]
    const builder = {
      select: () => builder,
      eq: (col: string, val: unknown) => { rows = rows.filter((r) => r[col] === val); return builder },
      in: (col: string, vals: unknown[]) => { rows = rows.filter((r) => vals.includes(r[col])); return builder },
      not: (col: string, _op: string, _val: unknown) => { rows = rows.filter((r) => r[col] != null); return builder },
      order: () => builder,
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      then: (resolve: (v: { data: Row[]; error: null }) => unknown) => resolve({ data: rows, error: null }),
    }
    return builder
  }
  const rpc = async (fn: string, args: Record<string, unknown>) => {
    rpcCalls.push({ fn, args })
    const ids = args.p_client_ids as string[]
    return { data: rpcRows.filter((r) => ids.includes(r.client_id as string)), error: null }
  }
  return { db: { from, rpc } as unknown as SupabaseClient, rpcCalls }
}

const meta = (id: string, nom: string): EtablissementMeta => ({
  id, nom, nom_etablissement: nom,
  seuil_vert_cuisine: 28, seuil_orange_cuisine: 35,
  seuil_vert_boissons: 22, seuil_orange_boissons: 28,
})

const brut = (client_id: string, over: Partial<IndicateursBruts> = {}): IndicateursBruts => ({
  client_id,
  ca_food_ttc: 0, ca_bev_20_ttc: 0, ca_bev_10_ttc: 0, ca_autre_ttc: 0, couverts: 0,
  achats_cuisine_ht: 0, achats_bar_ht: 0, nb_factures: 0,
  stock_cuisine_ht: null, stock_cuisine_date: null, stock_bar_ht: null, stock_bar_date: null,
  ...over,
})

// Groupe G : A, B, C avec le module ; D sans le module ; E dans un autre groupe.
const G = '00000000-0000-0000-0000-00000000000g'
const clients = [
  { id: 'A', nom: 'A', nom_etablissement: 'Hôtel A', groupe_id: G, actif: true, modules_actifs: ['fiches', 'groupe'] },
  { id: 'B', nom: 'B', nom_etablissement: 'Hôtel B', groupe_id: G, actif: true, modules_actifs: ['groupe'] },
  { id: 'C', nom: 'C', nom_etablissement: 'Hôtel C', groupe_id: G, actif: true, modules_actifs: ['groupe'] },
  { id: 'D', nom: 'D', nom_etablissement: 'Hôtel D', groupe_id: G, actif: true, modules_actifs: ['fiches'] },
  { id: 'E', nom: 'E', nom_etablissement: 'Autre', groupe_id: 'autre', actif: true, modules_actifs: ['groupe'] },
]
const groupes = [{ id: G, nom: 'Groupe G' }, { id: 'autre', nom: 'Autre groupe' }]
// u1 (admin/directeur) a accès à A et B (pas C) + D (sans module) + E (autre groupe).
// u4 a accès à A mais en rôle cuisine : pas de vue groupe.
const acces_clients = [
  { user_id: 'u1', client_id: 'A', role: 'admin' }, { user_id: 'u1', client_id: 'B', role: 'directeur' },
  { user_id: 'u1', client_id: 'D', role: 'admin' }, { user_id: 'u1', client_id: 'E', role: 'admin' },
  { user_id: 'u2', client_id: 'C', role: 'admin' },
  { user_id: 'u4', client_id: 'A', role: 'cuisine' }, { user_id: 'u4', client_id: 'B', role: 'bar' },
]
const profils = [{ id: 'u1', is_superadmin: false }, { id: 'u2', is_superadmin: false }, { id: 'u3', is_superadmin: false }, { id: 'u4', is_superadmin: false }]

describe('statutRatio', () => {
  it('classe selon les seuils (bornes incluses)', () => {
    expect(statutRatio(28, 28, 35)).toBe('vert')
    expect(statutRatio(30, 28, 35)).toBe('orange')
    expect(statutRatio(35, 28, 35)).toBe('orange')
    expect(statutRatio(35.1, 28, 35)).toBe('rouge')
  })
  it('null si pas de ratio ou pas de seuils', () => {
    expect(statutRatio(null, 28, 35)).toBeNull()
    expect(statutRatio(30, null, 35)).toBeNull()
  })
})

describe('calculerIndicateurs', () => {
  it('convertit le CA TTC en HT et calcule les ratios', () => {
    const r = calculerIndicateurs(brut('A', {
      ca_food_ttc: 11000, ca_bev_20_ttc: 1200, ca_bev_10_ttc: 1100, ca_autre_ttc: 110,
      couverts: 100, achats_cuisine_ht: 3000, achats_bar_ht: '440', nb_factures: '12',
      stock_cuisine_ht: '5000.5', stock_cuisine_date: '2026-09-30',
    }), meta('A', 'Hôtel A'))
    expect(r.caFoodHt).toBeCloseTo(10000)
    expect(r.caBoissonsHt).toBeCloseTo(2000)
    expect(r.caHt).toBeCloseTo(12100)
    expect(r.ticketMoyenTtc).toBeCloseTo(134.1)
    expect(r.ratioCuisine).toBeCloseTo(30)
    expect(r.statutCuisine).toBe('orange')
    expect(r.ratioBoissons).toBeCloseTo(22)
    expect(r.statutBoissons).toBe('vert')
    expect(r.nbFactures).toBe(12)
    expect(r.stockCuisineHt).toBe(5000.5)
    expect(r.stockBarHt).toBeNull()
  })
  it('pas de CA : ratios et ticket moyen à null, pas de division par zéro', () => {
    const r = calculerIndicateurs(brut('A', { achats_cuisine_ht: 500 }), meta('A', 'Hôtel A'))
    expect(r.ratioCuisine).toBeNull()
    expect(r.ratioBoissons).toBeNull()
    expect(r.ticketMoyenTtc).toBeNull()
    expect(r.statutCuisine).toBeNull()
  })
})

describe('ratio sans achats', () => {
  it("pas d'achats sur la section : ratio null (pas 0 %)", () => {
    const r = calculerIndicateurs(brut('A', { ca_food_ttc: 1100, ca_bev_20_ttc: 1200, achats_cuisine_ht: 300 }), meta('A', 'A'))
    expect(r.ratioCuisine).toBeCloseTo(30)
    expect(r.ratioBoissons).toBeNull()
    expect(r.statutBoissons).toBeNull()
    expect(calculerTotaux([r]).ratioBoissons).toBeNull()
  })
})

describe('calculerTotaux', () => {
  it('pondère les ratios par le CA (somme des achats / somme du CA)', () => {
    const a = calculerIndicateurs(brut('A', { ca_food_ttc: 11000, achats_cuisine_ht: 2000, couverts: 50 }), meta('A', 'A'))
    const b = calculerIndicateurs(brut('B', { ca_food_ttc: 1100, achats_cuisine_ht: 600, couverts: 10 }), meta('B', 'B'))
    const t = calculerTotaux([a, b])
    expect(t.caFoodHt).toBeCloseTo(11000)
    expect(t.ratioCuisine).toBeCloseTo(2600 / 11000 * 100) // pas la moyenne de 20 % et 60 %
    expect(t.couverts).toBe(60)
    expect(t.ticketMoyenTtc).toBeCloseTo(12100 / 60)
  })
})

describe('isolation : etablissementsAccessibles', () => {
  const tables = { clients, groupes, acces_clients, profils }

  it("membre : seulement ses établissements du groupe ayant le module", async () => {
    const { db } = fakeDb(tables)
    const r = await etablissementsAccessibles(db, { id: 'u1', email: 'u1@x.fr' }, G)
    expect(r.map((c) => c.id).sort()).toEqual(['A', 'B']) // pas C (pas d'accès), pas D (pas de module), pas E (autre groupe)
  })

  it("membre sans accès au groupe : aucun établissement", async () => {
    const { db } = fakeDb(tables)
    expect(await etablissementsAccessibles(db, { id: 'u3', email: 'u3@x.fr' }, G)).toEqual([])
  })

  it('rôle cuisine ou bar : pas de vue groupe (CA, marges)', async () => {
    const { db } = fakeDb(tables)
    expect(await etablissementsAccessibles(db, { id: 'u4', email: 'u4@x.fr' }, G)).toEqual([])
  })

  it('superadmin : tous les établissements du groupe ayant le module', async () => {
    const { db } = fakeDb(tables)
    const r = await etablissementsAccessibles(db, { id: 'sa', email: 'boss@skalcook.com' }, G)
    expect(r.map((c) => c.id).sort()).toEqual(['A', 'B', 'C'])
  })
})

describe('getSyntheseGroupe', () => {
  const tables = { clients, groupes, acces_clients, profils }
  const rpcRows = ['A', 'B', 'C', 'D', 'E'].map((id) => brut(id, { ca_food_ttc: 1100, achats_cuisine_ht: 300 }))

  it("n'interroge les indicateurs que pour les établissements autorisés", async () => {
    const { db, rpcCalls } = fakeDb(tables, rpcRows)
    const r = await getSyntheseGroupe(db, { id: 'u1' }, { groupeId: G, debut: '2026-09-01', fin: '2026-09-30' })
    expect(rpcCalls).toHaveLength(1)
    expect((rpcCalls[0].args.p_client_ids as string[]).sort()).toEqual(['A', 'B'])
    expect(r.etablissements.map((e) => e.clientId).sort()).toEqual(['A', 'B'])
    expect(r.groupe.nom).toBe('Groupe G')
    expect(r.totaux.achatsCuisineHt).toBe(600)
  })

  it('refuse (403) un utilisateur sans établissement accessible', async () => {
    const { db, rpcCalls } = fakeDb(tables, rpcRows)
    await expect(getSyntheseGroupe(db, { id: 'u3' }, { groupeId: G, debut: '2026-09-01', fin: '2026-09-30' }))
      .rejects.toMatchObject({ name: 'ForbiddenError' })
    expect(rpcCalls).toHaveLength(0)
  })

  it('404 si le groupe n\'existe pas', async () => {
    const { db } = fakeDb(tables, rpcRows)
    await expect(getSyntheseGroupe(db, { id: 'u1' }, { groupeId: 'inconnu', debut: '2026-09-01', fin: '2026-09-30' }))
      .rejects.toMatchObject({ name: 'NotFoundError' })
  })
})

describe('listGroupesAccessibles', () => {
  const tables = { clients, groupes, acces_clients, profils }

  it('membre : groupes où il voit au moins un établissement avec le module', async () => {
    const { db } = fakeDb(tables)
    const r = await listGroupesAccessibles(db, { id: 'u1' })
    expect(r.groupes.map((g) => (g as { id: string }).id).sort()).toEqual(['autre', G].sort())
  })

  it('membre sans accès : aucun groupe', async () => {
    const { db } = fakeDb(tables)
    expect((await listGroupesAccessibles(db, { id: 'u3' })).groupes).toEqual([])
  })

  it('rôle cuisine : aucun groupe', async () => {
    const { db } = fakeDb(tables)
    expect((await listGroupesAccessibles(db, { id: 'u4' })).groupes).toEqual([])
  })
})

// ── Comparaison des prix ──────────────────────────────────────────────────

const pb = (client_id: string, nom: string, unite: string, qte: number, montant: number, extra: Partial<PrixProduitBrut> = {}): PrixProduitBrut => ({
  client_id, ingredient_id: `${client_id}-${nom}`, nom, unite, qte, montant, nb_achats: 1, dernier_achat: '2026-09-15', ...extra,
})

describe('cleProduit', () => {
  it('ignore accents, casse, ponctuation et alias d\'unité', () => {
    expect(cleProduit('Crème  fraîche 35%', 'Kg.')).toBe(cleProduit('CREME FRAICHE 35 %', 'kg'))
  })
  it("distingue les unités", () => {
    expect(cleProduit('Citron', 'kg')).not.toBe(cleProduit('Citron', 'u'))
  })
})

describe('comparerPrix', () => {
  const noms = new Map([['A', 'Hôtel A'], ['B', 'Hôtel B'], ['C', 'Hôtel C']])

  it('rapproche un même produit et calcule écart et économie potentielle', () => {
    const r = comparerPrix([
      pb('A', 'Beurre doux', 'kg', 10, 100),   // 10 €/kg
      pb('B', 'BEURRE DOUX', 'kg', 20, 240),   // 12 €/kg
      pb('C', 'Beurre doux', 'kg', 5, 75),     // 15 €/kg
    ], noms)
    expect(r).toHaveLength(1)
    const p = r[0]
    expect(p.prixMin).toBeCloseTo(10)
    expect(p.prixMax).toBeCloseTo(15)
    expect(p.ecartPct).toBeCloseTo(50)
    // B : (12 − 10) × 20 = 40 ; C : (15 − 10) × 5 = 25
    expect(p.economiePotentielle).toBeCloseTo(65)
    expect(p.etablissements.map((e) => e.clientId)).toEqual(['A', 'B', 'C'])
    expect(p.etablissements[0].surcout).toBe(0)
  })

  it('écarte les lignes génériques et signale les écarts suspects', () => {
    const r = comparerPrix([
      pb('A', 'Divers 20%', 'u', 1, 35), pb('B', 'DIVERS 20 %', 'u', 1, 97),
      pb('A', 'Mirabelle', 'kg', 1, 6.9), pb('B', 'Mirabelle', 'kg', 1, 25.6),
      pb('A', 'Citron', 'kg', 1, 3), pb('B', 'Citron', 'kg', 1, 4),
    ], noms)
    expect(r.map((p) => p.nom).sort()).toEqual(['Citron', 'Mirabelle'])
    expect(r.find((p) => p.nom === 'Mirabelle')!.aVerifier).toBe(true)
    expect(r.find((p) => p.nom === 'Citron')!.aVerifier).toBe(false)
  })

  it("ignore un produit acheté par un seul établissement", () => {
    expect(comparerPrix([pb('A', 'Truffe', 'kg', 1, 900), pb('B', 'Beurre', 'kg', 1, 10)], noms)).toEqual([])
  })

  it("cumule deux fiches au même nom dans un établissement (prix pondéré)", () => {
    const r = comparerPrix([
      pb('A', 'Oeufs', 'u', 60, 18, { ingredient_id: 'a1' }),
      pb('A', 'oeufs', 'u', 40, 14, { ingredient_id: 'a2' }),
      pb('B', 'Oeufs', 'u', 100, 30),
    ], noms)
    const a = r[0].etablissements.find((e) => e.clientId === 'A')!
    expect(a.prixMoyen).toBeCloseTo(32 / 100)
    expect(a.qte).toBe(100)
  })

  it("trie par économie potentielle décroissante", () => {
    const r = comparerPrix([
      pb('A', 'Sel', 'kg', 1, 1), pb('B', 'Sel', 'kg', 1, 2),
      pb('A', 'Boeuf', 'kg', 10, 300), pb('B', 'Boeuf', 'kg', 10, 400),
    ], noms)
    expect(r.map((p) => p.nom)).toEqual(['Boeuf', 'Sel'])
  })
})

describe('getPrixGroupe (isolation)', () => {
  const tables = { clients, groupes, acces_clients, profils }
  const rows = [pb('A', 'Beurre', 'kg', 10, 100), pb('B', 'Beurre', 'kg', 10, 120), pb('C', 'Beurre', 'kg', 10, 50)]

  it("n'interroge et ne compare que les établissements autorisés", async () => {
    const calls: Record<string, unknown>[] = []
    const { db } = fakeDb(tables)
    ;(db as unknown as { rpc: unknown }).rpc = async (_fn: string, args: Record<string, unknown>) => {
      calls.push(args)
      return { data: rows, error: null } // la fonction renverrait C si on la lui demandait : le service doit l'écarter
    }
    const r = await getPrixGroupe(db, { id: 'u1' }, { groupeId: G, debut: '2026-09-01', fin: '2026-09-30' })
    expect((calls[0].p_client_ids as string[]).sort()).toEqual(['A', 'B'])
    expect(r.produits[0].etablissements.map((e) => e.clientId)).toEqual(['A', 'B'])
    expect(r.economieTotale).toBeCloseTo(20)
  })

  it('refuse un rôle cuisine', async () => {
    const { db } = fakeDb(tables)
    await expect(getPrixGroupe(db, { id: 'u4' }, { groupeId: G, debut: '2026-09-01', fin: '2026-09-30' }))
      .rejects.toMatchObject({ name: 'ForbiddenError' })
  })
})
