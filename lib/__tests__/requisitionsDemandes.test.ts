import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'
import type { SupabaseClient } from '@supabase/supabase-js'

import {
  statutInitial,
  peutAnnuler,
  voitTout,
  commandePourTous,
  sourceCatalogue,
  verifierCouple,
  construireLignes,
  estVisible,
  creerDemande,
  annulerRequisition,
  listerRequisitions,
  contexteUtilisateur,
  peutValider,
  validerRequisition,
  refuserRequisition,
} from '../services/requisitionsDemandes.service'
import { createRequisitionSchema, refusRequisitionSchema } from '../validators/requisitions.schema'
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../errors'

const CLIENT = '11111111-1111-4111-8111-111111111111'
const ETAGES = '22222222-2222-4222-8222-222222222222'
const CUISINE = '33333333-3333-4333-8333-333333333333'
const ECONOMAT = '44444444-4444-4444-8444-444444444444'
const MOI = '55555555-5555-4555-8555-555555555555'
const AUTRE = '66666666-6666-4666-8666-666666666666'
const P1 = '77777777-7777-4777-8777-777777777777'
const P2 = '88888888-8888-4888-8888-888888888888'
const REQ = '99999999-9999-4999-8999-999999999999'

const N = (over: Partial<{ administration: string; requisitions: string; analyses: string }> = {}) => ({
  administration: 'aucun', requisitions: 'modification', analyses: 'aucun', ...over,
})

const svc = (id: string, nom: string, over: Record<string, unknown> = {}) => ({
  id, client_id: CLIENT, nom, emoji: null, ordre: 1, actif: true,
  peut_demander: true, peut_preparer: false, stock: 'aucun', ...over,
})

const SERVICES = [
  svc(ETAGES, 'Étages'),
  svc(CUISINE, 'Cuisine', { peut_demander: false, peut_preparer: true, stock: 'cuisine' }),
  svc(ECONOMAT, 'Économat', { peut_demander: false, peut_preparer: true, stock: 'articles' }),
]

// ── Règles pures ─────────────────────────────────────────────────────────────

