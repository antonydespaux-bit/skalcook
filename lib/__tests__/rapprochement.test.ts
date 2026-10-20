import { describe, it, expect } from 'vitest'
import { motsSignificatifs, suggererIngredients, cleFournisseurSouple, rapprocherFournisseur } from '../rapprochement.js'

// Désignations réelles (Vergers Saint-Eustache, 2026-10-20).
const ING = [
  { id: 'cib', nom: 'Ciboulette' },
  { id: 'car', nom: 'Carotte' },
  { id: 'carv', nom: 'Carotte violette' },
  { id: 'cor', nom: 'Coriandre' },
  { id: 'oig', nom: 'Oignon blanc' },
  { id: 'oigr', nom: 'Oignon rouge' },
  { id: 'cham', nom: 'Champignons de Paris' },
  { id: 'yuzu', nom: 'Citron yuzu' },
  { id: 'cit', nom: 'Citron' },
  { id: 'jam', nom: 'JAMBON 50% IBERIQUE' },
]
const ids = (designation: string) => suggererIngredients(designation, ING).map((i) => i.id)

describe('suggererIngredients', () => {
  it('retire origine, conditionnement, unités et nombres', () => {
    expect(motsSignificatifs('CIVETTE / CIBOULETTE FRANCAISE EN BOTTE (FRANCE)')).toEqual(['civette', 'ciboulette'])
    expect(motsSignificatifs('PDT FRITE 6/6 2.5KG *MC CAIN*')).toEqual(['pdt', 'frite', 'mc', 'cain'])
  })

  it('suggère l’ingrédient dont tous les mots figurent dans la désignation', () => {
    expect(ids('CIVETTE / CIBOULETTE FRANCAISE EN BOTTE (FRANCE)')).toEqual(['cib'])
    expect(ids('CORIANDRE EN BOTTE (ESPAGNE)')).toEqual(['cor'])
    expect(ids('OIGNON BLANC GROS / KG (ESPAGNE)')).toEqual(['oig'])
    expect(ids('CHAMPIGNON DE PARIS **DECLASSE** / KG BLANC OU CREME (FRANCE)')).toEqual(['cham'])
  })

  it('le plus précis d’abord', () => {
    expect(ids('CAROTTE VIOLETTE / KG (FRANCE)')).toEqual(['carv', 'car'])
    expect(ids('CITRON YUZU VERT SCHALLER / KG (FRANCE)')).toEqual(['yuzu', 'cit'])
    expect(ids('CAROTTE PLATEAUX 12 / KG (FRANCE)')).toEqual(['car'])
  })

  it("rien si un mot de l'ingrédient manque", () => {
    expect(ids('OIGNON JAUNE / KG')).toEqual([])
    expect(ids('ROMARIN EN BOTTE (FRANCE)')).toEqual([])
    expect(ids('(FRANCE) / KG')).toEqual([])
  })

  it("propose sans lier : une désignation plus longue reste une suggestion", () => {
    expect(ids('JAMBON 50% IBERIQUE AVEC OS')).toEqual(['jam'])
  })
})

describe('fournisseurs', () => {
  const connus = ['Vergers St Eustache', 'METRO', 'Ferme d’Alexandre', 'Transgourmet Île-de-France']

  it('même clé malgré articles, « saint », forme juridique, casse et accents', () => {
    expect(cleFournisseurSouple('LES VERGERS SAINT EUSTACHE')).toBe(cleFournisseurSouple('Vergers St Eustache'))
    expect(cleFournisseurSouple('METRO SAS')).toBe(cleFournisseurSouple('Metro'))
    expect(cleFournisseurSouple("LA FERME D'ALEXANDRE")).toBe(cleFournisseurSouple('Ferme d’Alexandre'))
  })

  it('rapprocherFournisseur', () => {
    expect(rapprocherFournisseur('LES VERGERS SAINT EUSTACHE', connus)).toEqual({ nom: 'Vergers St Eustache', exact: true })
    expect(rapprocherFournisseur("LA FERME D'ALEXANDRE", connus)).toEqual({ nom: 'Ferme d’Alexandre', exact: true })
    expect(rapprocherFournisseur('TRANSGOURMET ILE DE FRANCE RUNGIS', connus)).toEqual({ nom: 'Transgourmet Île-de-France', exact: false })
    expect(rapprocherFournisseur('metro', connus)).toBeNull()          // déjà écrit pareil
    expect(rapprocherFournisseur('POMONA', connus)).toBeNull()
    expect(rapprocherFournisseur('', connus)).toBeNull()
  })
})
