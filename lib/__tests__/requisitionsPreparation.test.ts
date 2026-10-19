import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'
import type { SupabaseClient } from '@supabase/supabase-js'

import {
  construireLivraison,
  valeurLivraison,
  prendreEnCharge,
  livrerRequisition,
  sortieDirecte,
  type ProduitCatalogue,
} from '../services/requisitionsPreparation.service'
import { peutPreparer, listerRequisitions, refuserRequisition, contexteUtilisateur } from '../services/requisitionsDemandes.service'
import { livraisonSchema, sortieDirecteSchema } from '../validators/requisitions.schema'
import { ConflictError, ForbiddenError, ValidationError } from '../errors'

const CLIENT = '11111111-1111-4111-8111-111111111111'
const ETAGES = '22222222-2222-4222-8222-222222222222'
const CUISINE = '33333333-3333-4333-8333-333333333333'
const CHEF = '55555555-5555-4555-8555-555555555555'
const FDC = '66666666-6666-4666-8666-666666666666'
const P1 = '77777777-7777-4777-8777-777777777777'
const P2 = '88888888-8888-4888-8888-888888888888'
const P3 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const REQ = '99999999-9999-4999-8999-999999999999'
const L1 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const L2 = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

const N = (over: Partial<{ administration: string; requisitions: string; analyses: string }> = {}) => ({
  administration: 'aucun', requisitions: 'modification', analyses: 'aucun', ...over,
})

const produits = new Map<string, ProduitCatalogue>([
  [P1, { id: P1, nom: 'Fraises', unite: 'kg', prix: 8.5 }],
  [P2, { id: P2, nom: 'Mignardises', unite: 'u', prix: 0.6 }],
  [P3, { id: P3, nom: 'Citrons', unite: 'kg', prix: null }],
])

// ── Règles pures ─────────────────────────────────────────────────────────────

describe('construireLivraison', () => {
  const existantes = [
    { id: L1, ingredient_id: P1, article_id: null },
    { id: L2, ingredient_id: P2, article_id: null },
  ]

  it('fige le prix courant de chaque ligne, 0 accepté', () => {
    const r = construireLivraison(existantes, [{ id: L1, quantite_livree: 1.5 }, { id: L2, quantite_livree: 0 }], [], produits, 'ingredient_id')
    expect(r.lignes).toEqual([
      { id: L1, quantite_livree: 1.5, prix_unitaire: 8.5 },
      { id: L2, quantite_livree: 0, prix_unitaire: 0.6 },
    ])
    expect(r.ajouts).toEqual([])
  })

  it('exige une quantité pour chaque ligne du bon', () => {
    expect(() => construireLivraison(existantes, [{ id: L1, quantite_livree: 1 }], [], produits, 'ingredient_id')).toThrow(ValidationError)
    expect(() => construireLivraison(existantes, [{ id: L1, quantite_livree: 1 }, { id: L1, quantite_livree: 2 }], [], produits, 'ingredient_id')).toThrow(ValidationError)
  })

  it('ajoute les produits demandés à la voix, sans doublon avec le bon', () => {
    const saisies = [{ id: L1, quantite_livree: 1 }, { id: L2, quantite_livree: 12 }]
    const r = construireLivraison(existantes, saisies, [{ produit_id: P3, quantite_livree: 0.5 }], produits, 'ingredient_id')
    expect(r.ajouts).toEqual([{ ingredient_id: P3, nom: 'Citrons', unite: 'kg', quantite_livree: 0.5, prix_unitaire: null, commentaire: null }])
    expect(() => construireLivraison(existantes, saisies, [{ produit_id: P1, quantite_livree: 1 }], produits, 'ingredient_id')).toThrow(/déjà sur le bon/)
    expect(() => construireLivraison(existantes, saisies, [{ produit_id: REQ, quantite_livree: 1 }], produits, 'ingredient_id')).toThrow(ValidationError)
  })

  it('valeurLivraison arrondit au centime, prix inconnu = 0', () => {
    expect(valeurLivraison([{ quantite_livree: 1.5, prix_unitaire: 8.5 }, { quantite_livree: 12, prix_unitaire: 0.6 }, { quantite_livree: 2, prix_unitaire: null }])).toBe(19.95)
  })

  it('peutPreparer : membre du préparateur ou administration, bon à servir', () => {
    const r = { statut: 'a_preparer' as const, service_preparateur_id: CUISINE }
    expect(peutPreparer(r, new Set([CUISINE]), N())).toBe(true)
    expect(peutPreparer({ ...r, statut: 'en_preparation' }, new Set([CUISINE]), N())).toBe(true)
    expect(peutPreparer(r, new Set([ETAGES]), N())).toBe(false)
    expect(peutPreparer(r, new Set(), N({ administration: 'modification' }))).toBe(true)
    expect(peutPreparer(r, new Set([CUISINE]), N({ requisitions: 'lecture' }))).toBe(false)
    for (const s of ['a_valider', 'livree', 'annulee', 'refusee'] as const) expect(peutPreparer({ ...r, statut: s }, new Set([CUISINE]), N()), s).toBe(false)
  })

  it('validateurs', () => {
    expect(livraisonSchema.safeParse({ client_id: CLIENT, id: REQ, lignes: [{ id: L1, quantite_livree: 0 }] }).success).toBe(true)
    expect(livraisonSchema.safeParse({ client_id: CLIENT, id: REQ, lignes: [{ id: L1, quantite_livree: -1 }] }).success).toBe(false)
    expect(livraisonSchema.safeParse({ client_id: CLIENT, id: REQ, lignes: [], ajouts: [{ produit_id: P1, quantite_livree: 0 }] }).success).toBe(false)
    const sortie = { client_id: CLIENT, service_preparateur_id: CUISINE, service_receveur_id: ETAGES, lignes: [{ produit_id: P1, quantite: 2 }] }
    expect(sortieDirecteSchema.safeParse(sortie).success).toBe(true)
    expect(sortieDirecteSchema.safeParse({ ...sortie, service_receveur_id: CUISINE }).success).toBe(false)
  })
})