describe('règles des demandes', () => {
  it('statut initial selon la validation', () => {
    expect(statutInitial(true)).toBe('a_valider')
    expect(statutInitial(false)).toBe('a_preparer')
  })

  it("annulable seulement avant la préparation", () => {
    expect(peutAnnuler('a_valider')).toBe(true)
    expect(peutAnnuler('a_preparer')).toBe(true)
    for (const s of ['en_preparation', 'livree', 'refusee', 'annulee'] as const) expect(peutAnnuler(s), s).toBe(false)
  })

  it('direction et administration voient tout, pas le personnel', () => {
    expect(voitTout(N({ analyses: 'lecture' }))).toBe(true)
    expect(voitTout(N({ administration: 'lecture' }))).toBe(true)
    expect(voitTout(N())).toBe(false)
    expect(commandePourTous(N({ administration: 'modification' }))).toBe(true)
    expect(commandePourTous(N({ administration: 'lecture' }))).toBe(false)
  })

  it('catalogue selon le stock du préparateur', () => {
    expect(sourceCatalogue('cuisine')).toEqual({ table: 'ingredients', colonne: 'ingredient_id' })
    expect(sourceCatalogue('bar')).toEqual({ table: 'ingredients_bar', colonne: 'ingredient_id' })
    expect(sourceCatalogue('articles')).toEqual({ table: 'articles', colonne: 'article_id' })
    expect(() => sourceCatalogue('aucun')).toThrow(ValidationError)
  })

  it('verifierCouple', () => {
    const [etages, cuisine] = SERVICES as never[]
    expect(() => verifierCouple(etages, cuisine, true)).not.toThrow()
    expect(() => verifierCouple(etages, cuisine, false)).toThrow(ForbiddenError)
    expect(() => verifierCouple({ ...(etages as object), actif: false } as never, cuisine, true)).toThrow(ValidationError)
    expect(() => verifierCouple(cuisine, cuisine, true)).toThrow(ValidationError) // cuisine ne demande pas
    expect(() => verifierCouple(etages, etages, true)).toThrow(ValidationError)   // étages ne prépare pas
  })

  it('construireLignes fige nom et unité, refuse un produit hors catalogue', () => {
    const produits = [{ id: P1, nom: 'Fraises', unite: 'kg' }, { id: P2, nom: 'Mignardises', unite: null }]
    expect(construireLignes([{ produit_id: P1, quantite: 2 }, { produit_id: P2, quantite: 12, commentaire: 'ch. 204' }], produits, 'ingredient_id')).toEqual([
      { ingredient_id: P1, nom: 'Fraises', unite: 'kg', quantite_demandee: 2, commentaire: null },
      { ingredient_id: P2, nom: 'Mignardises', unite: 'u', quantite_demandee: 12, commentaire: 'ch. 204' },
    ])
    expect(() => construireLignes([{ produit_id: REQ, quantite: 1 }], produits, 'article_id')).toThrow(ValidationError)
  })

  it('visibilité : services du bon ou vue globale', () => {
    const r = { service_demandeur_id: ETAGES, service_preparateur_id: CUISINE }
    expect(estVisible(r, new Set([ETAGES]), N())).toBe(true)
    expect(estVisible(r, new Set([CUISINE]), N())).toBe(true)
    expect(estVisible(r, new Set([ECONOMAT]), N())).toBe(false)
    expect(estVisible(r, new Set(), N({ analyses: 'lecture' }))).toBe(true)
  })

  it('createRequisitionSchema', () => {
    const base = { client_id: CLIENT, service_demandeur_id: ETAGES, service_preparateur_id: CUISINE, lignes: [{ produit_id: P1, quantite: '1,5'.replace(',', '.') }] }
    expect(createRequisitionSchema.safeParse(base).success).toBe(true)
    expect(createRequisitionSchema.safeParse({ ...base, lignes: [] }).success).toBe(false)
    expect(createRequisitionSchema.safeParse({ ...base, lignes: [{ produit_id: P1, quantite: 0 }] }).success).toBe(false)
    expect(createRequisitionSchema.safeParse({ ...base, lignes: [{ produit_id: P1, quantite: 1 }, { produit_id: P1, quantite: 2 }] }).success).toBe(false)
    expect(createRequisitionSchema.safeParse({ ...base, service_preparateur_id: ETAGES }).success).toBe(false)
  })
})

// ── Fausse base ──────────────────────────────────────────────────────────────

type Row = Record<string, unknown>

function fakeDb(tables: Record<string, Row[]>, rpcResult: Row[] = [{ id: REQ, numero: 7 }]) {
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
      ilike: (col: string, motif: string) => { appel.filtres.push(['ilike', col, motif]); return builder },
      order: () => builder,
      limit: () => builder,
      update: (p: unknown) => { appel.op = 'update'; appel.payload = p; return builder },
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      then: (resolve: (v: { data: Row[]; error: null }) => unknown) => resolve({ data: rows, error: null }),
    }
    return builder
  }
  const rpc = async (fn: string, args: Record<string, unknown>) => { rpcCalls.push({ fn, args }); return { data: rpcResult, error: null } }
  return { db: { from, rpc } as unknown as SupabaseClient, appels, rpcCalls }
}

const base = (validation = false) => ({
  services_internes: SERVICES as Row[],
  service_membres: [{ client_id: CLIENT, service_id: ETAGES, user_id: MOI }],
  clients: [{ id: CLIENT, requisitions_validation: validation }],
  ingredients: [{ id: P1, client_id: CLIENT, nom: 'Fraises', unite: 'kg' }],
  articles: [{ id: P2, client_id: CLIENT, service_id: ECONOMAT, nom: 'Savon', unite: 'u', actif: true }],
})

// ── Contexte et création ─────────────────────────────────────────────────────

