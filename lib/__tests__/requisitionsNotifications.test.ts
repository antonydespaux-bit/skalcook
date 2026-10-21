import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'
import type { SupabaseClient } from '@supabase/supabase-js'

import {
  destinataires,
  contenuEmail,
  notifierRequisition,
  marquerLues,
  type Evenement,
} from '../services/requisitionsNotifications.service'
import fr from '../i18n/locales/fr.json'

const CLIENT = '11111111-1111-4111-8111-111111111111'
const ETAGES = '22222222-2222-4222-8222-222222222222'
const CUISINE = '33333333-3333-4333-8333-333333333333'
const CHEF = '44444444-4444-4444-8444-444444444444'
const COMMIS = '55555555-5555-4555-8555-555555555555'
const FDC = '66666666-6666-4666-8666-666666666666'
const GOUV = '77777777-7777-4777-8777-777777777777'
const ADMIN = '88888888-8888-4888-8888-888888888888'
const REQ = '99999999-9999-4999-8999-999999999999'

const bon = { id: REQ, numero: 12, demandeur_id: FDC, service_demandeur_id: ETAGES, service_preparateur_id: CUISINE }
const membres = [
  { service_id: CUISINE, user_id: CHEF, responsable: true },
  { service_id: CUISINE, user_id: COMMIS, responsable: false },
  { service_id: ETAGES, user_id: FDC, responsable: false },
  { service_id: ETAGES, user_id: GOUV, responsable: true },
]

// ── Destinataires ────────────────────────────────────────────────────────────

describe('destinataires', () => {
  it('nouvelle commande et validation → membres du service préparateur', () => {
    expect(destinataires('a_preparer', bon, membres, [], FDC)).toEqual([CHEF, COMMIS])
    expect(destinataires('validee', bon, membres, [], GOUV)).toEqual([CHEF, COMMIS])
  })
  it('à valider → responsables du service demandeur, sinon les administrateurs', () => {
    expect(destinataires('a_valider', bon, membres, [ADMIN], FDC)).toEqual([GOUV])
    expect(destinataires('a_valider', bon, membres.filter((m) => m.user_id !== GOUV), [ADMIN], FDC)).toEqual([ADMIN])
  })
  it('livrée / refusée → la personne qui a demandé', () => {
    expect(destinataires('livree', bon, membres, [], CHEF)).toEqual([FDC])
    expect(destinataires('refusee', bon, membres, [], GOUV)).toEqual([FDC])
    expect(destinataires('livree', { ...bon, demandeur_id: null }, membres, [], CHEF)).toEqual([])
  })
  it("n'avertit jamais l'auteur de l'action", () => {
    expect(destinataires('a_preparer', bon, membres, [], CHEF)).toEqual([COMMIS])
    expect(destinataires('livree', bon, membres, [], FDC)).toEqual([])
  })
})

// ── Emails ───────────────────────────────────────────────────────────────────

describe('contenuEmail', () => {
  const donnees = { numero: 12, de: 'Étages', vers: 'Cuisine', etablissement: 'La Fantaisie' }

  it('sujet et corps remplis depuis les fichiers de langue', () => {
    const { sujet, html } = contenuEmail('fr', 'a_preparer', donnees, 'https://app.skalcook.com/requisitions/x')
    expect(sujet).toBe('Réquisition R-12 à préparer (Étages)')
    expect(html).toContain('R-12')
    expect(html).toContain('https://app.skalcook.com/requisitions/x')
    expect(contenuEmail('en', 'livree', donnees, '#').sujet).toBe('Your requisition R-12 has been delivered')
  })
  it('échappe le HTML (noms de service, motif)', () => {
    const { html } = contenuEmail('fr', 'refusee', { ...donnees, vers: '<b>Bar</b>', motif: '<script>x</script>' }, '#')
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;b&gt;Bar&lt;/b&gt;')
  })
  it('chaque événement a un sujet et un corps dans les 4 langues', () => {
    for (const langue of ['fr', 'en', 'es', 'it'] as const) {
      for (const ev of ['a_preparer', 'a_valider', 'validee', 'livree', 'refusee'] as Evenement[]) {
        const { sujet } = contenuEmail(langue, ev, donnees, '#')
        expect(sujet, `${langue} ${ev}`).toMatch(/R-12/)
      }
    }
  })
})

// ── Envoi ────────────────────────────────────────────────────────────────────

type Row = Record<string, unknown>

