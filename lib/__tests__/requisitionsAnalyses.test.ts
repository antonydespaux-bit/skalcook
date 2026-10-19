import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

import { agregerAnalyses, analysesRequisitions } from '../services/requisitionsAnalyses.service'
import { analysesQuerySchema } from '../validators/requisitions.schema'

const CLIENT = '11111111-1111-4111-8111-111111111111'
const services = [
  { id: 'etages', nom: 'Étages', emoji: '🛏️' },
  { id: 'spa', nom: 'Spa', emoji: null },
  { id: 'cuisine', nom: 'Cuisine', emoji: '🍳' },
  { id: 'economat', nom: 'Économat', emoji: '📦' },
]
const bon = (id: string, receveur: string, preparateur: string, stock = 'cuisine') => ({
  id, numero: 1, type: 'demande', service_demandeur_id: receveur, service_preparateur_id: preparateur, stock, livree_at: '2026-10-10T09:00:00Z',
})
const ligne = (requisition_id: string, nom: string, quantite_livree: number, valeur: number, unite = 'kg', id: string | null = nom) => ({
  requisition_id, ingredient_id: id, article_id: null, nom, unite, quantite_livree, valeur,
})

const BONS = [bon('r1', 'etages', 'cuisine'), bon('r2', 'etages', 'economat', 'articles'), bon('r3', 'spa', 'cuisine')]
const LIGNES = [
  ligne('r1', 'Fraises', 2, 17),
  ligne('r1', 'Mignardises', 0, 0, 'u'),          // rien servi : ignorée
  ligne('r2', 'Savon', 40, 14, 'u'),
  ligne('r3', 'Fraises', 1, 8.5),
  ligne('r3', 'Fraises', 500, 4, 'g'),             // autre unité : ligne produit distincte
]

describe('agregerAnalyses', () => {
  const a = agregerAnalyses(BONS, LIGNES, services)

  it('totaux', () => {
    expect(a.totaux).toEqual({ valeur: 43.5, bons: 3, lignes: 4 })
  })

  it('par service consommateur, trié par valeur, avec la part', () => {
    expect(a.par_service.map((s) => [s.nom, s.valeur, s.bons, s.part])).toEqual([
      ['Étages', 31, 2, 71.3],
      ['Spa', 12.5, 1, 28.7],
    ])
  })

  it('par service fournisseur', () => {
    expect(a.par_preparateur.map((s) => [s.nom, s.valeur, s.bons])).toEqual([['Cuisine', 29.5, 2], ['Économat', 14, 1]])
  })

  it('par produit : quantités additionnées par unité, réparties par service', () => {
    const fraisesKg = a.par_produit.find((p) => p.nom === 'Fraises' && p.unite === 'kg')!
    expect(fraisesKg).toMatchObject({ quantite: 3, valeur: 25.5, par_service: { etages: 2, spa: 1 } })
    expect(a.par_produit.filter((p) => p.nom === 'Fraises')).toHaveLength(2)
    expect(a.par_produit.some((p) => p.nom === 'Mignardises')).toBe(false)
    expect(a.par_produit[0].nom).toBe('Fraises')
  })

  it('filtre sur un service consommateur', () => {
    const spa = agregerAnalyses(BONS, LIGNES, services, 'spa')
    expect(spa.totaux.valeur).toBe(12.5)
    expect(spa.par_service.map((s) => s.nom)).toEqual(['Spa'])
  })

  it('période vide', () => {
    expect(agregerAnalyses([], [], services)).toMatchObject({ totaux: { valeur: 0, bons: 0, lignes: 0 }, par_service: [], par_produit: [] })
  })
})

describe('analysesQuerySchema', () => {
  it('bornes de la période', () => {
    expect(analysesQuerySchema.safeParse({ client_id: CLIENT, debut: '2026-10-01', fin: '2026-10-31' }).success).toBe(true)
    expect(analysesQuerySchema.safeParse({ client_id: CLIENT, debut: '2026-10-31', fin: '2026-10-01' }).success).toBe(false)
    expect(analysesQuerySchema.safeParse({ client_id: CLIENT, debut: '2024-01-01', fin: '2026-10-01' }).success).toBe(false)
  })
})

// ── Lecture paginée ──────────────────────────────────────────────────────────

type Row = Record<string, unknown>

function fakeDb(tables: Record<string, Row[]>) {
  const appels: { table: string; filtres: unknown[] }[] = []
  const from = (table: string) => {
    let rows = [...(tables[table] ?? [])]
    const appel = { table, filtres: [] as unknown[] }
    appels.push(appel)
    const builder = {
      select: () => builder,
      eq: (col: string, val: unknown) => { appel.filtres.push(['eq', col, val]); rows = rows.filter((r) => r[col] === val); return builder },
      in: (col: string, vals: unknown[]) => { appel.filtres.push(['in', col, vals.length]); rows = rows.filter((r) => vals.includes(r[col])); return builder },
      gte: (col: string, v: unknown) => { appel.filtres.push(['gte', col, v]); return builder },
      lt: (col: string, v: unknown) => { appel.filtres.push(['lt', col, v]); return builder },
      order: () => builder,
      range: (de: number, a: number) => { appel.filtres.push(['range', de, a]); rows = rows.slice(de, a + 1); return builder },
      then: (resolve: (v: { data: Row[]; error: null }) => unknown) => resolve({ data: rows, error: null }),
    }
    return builder
  }
  return { db: { from } as unknown as SupabaseClient, appels }
}

describe('analysesRequisitions', () => {
  it('pagine les bons et lit les lignes par lots', async () => {
    // 1 200 bons livrés : deux pages de bons, puis 8 lots de lignes (150 ids).
    const bons = Array.from({ length: 1200 }, (_, i) => ({ ...bon(`r${i}`, 'etages', 'cuisine'), client_id: CLIENT, statut: 'livree' }))
    const lignes = bons.map((b) => ({ ...ligne(b.id, 'Fraises', 1, 2), client_id: CLIENT }))
    const { db, appels } = fakeDb({ requisitions: bons, requisition_lignes: lignes, services_internes: services.map((s) => ({ ...s, client_id: CLIENT })) })

    const r = await analysesRequisitions(db, CLIENT, '2026-10-01', '2026-10-31')
    expect(r.totaux).toEqual({ valeur: 2400, bons: 1200, lignes: 1200 })
    expect(appels.filter((a) => a.table === 'requisitions')).toHaveLength(2)
    expect(appels.filter((a) => a.table === 'requisition_lignes')).toHaveLength(8)
    expect(appels.find((a) => a.table === 'requisitions')!.filtres).toEqual(expect.arrayContaining([
      ['eq', 'statut', 'livree'], ['gte', 'livree_at', '2026-10-01'], ['lt', 'livree_at', '2026-11-01'],
    ]))
  })
})
