import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { logServeur } from '../serverLog'

function fakeDb(insertError: string | null = null) {
  const inserts: Record<string, unknown>[] = []
  const db = {
    from: (table: string) => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { nom: 'Chef Paul', role: 'admin' }, error: null }) }) }),
      insert: async (rows: Record<string, unknown>[]) => {
        if (table === 'logs') inserts.push(...rows)
        return { error: insertError ? { message: insertError } : null }
      },
    }),
  }
  return { db: db as unknown as SupabaseClient, inserts }
}

describe('logServeur', () => {
  it('écrit une ligne de journal complète', async () => {
    const { db, inserts } = fakeDb()
    const request = new Request('http://x', { headers: { 'user-agent': 'Mozilla/5.0 (iPhone)' } })
    await logServeur(db, {
      user: { id: 'u1', email: 'paul@x.fr' }, clientId: 'c1', action: 'CREATION', entite: 'achats_factures',
      entiteId: 'f1', entiteNom: 'Metro · F123', section: 'cuisine', details: { lignes: 3 }, request,
    })
    expect(inserts).toEqual([expect.objectContaining({
      client_id: 'c1', user_id: 'u1', user_nom: 'Chef Paul', user_role: 'admin', action: 'CREATION',
      entite: 'achats_factures', entite_id: 'f1', entite_nom: 'Metro · F123', section: 'cuisine',
      details: '{"lignes":3}', user_agent: 'Mozilla/5.0 (iPhone)',
    })])
  })

  it("n'écrit rien sans utilisateur ou sans établissement", async () => {
    const { db, inserts } = fakeDb()
    await logServeur(db, { user: null, clientId: 'c1', action: 'IMPORT', entite: 'inventaires' })
    await logServeur(db, { user: { id: 'u1' }, clientId: '', action: 'IMPORT', entite: 'inventaires' })
    expect(inserts).toHaveLength(0)
  })

  it('superadmin hors établissement : client_id null si explicitement autorisé', async () => {
    const { db, inserts } = fakeDb()
    await logServeur(db, { user: { id: 'sa' }, clientId: null, sansEtablissement: true, action: 'CONNEXION', entite: 'session' })
    expect(inserts).toEqual([expect.objectContaining({ client_id: null, action: 'CONNEXION' })])
  })

  it("ne lève jamais, même si l'insertion échoue", async () => {
    const { db } = fakeDb('boom')
    await expect(logServeur(db, { user: { id: 'u1' }, clientId: 'c1', action: 'IMPORT', entite: 'inventaires' })).resolves.toBeUndefined()
  })
})
