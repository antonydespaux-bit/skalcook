import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'
import type { SupabaseClient } from '@supabase/supabase-js'

vi.mock('../services/admin.service', () => ({ listClientUsers: async () => [] }))

import {
  erreurService,
  fusionnerService,
  membresHorsEtablissement,
  setMembres,
  updateService,
  peutGererCatalogue,
  normaliserArticle,
  verifierCatalogue,
  type ServiceInterne,
} from '../services/requisitions.service'
import {
  createServiceSchema,
  setMembresSchema,
  updateServiceSchema,
  createArticleSchema,
  updateArticleSchema,
} from '../validators/requisitions.schema'
import { ValidationError, NotFoundError, ForbiddenError } from '../errors'
import { normUnite } from '../constants'

const CLIENT = '11111111-1111-4111-8111-111111111111'
const AUTRE = '22222222-2222-4222-8222-222222222222'
const SERVICE = '33333333-3333-4333-8333-333333333333'
const U1 = '44444444-4444-4444-8444-444444444444'
const U2 = '55555555-5555-4555-8555-555555555555'
const U3 = '66666666-6666-4666-8666-666666666666'

const service = (over: Partial<ServiceInterne> = {}): ServiceInterne => ({
  id: SERVICE, client_id: CLIENT, nom: 'Étages', emoji: '🛏️', ordre: 1, actif: true,
  peut_demander: true, peut_preparer: false, stock: 'aucun', ...over,
})

// ── Règles d'un service ──────────────────────────────────────────────────────

describe('erreurService', () => {
  it('accepte un service qui demande sans stock', () => {
    expect(erreurService({ peut_demander: true, peut_preparer: false, stock: 'aucun' })).toBeNull()
  })
  it('refuse un service qui ne demande ni ne prépare', () => {
    expect(erreurService({ peut_demander: false, peut_preparer: false, stock: 'cuisine' })).toMatch(/demander, préparer/)
  })
  it('refuse un service qui prépare sans stock', () => {
    expect(erreurService({ peut_demander: false, peut_preparer: true, stock: 'aucun' })).toMatch(/stock/)
  })
})

describe('fusionnerService', () => {
  it('applique les champs fournis et garde les autres', () => {
    const f = fusionnerService(service(), { nom: '  Room service ', peut_preparer: true, stock: 'cuisine' })
    expect(f).toMatchObject({ nom: 'Room service', peut_demander: true, peut_preparer: true, stock: 'cuisine', emoji: '🛏️' })
  })
  it('vérifie la ligne complète, pas seulement le patch', () => {
    // Le patch seul est valide, mais le service existant n'a pas de stock.
    expect(() => fusionnerService(service(), { peut_preparer: true })).toThrow(ValidationError)
    expect(() => fusionnerService(service(), { peut_demander: false })).toThrow(ValidationError)
  })
})

describe('membresHorsEtablissement', () => {
  it("liste les utilisateurs sans accès à l'établissement", () => {
    expect(membresHorsEtablissement([U1, U2, U3], [U1, U3])).toEqual([U2])
    expect(membresHorsEtablissement([], [U1])).toEqual([])
  })
})

// ── Validateurs ──────────────────────────────────────────────────────────────

describe('validateurs', () => {
  it('createServiceSchema applique les mêmes règles que la base', () => {
    const base = { client_id: CLIENT, nom: 'Économat', peut_demander: false, peut_preparer: true, stock: 'articles' }
    expect(createServiceSchema.safeParse(base).success).toBe(true)
    expect(createServiceSchema.safeParse({ ...base, stock: 'aucun' }).success).toBe(false)
    expect(createServiceSchema.safeParse({ ...base, peut_preparer: false }).success).toBe(false)
    expect(createServiceSchema.safeParse({ ...base, nom: '   ' }).success).toBe(false)
    expect(createServiceSchema.safeParse({ ...base, stock: 'minibar' }).success).toBe(false)
  })
  it('updateServiceSchema accepte un patch partiel', () => {
    expect(updateServiceSchema.safeParse({ client_id: CLIENT, id: SERVICE, actif: false }).success).toBe(true)
  })
  it('setMembresSchema refuse un utilisateur en double', () => {
    const r = setMembresSchema.safeParse({
      client_id: CLIENT, service_id: SERVICE,
      membres: [{ user_id: U1 }, { user_id: U1, responsable: true }],
    })
    expect(r.success).toBe(false)
  })
})