describe('contexteUtilisateur', () => {
  it('le personnel commande pour ses services, vers les services qui préparent', async () => {
    const { db } = fakeDb(base(true))
    const ctx = await contexteUtilisateur(db, CLIENT, MOI, N())
    expect(ctx.demandeurs).toEqual([ETAGES])
    expect(ctx.destinataires).toEqual([CUISINE, ECONOMAT])
    expect(ctx.validation).toBe(true)
    expect(ctx.voit_tout).toBe(false)
  })
  it("l'administrateur commande pour tout service demandeur", async () => {
    const { db } = fakeDb(base())
    const ctx = await contexteUtilisateur(db, CLIENT, AUTRE, N({ administration: 'modification' }))
    expect(ctx.demandeurs).toEqual([ETAGES])
    expect(ctx.mes_services).toEqual([])
  })
})

describe('creerDemande', () => {
  const demande = (over = {}) => ({
    service_demandeur_id: ETAGES, service_preparateur_id: CUISINE,
    lignes: [{ produit_id: P1, quantite: 3 }], ...over,
  })

  it('crée le bon avec lignes figées et statut « à préparer »', async () => {
    const { db, rpcCalls } = fakeDb(base(false))
    const r = await creerDemande(db, CLIENT, MOI, N(), demande())
    expect(r).toMatchObject({ id: REQ, numero: 7, statut: 'a_preparer' })
    expect(rpcCalls[0].fn).toBe('requisition_creer')
    expect(rpcCalls[0].args.p_entete).toMatchObject({
      client_id: CLIENT, type: 'demande', statut: 'a_preparer',
      service_demandeur_id: ETAGES, service_preparateur_id: CUISINE, stock: 'cuisine', demandeur_id: MOI,
    })
    expect(rpcCalls[0].args.p_lignes).toEqual([{ ingredient_id: P1, nom: 'Fraises', unite: 'kg', quantite_demandee: 3, commentaire: null }])
  })

  it('statut « à valider » quand la validation est activée', async () => {
    const { db } = fakeDb(base(true))
    expect((await creerDemande(db, CLIENT, MOI, N(), demande())).statut).toBe('a_valider')
  })

  it("prend les articles du catalogue de l'économat", async () => {
    const { db, rpcCalls, appels } = fakeDb(base())
    await creerDemande(db, CLIENT, MOI, N(), demande({ service_preparateur_id: ECONOMAT, lignes: [{ produit_id: P2, quantite: 10 }] }))
    expect(rpcCalls[0].args.p_lignes).toEqual([{ article_id: P2, nom: 'Savon', unite: 'u', quantite_demandee: 10, commentaire: null }])
    const lecture = appels.find((a) => a.table === 'articles')!
    expect(lecture.filtres).toContainEqual(['eq', 'service_id', ECONOMAT])
    expect(lecture.filtres).toContainEqual(['eq', 'actif', true])
  })

  it("refuse un non-membre du service demandeur", async () => {
    const { db, rpcCalls } = fakeDb(base())
    await expect(creerDemande(db, CLIENT, AUTRE, N(), demande())).rejects.toThrow(ForbiddenError)
    expect(rpcCalls).toHaveLength(0)
  })

  it("refuse un produit d'un autre catalogue", async () => {
    const { db } = fakeDb(base())
    await expect(creerDemande(db, CLIENT, MOI, N(), demande({ lignes: [{ produit_id: P2, quantite: 1 }] }))).rejects.toThrow(ValidationError)
  })
})

// ── Liste et annulation ──────────────────────────────────────────────────────

const bon = (over: Row = {}) => ({
  id: REQ, client_id: CLIENT, numero: 7, type: 'demande', statut: 'a_preparer',
  service_demandeur_id: ETAGES, service_preparateur_id: CUISINE, stock: 'cuisine',
  demandeur_id: MOI, envoyee_at: '2026-10-19T08:00:00Z', ...over,
})

