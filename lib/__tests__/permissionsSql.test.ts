import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'fs'
import path from 'path'
import { FONCTIONNALITES, ROLES } from '../permissions'

// Les défauts de la matrice existent en double : FONCTIONNALITES (JS, menus
// et routes API) et public.permission_defaut (SQL, policies RLS). Ce test
// lit la DERNIÈRE migration qui (re)définit permission_defaut et vérifie que
// les deux restent identiques, ainsi que la table → fonctionnalité des
// policies.

const DOSSIER = path.resolve(__dirname, '../../supabase/migrations')

function derniereMigration(motif: RegExp): { nom: string; sql: string } {
  const fichiers = readdirSync(DOSSIER).filter((f) => f.endsWith('.sql')).sort()
  for (let i = fichiers.length - 1; i >= 0; i--) {
    const sql = readFileSync(path.join(DOSSIER, fichiers[i]), 'utf8')
    if (motif.test(sql)) return { nom: fichiers[i], sql }
  }
  throw new Error(`Aucune migration ne correspond à ${motif}`)
}

const { nom, sql } = derniereMigration(/FUNCTION public\.permission_defaut\(/)

function defautsSql(): Map<string, string[]> {
  const corps = sql.slice(sql.indexOf('FUNCTION public.permission_defaut('))
  const fin = corps.indexOf('$function$;')
  const out = new Map<string, string[]>()
  for (const m of corps.slice(0, fin).matchAll(/\('([a-z_]+)',\s*ARRAY\[([^\]]*)\]\)/g)) {
    out.set(m[1], [...m[2].matchAll(/'([a-z]+)'/g)].map((x) => x[1]))
  }
  return out
}

describe(`défauts SQL (${nom})`, () => {
  const sqlDefauts = defautsSql()

  it('mêmes fonctionnalités que lib/permissions.js', () => {
    expect([...sqlDefauts.keys()].sort()).toEqual(FONCTIONNALITES.map((f) => f.id).sort())
  })

  it('mêmes niveaux par rôle', () => {
    for (const f of FONCTIONNALITES) expect(sqlDefauts.get(f.id), f.id).toEqual(f.defauts)
  })

  it("même ordre des rôles", () => {
    const m = sql.match(/array_position\(array\[([^\]]*)\], p_role\)/)
    expect(m).not.toBeNull()
    expect([...m![1].matchAll(/'([a-z]+)'/g)].map((x) => x[1])).toEqual(ROLES)
  })
})

describe('policies RLS : table → fonctionnalité', () => {
  const { sql: sqlPolicies } = derniereMigration(/INSERT INTO _rls_matrice VALUES/)
  const bloc = sqlPolicies.slice(sqlPolicies.indexOf('INSERT INTO _rls_matrice VALUES'), sqlPolicies.indexOf('DO $migration$'))
  const lignes = [...bloc.matchAll(/^\s*\('([a-z_]+)',\s*(NULL|'[^']*'),\s*(NULL|'[^']*'),\s*'([siud]+)'/gm)]
  const ids = new Set(FONCTIONNALITES.map((f) => f.id))

  it('chaque table est mappée une seule fois', () => {
    const tables = lignes.map((l) => l[1])
    expect(tables.length).toBeGreaterThan(40)
    expect(new Set(tables).size).toBe(tables.length)
  })

  it('ne référence que des fonctionnalités du catalogue', () => {
    for (const l of lignes) {
      for (const champ of [l[2], l[3]]) {
        if (champ === 'NULL' || champ === "'*'") continue
        for (const f of champ.slice(1, -1).split('|')) expect(ids.has(f), `${l[1]} → ${f}`).toBe(true)
      }
    }
  })
})