// ── Écritures (fausse base qui enregistre les appels) ────────────────────────

type Row = Record<string, unknown>

function fakeDb(tables: Record<string, Row[]>) {
  const appels: { table: string; op: string; filtres: unknown[]; payload?: unknown }[] = []
  const from = (table: string) => {
    let rows = [...(tables[table] ?? [])]
    const appel = { table, op: 'select', filtres: [] as unknown[], payload: undefined as unknown }
    const builder = {
      select: () => builder,
      eq: (col: string, val: unknown) => { appel.filtres.push(['eq', col, val]); rows = rows.filter((r) => r[col] === val); return builder },
      in: (col: string, vals: unknown[]) => { appel.filtres.push(['in', col, vals]); rows = rows.filter((r) => vals.includes(r[col])); return builder },
      not: (col: string, op: string, val: unknown) => { appel.filtres.push(['not', col, op, val]); return builder },
      order: () => builder,
      limit: () => builder,
      delete: () => { appel.op = 'delete'; appels.push(appel); return builder },
      update: (p: unknown) => { appel.op = 'update'; appel.payload = p; appels.push(appel); return builder },
      upsert: async (p: unknown) => { appel.op = 'upsert'; appel.payload = p; appels.push(appel); return { error: null } },
      single: async () => ({ data: rows[0] ?? null, error: null }),
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      then: (resolve: (v: { data: Row[]; error: null }) => unknown) => resolve({ data: rows, error: null }),
    }
    return builder
  }
  return { db: { from } as unknown as SupabaseClient, appels }
}

describe('setMembres', () => {
  const tables = () => ({
    services_internes: [service() as unknown as Row],
    acces_clients: [{ client_id: CLIENT, user_id: U1 }, { client_id: CLIENT, user_id: U2 }, { client_id: AUTRE, user_id: U3 }],
  })

  it('retire les absents puis enregistre la liste', async () => {
    const { db, appels } = fakeDb(tables())
    await setMembres(db, CLIENT, SERVICE, [{ user_id: U1, responsable: true }, { user_id: U2, responsable: false }])

    const suppr = appels.find((a) => a.table === 'service_membres' && a.op === 'delete')
    expect(suppr?.filtres).toContainEqual(['eq', 'client_id', CLIENT])
    expect(suppr?.filtres).toContainEqual(['eq', 'service_id', SERVICE])
    expect(suppr?.filtres).toContainEqual(['not', 'user_id', 'in', `(${U1},${U2})`])

    const ups = appels.find((a) => a.table === 'service_membres' && a.op === 'upsert')
    expect(ups?.payload).toEqual([
      { service_id: SERVICE, client_id: CLIENT, user_id: U1, responsable: true },
      { service_id: SERVICE, client_id: CLIENT, user_id: U2, responsable: false },
    ])
  })

  it("refuse un utilisateur d'un autre établissement", async () => {
    const { db, appels } = fakeDb(tables())
    await expect(setMembres(db, CLIENT, SERVICE, [{ user_id: U3, responsable: false }])).rejects.toThrow(ValidationError)
    expect(appels.filter((a) => a.table === 'service_membres')).toHaveLength(0)
  })

  it('liste vide : retire tout le monde sans filtre user_id', async () => {
    const { db, appels } = fakeDb(tables())
    await setMembres(db, CLIENT, SERVICE, [])
    const suppr = appels.find((a) => a.table === 'service_membres' && a.op === 'delete')
    expect(suppr?.filtres.some((f) => (f as unknown[])[0] === 'not')).toBe(false)
    expect(appels.some((a) => a.op === 'upsert')).toBe(false)
  })

  it("ne touche pas au service d'un autre établissement", async () => {
    const { db } = fakeDb(tables())
    await expect(setMembres(db, AUTRE, SERVICE, [])).rejects.toThrow(NotFoundError)
  })
})