describe('listerRequisitions', () => {
  it('« mes demandes » filtre sur mes services demandeurs et mes bons', async () => {
    const { db, appels } = fakeDb({ ...base(), requisitions: [bon()], requisition_lignes: [{ client_id: CLIENT, requisition_id: REQ }] })
    const r = await listerRequisitions(db, CLIENT, MOI, N(), 'mes_demandes')
    const lecture = appels.find((a) => a.table === 'requisitions')!
    expect(lecture.filtres).toContainEqual(['or', `demandeur_id.eq.${MOI},service_demandeur_id.in.(${ETAGES})`])
    expect(r.requisitions[0]).toMatchObject({ nb_lignes: 1, peut_annuler: true })
  })
  it('« toutes » est réservé à la direction', async () => {
    const { db } = fakeDb({ ...base(), requisitions: [] })
    await expect(listerRequisitions(db, CLIENT, MOI, N(), 'toutes')).rejects.toThrow(ForbiddenError)
    await expect(listerRequisitions(db, CLIENT, MOI, N({ analyses: 'lecture' }), 'toutes')).resolves.toBeTruthy()
  })
})

describe('annulerRequisition', () => {
  it('annule sous condition de statut', async () => {
    const { db, appels } = fakeDb({ ...base(), requisitions: [bon()] })
    await annulerRequisition(db, CLIENT, MOI, N(), REQ)
    const maj = appels.find((a) => a.op === 'update')!
    expect(maj.payload).toMatchObject({ statut: 'annulee' })
    expect(maj.filtres).toContainEqual(['in', 'statut', ['a_valider', 'a_preparer']])
  })
  it('refuse une fois la préparation commencée', async () => {
    const { db } = fakeDb({ ...base(), requisitions: [bon({ statut: 'en_preparation' })] })
    await expect(annulerRequisition(db, CLIENT, MOI, N(), REQ)).rejects.toThrow(ConflictError)
  })
  it("un bon d'un autre service est introuvable", async () => {
    const { db } = fakeDb({ ...base(), requisitions: [bon({ service_demandeur_id: ECONOMAT, demandeur_id: AUTRE })] })
    await expect(annulerRequisition(db, CLIENT, MOI, N(), REQ)).rejects.toThrow(NotFoundError)
  })
  it('le préparateur voit le bon mais ne peut pas l’annuler', async () => {
    const { db } = fakeDb({
      ...base(), requisitions: [bon({ demandeur_id: AUTRE })],
      service_membres: [{ client_id: CLIENT, service_id: CUISINE, user_id: MOI }],
    })
    await expect(annulerRequisition(db, CLIENT, MOI, N(), REQ)).rejects.toThrow(ForbiddenError)
  })
})

// ── Validation ───────────────────────────────────────────────────────────────

