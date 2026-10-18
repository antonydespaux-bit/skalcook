import { describe, it, expect } from 'vitest'
import {
  FONCTIONNALITES, ROLES, niveauParDefaut, niveauEffectif, atteint,
  fonctionnalitePourChemin, matriceComplete, ecartsAStocker,
} from '../permissions'

describe('catalogue', () => {
  it('chaque fonctionnalité a un défaut par rôle et un id unique', () => {
    const ids = FONCTIONNALITES.map((f) => f.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const f of FONCTIONNALITES) expect(f.defauts).toHaveLength(ROLES.length)
  })

  it('les défauts reproduisent les droits codés avant la matrice', () => {
    expect(niveauParDefaut('achats', 'admin')).toBe('modification')
    expect(niveauParDefaut('achats', 'cuisine')).toBe('lecture')
    expect(niveauParDefaut('food_cost', 'cuisine')).toBe('aucun')
    expect(niveauParDefaut('food_cost', 'directeur')).toBe('modification')
    expect(niveauParDefaut('fiches_cuisine', 'cuisine')).toBe('modification')
    expect(niveauParDefaut('fiches_cuisine', 'directeur')).toBe('lecture')
    expect(niveauParDefaut('administration', 'directeur')).toBe('aucun')
    expect(niveauParDefaut('import_ventes', 'directeur')).toBe('aucun')
    expect(niveauParDefaut('inconnue', 'admin')).toBe('aucun')
  })
})

describe('niveauEffectif', () => {
  it("une ligne stockée remplace le défaut, pour ce rôle et cette fonctionnalité seulement", () => {
    const lignes = [{ role: 'directeur', fonctionnalite: 'achats', niveau: 'aucun' }]
    expect(niveauEffectif(lignes, 'directeur', 'achats')).toBe('aucun')
    expect(niveauEffectif(lignes, 'cuisine', 'achats')).toBe('lecture')
    expect(niveauEffectif(lignes, 'directeur', 'fournisseurs')).toBe('lecture')
  })
  it('ignore un niveau invalide', () => {
    expect(niveauEffectif([{ role: 'cuisine', fonctionnalite: 'achats', niveau: 'tout' }], 'cuisine', 'achats')).toBe('lecture')
  })
})

describe('atteint', () => {
  it('compare les niveaux', () => {
    expect(atteint('modification', 'lecture')).toBe(true)
    expect(atteint('lecture', 'lecture')).toBe(true)
    expect(atteint('lecture', 'modification')).toBe(false)
    expect(atteint('aucun', 'lecture')).toBe(false)
  })
})

describe('fonctionnalitePourChemin', () => {
  it('prend le préfixe le plus long', () => {
    expect(fonctionnalitePourChemin('/controle-gestion/ventes/budgets')).toBe('budgets')
    expect(fonctionnalitePourChemin('/controle-gestion/ventes/rapport-hebdo')).toBe('rapport_hebdo')
    expect(fonctionnalitePourChemin('/controle-gestion/ventes/saisie')).toBe('ventes')
    expect(fonctionnalitePourChemin('/controle-gestion/achats/123')).toBe('achats')
    expect(fonctionnalitePourChemin('/bar/fiches/nouvelle')).toBe('fiches_bar')
    expect(fonctionnalitePourChemin('/fiches/abc?x=1')).toBe('fiches_cuisine')
    expect(fonctionnalitePourChemin('/inventaire/abc/saisie')).toBe('inventaire')
  })
  it("n'attrape pas un préfixe partiel", () => {
    expect(fonctionnalitePourChemin('/fichesxyz')).toBeNull()
    expect(fonctionnalitePourChemin('/dashboard')).toBeNull()
    expect(fonctionnalitePourChemin('/admin/logs')).toBe('administration')
  })
})

describe('matrice ↔ écarts', () => {
  it("n'enregistre que les cases différentes du défaut", () => {
    const m = matriceComplete([])
    m.directeur.achats = 'aucun'
    m.cuisine.food_cost = 'lecture'
    m.admin.achats = 'modification' // égal au défaut
    expect(ecartsAStocker(m)).toEqual([
      { role: 'directeur', fonctionnalite: 'achats', niveau: 'aucun' },
      { role: 'cuisine', fonctionnalite: 'food_cost', niveau: 'lecture' },
    ])
    expect(matriceComplete(ecartsAStocker(m))).toEqual(m)
  })
})