// ── Fausse base ──────────────────────────────────────────────────────────────

type Row = Record<string, unknown>

function fakeDb(tables: Record<string, Row[]>, rpcResults: Record<string, unknown> = {}) {
  const appels: { table: string; op: string; filtres: unknown[]; payload?: unknown }[] = []
  const rpcCalls: { fn: string; args: Record<string, unknown> }[] = []
  const from = (table: string) => {
    let rows = [...(tables[table] ?? [])]
    const appel = { table, op: 'select', filtres: [] as unknown[], payload: undefined as unknown }
    appels.push(appel)
    const builder = {
      select: () => builder,
      eq: (col: string, val: unknown) => { appel.filtres.push(['eq', col, val]); rows = rows.filter((r) => r[col] === val); return builder },
      in: (col: string, vals: unknown[]) => { appel.filtres.push(['in', col, vals]); rows = rows.filter((r) => vals.includes(r[col])); return builder },
      or: (expr: string) => { appel.filtres.push(['or', expr]); return builder },
      order: () => builder,
      limit: () => builder,
      update: (p: unknown) => { appel.op = 'update'; appel.payload = p; return builder },
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      then: (resolve: (v: { data: Row[]; error: null }) => unknown) => resolve({ data: rows, error: null }),
    }
    return builder
  }
  const rpc = async (fn: string, args: Record<string, unknown>) => {
    rpcCalls.push({ fn, args })
    return { data: fn in rpcResults ? rpcResults[fn] : null, error: null }
  }
  return { db: { from, rpc } as unknown as SupabaseClient, appels, rpcCalls }
}

const svc = (id: string, nom: string, over: Row = {}) => ({
  id, client_id: CLIENT, nom, emoji: null, ordre: 1, actif: true,
  peut_demander: true, peut_preparer: false, stock: 'aucun', ...over,
})

const bon = (over: Row = {}) => ({
  id: REQ, client_id: CLIENT, numero: 12, type: 'demande', statut: 'a_preparer',
  service_demandeur_id: ETAGES, service_preparateur_id: CUISINE, stock: 'cuisine',
  demandeur_id: FDC, envoyee_at: '2026-10-19T08:00:00Z', ...over,
})

