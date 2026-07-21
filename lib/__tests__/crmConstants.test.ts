import { describe, it, expect } from 'vitest'
import { calcLigneTotaux, calcDevisTotaux } from '../crmConstants'

describe('calcLigneTotaux', () => {
  it('calcule HT, TVA et TTC sur un cas simple', () => {
    const t = calcLigneTotaux({ quantite: 2, prix_unitaire_ht: 10, remise_pct: 0, tva_taux: 10 })
    expect(t.total_ht).toBe(20)
    expect(t.total_tva).toBe(2)
    expect(t.total_ttc).toBe(22)
  })

  it('applique la remise sur le HT', () => {
    const t = calcLigneTotaux({ quantite: 1, prix_unitaire_ht: 100, remise_pct: 10, tva_taux: 20 })
    expect(t.total_ht).toBe(90)
    expect(t.total_tva).toBe(18)
    expect(t.total_ttc).toBe(108)
  })

  // Régression : les trois valeurs étaient arrondies indépendamment, et
  // `1.265 * 100` vaut 126.49999999999999 → `Math.round` perdait un centime.
  // Le devis affichait alors HT 1,15 + TVA 0,12 = 1,27 face à un TTC de 1,26.
  it('produit un TTC égal à HT + TVA (cas 1,15 € à 10%)', () => {
    const t = calcLigneTotaux({ quantite: 1, prix_unitaire_ht: 1.15, remise_pct: 0, tva_taux: 10 })
    expect(t.total_ht).toBe(1.15)
    expect(t.total_tva).toBe(0.12)
    expect(t.total_ttc).toBe(1.27)
    expect(t.total_ht + t.total_tva).toBeCloseTo(t.total_ttc, 10)
  })

  it('garde HT + TVA = TTC sur un large balayage de montants', () => {
    const incoherences: string[] = []
    for (let q = 1; q <= 30; q++) {
      for (let cents = 5; cents <= 4000; cents += 5) {
        for (const tva of [5.5, 10, 20]) {
          const t = calcLigneTotaux({
            quantite: q, prix_unitaire_ht: cents / 100, remise_pct: 0, tva_taux: tva,
          })
          if (Math.abs(t.total_ht + t.total_tva - t.total_ttc) > 0.0049) {
            incoherences.push(`q=${q} pu=${cents / 100} tva=${tva}`)
          }
        }
      }
    }
    expect(incoherences).toEqual([])
  })
})

describe('calcDevisTotaux', () => {
  it('agrège les lignes en conservant la cohérence HT + TVA = TTC', () => {
    const lignes = [
      { quantite: 1, prix_unitaire_ht: 1.15, remise_pct: 0, tva_taux: 10 },
      { quantite: 3, prix_unitaire_ht: 7.35, remise_pct: 5, tva_taux: 20 },
      { quantite: 2, prix_unitaire_ht: 0.05, remise_pct: 0, tva_taux: 5.5 },
    ]
    const t = calcDevisTotaux(lignes)
    expect(t.total_ht + t.total_tva).toBeCloseTo(t.total_ttc, 8)
  })
})
