import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'fs'
import path from 'path'

// Depuis le 2026-10-30, Supabase n'accorde plus automatiquement l'accès Data
// API aux nouvelles tables de « public » : toute table créée par une
// migration postérieure doit recevoir ses GRANT dans la même migration, au
// moins pour service_role (routes API) et authenticated (accès direct sous RLS).

const DOSSIER = path.resolve(__dirname, '../../supabase/migrations')
// Première migration concernée (antérieures : tables déjà créées en prod).
const DEPUIS = '20261019'

const migrations = readdirSync(DOSSIER).filter((f) => f.endsWith('.sql') && f >= DEPUIS).sort()

describe('GRANT explicites des nouvelles tables', () => {
  for (const f of migrations) {
    const sql = readFileSync(path.join(DOSSIER, f), 'utf8')
    const tables = [...sql.matchAll(/CREATE TABLE (?:IF NOT EXISTS )?public\.(\w+)/gi)].map((m) => m[1])
    for (const t of tables) {
      it(`${f} › ${t}`, () => {
        expect(sql, 'service_role').toMatch(new RegExp(`GRANT [A-Z, ]+ ON public\\.${t} TO service_role`, 'i'))
        expect(sql, 'authenticated').toMatch(new RegExp(`GRANT [A-Z, ]*SELECT[A-Z, ]* ON public\\.${t} TO authenticated`, 'i'))
        expect(sql, 'anon fermé').toMatch(new RegExp(`REVOKE ALL ON public\\.${t} FROM anon`, 'i'))
        expect(sql, 'RLS').toMatch(new RegExp(`ALTER TABLE public\\.${t} ENABLE ROW LEVEL SECURITY`, 'i'))
      })
    }
  }

  it('couvre au moins les 6 tables des réquisitions', () => {
    const toutes = migrations.flatMap((f) => [...readFileSync(path.join(DOSSIER, f), 'utf8').matchAll(/CREATE TABLE (?:IF NOT EXISTS )?public\.(\w+)/gi)].map((m) => m[1]))
    expect(toutes).toEqual(expect.arrayContaining(['articles', 'notifications', 'requisition_lignes', 'requisitions', 'service_membres', 'services_internes']))
  })
})