describe('updateService', () => {
  it('filtre la mise à jour sur l’établissement', async () => {
    const { db, appels } = fakeDb({ services_internes: [service() as unknown as Row] })
    await updateService(db, CLIENT, SERVICE, { actif: false })
    const maj = appels.find((a) => a.op === 'update')
    expect(maj?.filtres).toContainEqual(['eq', 'client_id', CLIENT])
    expect(maj?.payload).toMatchObject({ actif: false, nom: 'Étages' })
  })
})

// ── Migration : RLS et motif « une fois par requête » ───────────────────────

describe('migration services internes', () => {
  const sql = readFileSync(path.resolve(__dirname, '../../supabase/migrations/20261019130000_requisitions_services.sql'), 'utf8')

  it('active la RLS sur les deux tables', () => {
    expect(sql).toMatch(/ALTER TABLE public\.services_internes ENABLE ROW LEVEL SECURITY/)
    expect(sql).toMatch(/ALTER TABLE public\.service_membres ENABLE ROW LEVEL SECURITY/)
  })

  it('couvre les 4 commandes sur chaque table', () => {
    for (const t of ['services_internes', 'service_membres']) {
      for (const cmd of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
        expect(sql, `${t} ${cmd}`).toMatch(new RegExp(`CREATE POLICY ${t}_${cmd.toLowerCase()} ON public\\.${t} FOR ${cmd}`))
      }
    }
  })

  it("n'appelle les fonctions d'accès que dans des sous-requêtes (initplan)", () => {
    const policies = sql.slice(sql.indexOf('-- ── RLS'))
    // Chaque appel à auth.uid / my_client_ids* / get_my_is_superadmin est précédé de « SELECT ».
    for (const m of policies.matchAll(/(auth\.uid\(\)|public\.my_client_ids(?:_for)?\(|public\.get_my_is_superadmin\(\))/g)) {
      const avant = policies.slice(Math.max(0, m.index! - 16), m.index!)
      expect(avant, m[0]).toMatch(/SELECT\s+(public\.)?$/)
    }
  })

  it("écrit seulement avec « administration » en modification", () => {
    const ecritures = [...sql.matchAll(/FOR (INSERT|UPDATE|DELETE) TO authenticated[\s\S]*?;/g)].map((m) => m[0])
    expect(ecritures).toHaveLength(6)
    for (const e of ecritures) expect(e).toMatch(/my_client_ids_for\('administration', 'modification'\)/)
  })
})

// ── Catalogue d'articles ─────────────────────────────────────────────────────

describe('peutGererCatalogue', () => {
  const N = (administration: string, requisitions: string) => ({ administration, requisitions })
  it("l'administration en modification gère tous les catalogues", () => {
    expect(peutGererCatalogue(N('modification', 'aucun'), false)).toBe(true)
  })
  it('un membre du service avec les réquisitions en modification gère le sien', () => {
    expect(peutGererCatalogue(N('aucun', 'modification'), true)).toBe(true)
  })
  it('ni un non-membre, ni un membre en lecture seule', () => {
    expect(peutGererCatalogue(N('lecture', 'modification'), false)).toBe(false)
    expect(peutGererCatalogue(N('aucun', 'lecture'), true)).toBe(false)
  })
})

describe('articles : normalisation et validateurs', () => {
  it('trime le nom et ramène l’unité à sa forme canonique', () => {
    expect(normaliserArticle({ nom: '  Gel douche ', unite: 'Cartons' })).toEqual({ nom: 'Gel douche', unite: 'carton' })
    expect(normaliserArticle({ unite: '  ' }).unite).toBe('u')
  })
  it('reconnaît les unités des articles', () => {
    expect(normUnite('rouleaux')).toBe('rouleau')
    expect(normUnite('Boites')).toBe('boîte')
    expect(normUnite('pqt')).toBe('paquet')
  })
  it('createArticleSchema : catégorie vide → null, prix négatif refusé', () => {
    const base = { client_id: CLIENT, service_id: SERVICE, nom: 'Savon', unite: 'u' }
    const r = createArticleSchema.safeParse({ ...base, categorie: '', prix_unitaire: '0.35' })
    expect(r.success && r.data.categorie).toBeNull()
    expect(r.success && r.data.prix_unitaire).toBe(0.35)
    expect(createArticleSchema.safeParse({ ...base, prix_unitaire: -1 }).success).toBe(false)
  })
  it('updateArticleSchema laisse les champs absents inchangés', () => {
    const r = updateArticleSchema.safeParse({ client_id: CLIENT, id: SERVICE, actif: false })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.categorie).toBeUndefined()
      expect(r.data.reference).toBeUndefined()
    }
  })
})