const base = (over: Row = {}) => ({
  services_internes: [svc(ETAGES, 'Étages'), svc(CUISINE, 'Cuisine', { peut_demander: false, peut_preparer: true, stock: 'cuisine' })] as Row[],
  service_membres: [
    { client_id: CLIENT, service_id: CUISINE, user_id: CHEF, responsable: false },
    { client_id: CLIENT, service_id: ETAGES, user_id: FDC, responsable: false },
  ],
  clients: [{ id: CLIENT, requisitions_validation: false }],
  requisitions: [bon(over)],
  requisition_lignes: [
    { id: L1, client_id: CLIENT, requisition_id: REQ, ingredient_id: P1, article_id: null },
    { id: L2, client_id: CLIENT, requisition_id: REQ, ingredient_id: P2, article_id: null },
  ],
  ingredients: [
    { id: P1, client_id: CLIENT, nom: 'Fraises', unite: 'kg', prix_kg: 8.5 },
    { id: P2, client_id: CLIENT, nom: 'Mignardises', unite: 'u', prix_kg: '0.6' },
    { id: P3, client_id: CLIENT, nom: 'Citrons', unite: 'kg', prix_kg: 3 },
  ],
})

// ── Prise en charge, livraison, refus ────────────────────────────────────────

describe('préparation', () => {
  it('contexte : le chef prépare pour la cuisine', async () => {
    const { db } = fakeDb(base())
    expect((await contexteUtilisateur(db, CLIENT, CHEF, N())).prepare_pour).toEqual([CUISINE])
    expect((await contexteUtilisateur(db, CLIENT, FDC, N())).prepare_pour).toEqual([])
  })

  it('vue « à préparer » : bons à servir de mes services', async () => {
    const { db, appels } = fakeDb(base())
    const r = await listerRequisitions(db, CLIENT, CHEF, N(), 'a_preparer')
    const lecture = appels.find((a) => a.table === 'requisitions')!
    expect(lecture.filtres).toContainEqual(['in', 'statut', ['a_preparer', 'en_preparation']])
    expect(lecture.filtres).toContainEqual(['in', 'service_preparateur_id', [CUISINE]])
    expect(r.requisitions[0]).toMatchObject({ peut_preparer: true, peut_annuler: false })
  })

  it('prise en charge conditionnée au statut', async () => {
    const { db, appels } = fakeDb(base())
    await prendreEnCharge(db, CLIENT, CHEF, N(), REQ)
    const maj = appels.find((a) => a.op === 'update')!
    expect(maj.payload).toMatchObject({ statut: 'en_preparation', preparateur_id: CHEF })
    expect(maj.filtres).toContainEqual(['eq', 'statut', 'a_preparer'])
  })

  it('la femme de chambre ne prépare pas la commande de la cuisine', async () => {
    const { db } = fakeDb(base())
    await expect(prendreEnCharge(db, CLIENT, FDC, N(), REQ)).rejects.toThrow(ForbiddenError)
  })

  it('livraison : prix figés depuis prix_kg, ajout à la voix, appel atomique', async () => {
    const { db, rpcCalls } = fakeDb(base({ statut: 'en_preparation' }), { requisition_livrer: 12 })
    const r = await livrerRequisition(db, CLIENT, CHEF, N(), REQ, {
      lignes: [{ id: L1, quantite_livree: 1 }, { id: L2, quantite_livree: 10 }],
      ajouts: [{ produit_id: P3, quantite_livree: 0.5 }],
    })
    expect(rpcCalls[0].fn).toBe('requisition_livrer')
    expect(rpcCalls[0].args).toMatchObject({ p_client: CLIENT, p_id: REQ, p_preparateur: CHEF })
    expect(rpcCalls[0].args.p_lignes).toEqual([
      { id: L1, quantite_livree: 1, prix_unitaire: 8.5 },
      { id: L2, quantite_livree: 10, prix_unitaire: 0.6 },
    ])
    expect(rpcCalls[0].args.p_ajouts).toEqual([{ ingredient_id: P3, nom: 'Citrons', unite: 'kg', quantite_livree: 0.5, prix_unitaire: 3, commentaire: null }])
    expect(r.valeur).toBe(16)
  })

  it("livraison refusée si le bon a changé entre-temps (la fonction renvoie NULL)", async () => {
    const { db } = fakeDb(base(), { requisition_livrer: null })
    await expect(livrerRequisition(db, CLIENT, CHEF, N(), REQ, {
      lignes: [{ id: L1, quantite_livree: 1 }, { id: L2, quantite_livree: 1 }], ajouts: [],
    })).rejects.toThrow(ConflictError)
  })

  it("un bon déjà livré n'est plus à préparer", async () => {
    const { db } = fakeDb(base({ statut: 'livree' }))
    await expect(prendreEnCharge(db, CLIENT, CHEF, N(), REQ)).rejects.toThrow(ConflictError)
  })

  it('le préparateur peut refuser une commande à servir', async () => {
    const { db, appels } = fakeDb(base({ statut: 'en_preparation' }))
    await refuserRequisition(db, CLIENT, CHEF, N(), REQ, 'plus de fraises')
    const maj = appels.find((a) => a.op === 'update')!
    expect(maj.payload).toMatchObject({ statut: 'refusee', refusee_par: CHEF, motif_refus: 'plus de fraises' })
    expect(maj.filtres).toContainEqual(['in', 'statut', ['a_preparer', 'en_preparation']])
  })

  it('le demandeur ne refuse pas sa propre commande (il l’annule)', async () => {
    const { db } = fakeDb(base())
    await expect(refuserRequisition(db, CLIENT, FDC, N(), REQ, 'non')).rejects.toThrow(ForbiddenError)
  })
})

