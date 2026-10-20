import { describe, it, expect } from 'vitest'
import { enrichLigne, normDesig, ligneDepuisFacture } from '../achatsHelpers.js'

const jambonCourt = { id: 'ing-court', nom: 'JAMBON 50% IBERIQUE', prix_kg: 30 }
const jambonOs = { id: 'ing-os', nom: 'JAMBON 50% IBERIQUE AVEC OS', prix_kg: 25 }

function byNorm(ings: Array<{ id: string; nom: string; prix_kg: number }>) {
  const m: Record<string, unknown> = {}
  for (const i of ings) m[normDesig(i.nom)] = i
  return m
}
function byId(ings: Array<{ id: string; nom: string; prix_kg: number }>) {
  const m: Record<string, unknown> = {}
  for (const i of ings) m[i.id] = i
  return m
}

describe('enrichLigne — réconciliation ingrédient', () => {
  it('ne fusionne pas une désignation plus longue avec un ingrédient au nom plus court', () => {
    const ings = [jambonCourt]
    const res = enrichLigne(
      { designation: 'JAMBON 50% IBERIQUE AVEC OS', prix_unitaire_ht: '' },
      {},
      byId(ings),
      byNorm(ings),
    )
    expect(res.reconnu).toBe(false)
    expect(res.ingredient_id).toBeNull()
  })

  it('reconnaît un nom exact normalisé (accents/casse/espaces ignorés)', () => {
    const ings = [jambonCourt, jambonOs]
    const res = enrichLigne(
      { designation: 'jambon 50% ibérique avec os', prix_unitaire_ht: '' },
      {},
      byId(ings),
      byNorm(ings),
    )
    expect(res.reconnu).toBe(true)
    expect(res.ingredient_id).toBe('ing-os')
  })

  it('utilise le mapping appris en priorité', () => {
    const ings = [jambonCourt]
    const norm = normDesig('JBN IBE OS')
    const res = enrichLigne(
      { designation: 'JBN IBE OS', prix_unitaire_ht: '' },
      { [norm]: { ingredient_id: 'ing-court' } },
      byId(ings),
      byNorm(ings),
    )
    expect(res.reconnu).toBe(true)
    expect(res.ingredient_id).toBe('ing-court')
  })
})

describe('ligneDepuisFacture — prix lus sur la facture', () => {
  const ocr = { designation: 'CREME FLEURETTE 5L PAMPLIE', quantite: 5, unite: 'L', prix_unitaire_ht: 5.978, taux_tva: 5.5 }

  it("garde le prix de la facture pour un produit non reconnu (régression : il tombait à 0)", () => {
    const res = enrichLigne(ligneDepuisFacture(ocr), {}, {}, {})
    expect(res.reconnu).toBe(false)
    expect(res.prix_unitaire_ht).toBe(5.978)
    expect(res.taux_tva).toBe(5.5)
  })

  it("garde le prix de la facture pour un produit reconnu, avec l'écart et la mise à jour du prix", () => {
    const creme = { id: 'ing-creme', nom: 'CREME FLEURETTE 5L PAMPLIE', prix_kg: 5.5 }
    const res = enrichLigne(ligneDepuisFacture(ocr), {}, byId([creme]), byNorm([creme]))
    expect(res.reconnu).toBe(true)
    expect(res.prix_unitaire_ht).toBe(5.978)
    expect(res.deltaPrix).toBeCloseTo(8.69, 1)
    expect(res.updatePrice).toBe(true)
  })

  it('sans prix lu, le prix de la mercuriale reste proposé', () => {
    const creme = { id: 'ing-creme', nom: 'CREME FLEURETTE 5L PAMPLIE', prix_kg: 5.5 }
    const res = enrichLigne(ligneDepuisFacture({ ...ocr, prix_unitaire_ht: null }), {}, byId([creme]), byNorm([creme]))
    expect(res.prix_unitaire_ht).toBe(5.5)
    expect(res.prix_auto).toBe(true)
  })

  it("un instantané garde ses drapeaux (navigation entre factures d'un même PDF)", () => {
    const l = ligneDepuisFacture({ ...ocr, prix_unitaire_ht: 5.5, prix_auto: true })
    expect(l.prix_auto).toBe(true)
  })
})