describe('verifierCatalogue', () => {
  const economat = service({ nom: 'Économat', peut_demander: false, peut_preparer: true, stock: 'articles' })
  const tables = (stock: ServiceInterne['stock'] = 'articles') => ({
    services_internes: [{ ...economat, stock } as unknown as Row],
    service_membres: [{ client_id: CLIENT, service_id: SERVICE, user_id: U1 }],
  })
  const membre = { administration: 'aucun', requisitions: 'modification' }

  it('accepte un membre du service', async () => {
    const { db } = fakeDb(tables())
    await expect(verifierCatalogue(db, CLIENT, SERVICE, U1, membre)).resolves.toMatchObject({ id: SERVICE })
  })
  it('refuse un non-membre sans administration', async () => {
    const { db } = fakeDb(tables())
    await expect(verifierCatalogue(db, CLIENT, SERVICE, U2, membre)).rejects.toThrow(ForbiddenError)
  })
  it('accepte un administrateur non membre', async () => {
    const { db } = fakeDb(tables())
    await expect(verifierCatalogue(db, CLIENT, SERVICE, U2, { administration: 'modification', requisitions: 'aucun' })).resolves.toBeTruthy()
  })
  it("refuse un service qui ne sert pas d'articles", async () => {
    const { db } = fakeDb(tables('cuisine'))
    await expect(verifierCatalogue(db, CLIENT, SERVICE, U1, membre)).rejects.toThrow(ValidationError)
  })
})

describe('migration articles', () => {
  const sql = readFileSync(path.resolve(__dirname, '../../supabase/migrations/20261019140000_requisitions_articles.sql'), 'utf8')

  it('active la RLS et couvre les 4 commandes', () => {
    expect(sql).toMatch(/ALTER TABLE public\.articles ENABLE ROW LEVEL SECURITY/)
    for (const cmd of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
      expect(sql, cmd).toMatch(new RegExp(`CREATE POLICY articles_${cmd.toLowerCase()} ON public\\.articles FOR ${cmd}`))
    }
  })

  it("n'appelle les fonctions d'accès que dans des sous-requêtes (initplan)", () => {
    const policies = sql.slice(sql.indexOf('-- ── RLS'))
    for (const m of policies.matchAll(/(auth\.uid\(\)|public\.my_(?:client|service)_ids(?:_for)?\(|public\.get_my_is_superadmin\(\))/g)) {
      const avant = policies.slice(Math.max(0, m.index! - 16), m.index!)
      expect(avant, m[0]).toMatch(/SELECT\s+(public\.)?$/)
    }
  })

  it('lecture par « requisitions », écriture par administration ou membre du service', () => {
    const select = sql.match(/CREATE POLICY articles_select[\s\S]*?;/)![0]
    expect(select).toMatch(/my_client_ids_for\('requisitions', 'lecture'\)/)
    for (const cmd of ['insert', 'update', 'delete']) {
      const p = sql.match(new RegExp(`CREATE POLICY articles_${cmd}[\\s\\S]*?;`))![0]
      expect(p, cmd).toMatch(/my_client_ids_for\('administration', 'modification'\)/)
      expect(p, cmd).toMatch(/my_service_ids\(\)/)
    }
  })
})