function fakeDb(tables: Record<string, Row[]>, { echec = false } = {}) {
  const inserts: { table: string; rows: unknown }[] = []
  const updates: { table: string; payload: unknown; filtres: unknown[] }[] = []
  const from = (table: string) => {
    if (echec) throw new Error('base indisponible')
    let rows = [...(tables[table] ?? [])]
    const filtres: unknown[] = []
    const builder = {
      select: () => builder,
      eq: (col: string, val: unknown) => { filtres.push(['eq', col, val]); rows = rows.filter((r) => r[col] === val); return builder },
      in: (col: string, vals: unknown[]) => { filtres.push(['in', col, vals]); rows = rows.filter((r) => vals.includes(r[col])); return builder },
      is: (col: string, val: unknown) => { filtres.push(['is', col, val]); return builder },
      order: () => builder,
      limit: () => builder,
      insert: async (r: unknown) => { inserts.push({ table, rows: r }); return { error: null } },
      update: (p: unknown) => { updates.push({ table, payload: p, filtres }); return builder },
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      then: (resolve: (v: { data: Row[]; error: null }) => unknown) => resolve({ data: rows, error: null }),
    }
    return builder
  }
  return { db: { from } as unknown as SupabaseClient, inserts, updates }
}

const tables = () => ({
  requisitions: [{ ...bon, client_id: CLIENT }],
  service_membres: membres.map((m) => ({ ...m, client_id: CLIENT })),
  clients: [{ id: CLIENT, nom: 'fantaisie', nom_etablissement: 'La Fantaisie' }],
  services_internes: [{ id: ETAGES, client_id: CLIENT, nom: 'Étages' }, { id: CUISINE, client_id: CLIENT, nom: 'Cuisine' }],
  acces_clients: [{ client_id: CLIENT, user_id: ADMIN, role: 'admin' }],
  profils: [{ id: CHEF, email: 'chef@exemple.fr' }, { id: COMMIS, email: null }],
})

describe('notifierRequisition', () => {
  beforeEach(() => { vi.unstubAllEnvs() })

  it('enregistre une notification par destinataire, avec les données du bon', async () => {
    vi.stubEnv('RESEND_API_KEY', '')
    const { db, inserts } = fakeDb(tables())
    const r = await notifierRequisition(db, { clientId: CLIENT, requisitionId: REQ, evenement: 'a_preparer', acteurId: FDC })
    expect(r).toEqual({ notifies: 2, emails: 0 })
    expect(inserts[0].table).toBe('notifications')
    expect(inserts[0].rows).toEqual([CHEF, COMMIS].map((user_id) => ({
      client_id: CLIENT, user_id, type: 'requisition_a_preparer', requisition_id: REQ,
      donnees: { numero: 12, de: 'Étages', vers: 'Cuisine', motif: null },
    })))
  })

  it("ne lève jamais d'erreur (l'action de l'utilisateur ne doit pas échouer)", async () => {
    const { db } = fakeDb(tables(), { echec: true })
    await expect(notifierRequisition(db, { clientId: CLIENT, requisitionId: REQ, evenement: 'livree', acteurId: CHEF })).resolves.toEqual({ notifies: 0, emails: 0 })
  })

  it('bon introuvable : rien envoyé', async () => {
    const { db, inserts } = fakeDb({ ...tables(), requisitions: [] })
    expect(await notifierRequisition(db, { clientId: CLIENT, requisitionId: REQ, evenement: 'livree', acteurId: CHEF })).toEqual({ notifies: 0, emails: 0 })
    expect(inserts).toHaveLength(0)
  })
})

describe('marquerLues', () => {
  it("ne touche qu'aux non lues de l'utilisateur dans l'établissement", async () => {
    const { db, updates } = fakeDb({ notifications: [] })
    await marquerLues(db, CLIENT, FDC, [REQ])
    expect(updates[0].filtres).toEqual(expect.arrayContaining([
      ['eq', 'client_id', CLIENT], ['eq', 'user_id', FDC], ['is', 'lu_at', null], ['in', 'id', [REQ]],
    ]))
  })
})

// ── Migration et cohérence des types ─────────────────────────────────────────

describe('migration notifications', () => {
  const sql = readFileSync(path.resolve(__dirname, '../../supabase/migrations/20261019170000_requisitions_notifications.sql'), 'utf8')

  it("lecture de ses propres notifications seulement, pas d'écriture directe", () => {
    expect(sql).toMatch(/ALTER TABLE public\.notifications ENABLE ROW LEVEL SECURITY/)
    expect(sql).toMatch(/user_id = \(SELECT auth\.uid\(\)\)/)
    expect(sql).not.toMatch(/CREATE POLICY \w+ ON public\.notifications FOR (INSERT|UPDATE|DELETE|ALL)/)
  })

  it('les types autorisés en base ont un texte dans le pop-up', () => {
    const types = [...sql.matchAll(/'(requisition_[a-z_]+)'/g)].map((m) => m[1])
    expect(types.length).toBe(5)
    for (const ty of types) expect((fr.requisitions.notifications.types as Record<string, string>)[ty], ty).toBeTruthy()
  })
})
