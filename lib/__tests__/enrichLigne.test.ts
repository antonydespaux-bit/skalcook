import { describe, it, expect } from 'vitest'
import { enrichLigne, normDesig } from '../achatsHelpers.js'

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