// ── Sortie directe ───────────────────────────────────────────────────────────

describe('sortieDirecte', () => {
  const sortie = { service_preparateur_id: CUISINE, service_receveur_id: ETAGES, lignes: [{ produit_id: P1, quantite: 2 }] }

  it('crée un bon livré d’office, valorisé, de la cuisine vers les étages', async () => {
    const { db, rpcCalls } = fakeDb(base(), { requisition_creer: [{ id: REQ, numero: 13 }] })
    const r = await sortieDirecte(db, CLIENT, CHEF, N(), sortie)
    expect(r).toMatchObject({ id: REQ, numero: 13, valeur: 17 })
    expect(rpcCalls[0].args.p_entete).toMatchObject({
      type: 'sortie_directe', statut: 'livree', stock: 'cuisine',
      service_preparateur_id: CUISINE, service_demandeur_id: ETAGES, preparateur_id: CHEF,
    })
    expect(rpcCalls[0].args.p_lignes).toEqual([{
      ingredient_id: P1, nom: 'Fraises', unite: 'kg', quantite_demandee: null, quantite_livree: 2,
      prix_unitaire: 8.5, ajoutee_par_preparateur: true, commentaire: null,
    }])
  })

  it('réservée aux membres du service qui sort le stock', async () => {
    const { db, rpcCalls } = fakeDb(base())
    await expect(sortieDirecte(db, CLIENT, FDC, N(), sortie)).rejects.toThrow(ForbiddenError)
    expect(rpcCalls).toHaveLength(0)
  })

  it('refuse un service sans stock comme source', async () => {
    const { db } = fakeDb(base())
    await expect(sortieDirecte(db, CLIENT, CHEF, N(), { ...sortie, service_preparateur_id: ETAGES, service_receveur_id: CUISINE })).rejects.toThrow(ValidationError)
  })
})

// ── Migration ────────────────────────────────────────────────────────────────

describe('migration livraison', () => {
  const sql = readFileSync(path.resolve(__dirname, '../../supabase/migrations/20261019160000_requisitions_livraison.sql'), 'utf8')

  it('réservée au service_role', () => {
    expect(sql).toMatch(/REVOKE EXECUTE ON FUNCTION public\.requisition_livrer\(uuid, uuid, uuid, jsonb, jsonb\) FROM PUBLIC, anon, authenticated/)
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.requisition_livrer\(uuid, uuid, uuid, jsonb, jsonb\) TO service_role/)
  })

  it('ne livre que depuis « à préparer » ou « en préparation »', () => {
    expect(sql).toMatch(/r\.statut in \('a_preparer', 'en_preparation'\)/)
  })
})
