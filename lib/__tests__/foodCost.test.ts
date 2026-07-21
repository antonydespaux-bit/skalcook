import { describe, it, expect } from 'vitest'
import { calculerFoodCost, foodCostColor, getSeuilsFromParams } from '../foodCost'

describe('calculerFoodCost', () => {
  it('calculates food cost correctly with default TVA (10%)', () => {
    // cost = 3€, price TTC = 15€ → HT = 15/1.10 = 13.636...
    // FC = 3 / 13.636 * 100 ≈ 22%
    const fc = calculerFoodCost(3, 15)
    expect(fc).toBeCloseTo(22, 0)
  })

  it('calculates food cost with custom TVA', () => {
    // cost = 5€, price TTC = 20€, TVA = 20% → HT = 20/1.20 = 16.667
    // FC = 5 / 16.667 * 100 = 30%
    const fc = calculerFoodCost(5, 20, 20)
    expect(fc).toBeCloseTo(30, 0)
  })

  it('returns null for zero cost', () => {
    expect(calculerFoodCost(0, 15)).toBeNull()
  })

  it('returns null for zero price', () => {
    expect(calculerFoodCost(3, 0)).toBeNull()
  })

  it('returns null for null inputs', () => {
    expect(calculerFoodCost(null, 15)).toBeNull()
    expect(calculerFoodCost(3, null)).toBeNull()
  })
})

describe('foodCostColor', () => {
  it('returns green for low food cost', () => {
    const result = foodCostColor(20, 28, 35)
    expect(result.color).toBe('#3B6D11')
  })

  it('returns orange for medium food cost', () => {
    const result = foodCostColor(30, 28, 35)
    expect(result.color).toBe('#854F0B')
  })

  it('returns red for high food cost', () => {
    const result = foodCostColor(40, 28, 35)
    expect(result.color).toBe('#A32D2D')
  })

  it('returns green at exactly 0', () => {
    const result = foodCostColor(0, 28, 35)
    expect(result.color).toBe('#3B6D11')
  })

  it('returns orange at exactly seuilVert', () => {
    const result = foodCostColor(28, 28, 35)
    expect(result.color).toBe('#854F0B')
  })

  it('returns red at exactly seuilOrange', () => {
    const result = foodCostColor(35, 28, 35)
    expect(result.color).toBe('#A32D2D')
  })
})

describe('getSeuilsFromParams', () => {
  it('returns params values when provided', () => {
    const params = {
      seuil_vert_cuisine: '25',
      seuil_orange_cuisine: '32',
      tva_restauration: '10',
    }
    const result = getSeuilsFromParams(params, 'cuisine')
    expect(result.seuilVert).toBe(25)
    expect(result.seuilOrange).toBe(32)
    expect(result.tva).toBe(10)
  })

  it('returns defaults for bar section', () => {
    const params = {}
    const result = getSeuilsFromParams(params, 'bar')
    expect(result.seuilVert).toBe(22)
    expect(result.seuilOrange).toBe(28)
  })

  // Régression : les colonnes bar sont `seuil_*_boissons`, pas `seuil_*_bar`.
  // Interpoler la section faisait retomber sur les défauts en ignorant la
  // configuration de l'établissement (JOIA : 25/28 lu comme 22/28).
  it('reads bar thresholds from the seuil_*_boissons columns', () => {
    const params = {
      seuil_vert_boissons: '25',
      seuil_orange_boissons: '30',
      seuil_vert_cuisine: '28',
      seuil_orange_cuisine: '35',
    }
    const result = getSeuilsFromParams(params, 'bar')
    expect(result.seuilVert).toBe(25)
    expect(result.seuilOrange).toBe(30)
  })

  it('defaults to cuisine when section unknown', () => {
    const params = {}
    const result = getSeuilsFromParams(params)
    expect(result.seuilVert).toBe(28)
    expect(result.seuilOrange).toBe(35)
  })
})
