import { describe, it, expect } from 'vitest'
import fr from '../i18n/locales/fr.json'
import en from '../i18n/locales/en.json'
import es from '../i18n/locales/es.json'
import it_ from '../i18n/locales/it.json'
import { ROLES } from '../permissions'

// Les textes du module Réquisitions existent dans les 4 langues, avec les
// mêmes clés et les mêmes variables d'interpolation.

type Arbre = { [k: string]: string | Arbre }

function feuilles(o: Arbre, prefixe = ''): Map<string, string> {
  const out = new Map<string, string>()
  for (const [k, v] of Object.entries(o)) {
    const cle = prefixe ? `${prefixe}.${k}` : k
    if (typeof v === 'string') out.set(cle, v)
    else for (const [ck, cv] of feuilles(v, cle)) out.set(ck, cv)
  }
  return out
}

const variables = (s: string) => [...s.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort()

const LANGUES = { en, es, it: it_ } as Record<string, { requisitions: Arbre; admin: { users: Record<string, Arbre> } }>
const ref = feuilles((fr as unknown as { requisitions: Arbre }).requisitions)

describe('i18n réquisitions', () => {
  it('le français définit le module', () => {
    expect(ref.size).toBeGreaterThan(20)
  })

  for (const [langue, dico] of Object.entries(LANGUES)) {
    it(`${langue} : mêmes clés et mêmes variables que le français`, () => {
      const autre = feuilles(dico.requisitions)
      expect([...autre.keys()].sort()).toEqual([...ref.keys()].sort())
      for (const [cle, texte] of ref) {
        expect(variables(autre.get(cle)!), `${langue} ${cle}`).toEqual(variables(texte))
        expect(autre.get(cle)!.trim(), `${langue} ${cle}`).not.toBe('')
      }
    })
  }

  it('chaque rôle a un libellé dans les 4 langues', () => {
    for (const dico of [fr, en, es, it_] as unknown as { admin: { users: { roles: Record<string, string> } } }[]) {
      for (const r of ROLES.filter((x) => x !== 'consultant')) expect(dico.admin.users.roles[r], r).toBeTruthy()
    }
  })
})