describe('validation des demandes', () => {
  const responsable = { client_id: CLIENT, service_id: ETAGES, user_id: MOI, responsable: true }
  const tables = (over: Row = {}, membres: Row[] = [responsable]) => ({
    ...base(true), service_membres: membres, requisitions: [bon({ statut: 'a_valider', demandeur_id: AUTRE, ...over })],
  })

  it('peutValider : responsable du service demandeur ou administration', () => {
    const r = { statut: 'a_valider' as const, service_demandeur_id: ETAGES }
    expect(peutValider(r, new Set([ETAGES]), N())).toBe(true)
    expect(peutValider(r, new Set([CUISINE]), N())).toBe(false)
    expect(peutValider(r, new Set(), N({ administration: 'modification' }))).toBe(true)
    expect(peutValider(r, new Set([ETAGES]), N({ requisitions: 'lecture' }))).toBe(false)
    expect(peutValider({ ...r, statut: 'a_preparer' }, new Set([ETAGES]), N())).toBe(false)
  })

  it('le responsable contexte : valide_pour', async () => {
    const { db } = fakeDb(tables())
    expect((await contexteUtilisateur(db, CLIENT, MOI, N())).valide_pour).toEqual([ETAGES])
  })

  it('vue « à valider » : demandes en attente de mes services', async () => {
    const { db, appels } = fakeDb(tables())
    const r = await listerRequisitions(db, CLIENT, MOI, N(), 'a_valider')
    const lecture = appels.find((a) => a.table === 'requisitions')!
    expect(lecture.filtres).toContainEqual(['eq', 'statut', 'a_valider'])
    expect(lecture.filtres).toContainEqual(['in', 'service_demandeur_id', [ETAGES]])
    expect(r.requisitions[0].peut_valider).toBe(true)
  })

  it("vue « à valider » vide pour un simple membre", async () => {
    const { db, appels } = fakeDb(tables({}, [{ ...responsable, responsable: false }]))
    expect((await listerRequisitions(db, CLIENT, MOI, N(), 'a_valider')).requisitions).toEqual([])
    // Retour anticipé : la requête n'est ni restreinte aux services ni exécutée.
    expect(appels.find((a) => a.table === 'requisitions')!.filtres.some((f) => (f as unknown[])[0] === 'in')).toBe(false)
  })

  it('valider : passe en préparation, sous condition de statut', async () => {
    const { db, appels } = fakeDb(tables())
    await validerRequisition(db, CLIENT, MOI, N(), REQ)
    const maj = appels.find((a) => a.op === 'update')!
    expect(maj.payload).toMatchObject({ statut: 'a_preparer', valideur_id: MOI })
    expect(maj.filtres).toContainEqual(['eq', 'statut', 'a_valider'])
  })

  it('refuser : statut refusée et motif', async () => {
    const { db, appels } = fakeDb(tables())
    await refuserRequisition(db, CLIENT, MOI, N(), REQ, '  trop  ')
    expect(appels.find((a) => a.op === 'update')!.payload).toMatchObject({ statut: 'refusee', refusee_par: MOI, motif_refus: 'trop' })
  })

  it("un simple membre ne valide pas", async () => {
    const { db } = fakeDb(tables({}, [{ ...responsable, responsable: false }]))
    await expect(validerRequisition(db, CLIENT, MOI, N(), REQ)).rejects.toThrow(ForbiddenError)
  })

  it("une demande déjà en préparation ne se valide plus", async () => {
    const { db } = fakeDb(tables({ statut: 'a_preparer' }))
    await expect(validerRequisition(db, CLIENT, MOI, N(), REQ)).rejects.toThrow(ConflictError)
    // Le refus passe alors au service préparateur, pas au responsable demandeur.
    await expect(refuserRequisition(db, CLIENT, MOI, N(), REQ, 'non')).rejects.toThrow(ForbiddenError)
  })

  it('le refus exige un motif', () => {
    expect(refusRequisitionSchema.safeParse({ client_id: CLIENT, id: REQ, motif: '  ' }).success).toBe(false)
    expect(refusRequisitionSchema.safeParse({ client_id: CLIENT, id: REQ, motif: 'stock' }).success).toBe(true)
  })
})

// ── Migration ────────────────────────────────────────────────────────────────

describe('migration des bons', () => {
  const sql = readFileSync(path.resolve(__dirname, '../../supabase/migrations/20261019150000_requisitions.sql'), 'utf8')

  it('RLS activée, lecture seule en accès direct', () => {
    expect(sql).toMatch(/ALTER TABLE public\.requisitions ENABLE ROW LEVEL SECURITY/)
    expect(sql).toMatch(/ALTER TABLE public\.requisition_lignes ENABLE ROW LEVEL SECURITY/)
    expect(sql).not.toMatch(/CREATE POLICY \w+ ON public\.requisition(s|_lignes) FOR (INSERT|UPDATE|DELETE|ALL)/)
  })

  it('la création atomique est réservée au service_role', () => {
    expect(sql).toMatch(/REVOKE EXECUTE ON FUNCTION public\.requisition_creer\(jsonb, jsonb\) FROM PUBLIC, anon, authenticated/)
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.requisition_creer\(jsonb, jsonb\) TO service_role/)
  })

  it("n'appelle les fonctions d'accès que dans des sous-requêtes (initplan)", () => {
    const policies = sql.slice(sql.indexOf('-- ── RLS'))
    for (const m of policies.matchAll(/(auth\.uid\(\)|public\.my_(?:client|service)_ids(?:_for)?\(|public\.get_my_is_superadmin\(\))/g)) {
      const avant = policies.slice(Math.max(0, m.index! - 16), m.index!)
      expect(avant, m[0]).toMatch(/SELECT\s+(public\.)?$/)
    }
  })
})
