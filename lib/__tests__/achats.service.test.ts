import { describe, it, expect } from 'vitest'
import { normDesignation, computeLigneEffective } from '../services/achats.service'

describe('normDesignation', () => {
  it('normalizes accented characters', () => {
    expect(normDesignation('Crème fraîche')).toBe('creme fraiche')
  })

  it('lowercases and trims', () => {
    expect(normDesignation('  TOMATES CERISES  ')).toBe('tomates cerises')
  })

  it('removes special characters', () => {
    expect(normDesignation("Bœuf (1kg) - premium")).toBe('b uf 1kg premium')
  })

  it('handles null/undefined', () => {
    expect(normDesignation(null)).toBe('')
    expect(normDesignation(undefined)).toBe('')
    expect(normDesignation('')).toBe('')
  })

  it('normalizes multiple spaces', () => {
    expect(normDesignation('tomates   cerises   bio')).toBe('tomates cerises bio')
  })
})

describe('computeLigneEffective', () => {
  it('calcule le montant standard sans remise (signe positif)', () => {
    const r = computeLigneEffective({ quantite: 5, prix_unitaire_ht: 2 })
    expect(r.prixEffectif).toBe(2)
    expect(r.montantHt).toBe(10)
    expect(r.remise).toBe(0)
  })

  it('applique la remise sur le prix unitaire', () => {
    const r = computeLigneEffective({ quantite: 10, prix_unitaire_ht: 10, remise: 20 })
    expect(r.prixEffectif).toBe(8)
    expect(r.montantHt).toBe(80)
    expect(r.remise).toBe(20)
  })

  it('avoir : montant négatif mais prix unitaire reste positif', () => {
    const r = computeLigneEffective({ quantite: 3, prix_unitaire_ht: 4 }, -1)
    // prix unitaire reste positif (sert de référence pour la mercuriale)
    expect(r.prixEffectif).toBe(4)
    // montant porte le signe → négatif pour un avoir
    expect(r.montantHt).toBe(-12)
  })

  it('avoir avec remise : remise gardée, montant négatif', () => {
    const r = computeLigneEffective({ quantite: 2, prix_unitaire_ht: 10, remise: 50 }, -1)
    expect(r.prixEffectif).toBe(5)
    expect(r.montantHt).toBe(-10)
    expect(r.remise).toBe(50)
  })

  it('quantité ou prix à 0 donne un montant à 0', () => {
    expect(computeLigneEffective({ quantite: 0, prix_unitaire_ht: 5 }).montantHt).toBe(0)
    expect(computeLigneEffective({ quantite: 5, prix_unitaire_ht: 0 }).montantHt).toBe(0)
  })
})
