import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { buildGroupeWorkbook, buildSyntheseRows, buildPrixRows, buildFournisseursRows, nomFichierGroupe } from '../groupeExport'

const etab = (nom: string, over: Record<string, unknown> = {}) => ({
  clientId: nom, nom, caHt: 12100.456, caFoodHt: 10000, caBoissonsHt: 2000, couverts: 100, ticketMoyenTtc: 134.1,
  achatsCuisineHt: 3000, ratioCuisine: 30.04, statutCuisine: 'orange', achatsBarHt: 0, ratioBoissons: null,
  statutBoissons: null, stockCuisineHt: 5000, stockCuisineDate: '2026-09-30', nbFactures: 12, ...over,
})

const synthese = {
  groupe: { id: 'g', nom: 'Hélène Darroze' },
  periode: { debut: '2026-09-01', fin: '2026-09-30' },
  etablissements: [etab('JOIA'), etab('MARSAN', { statutCuisine: 'rouge' })],
  totaux: { caHt: 24200.91, caFoodHt: 20000, caBoissonsHt: 4000, couverts: 200, ticketMoyenTtc: 134.1, achatsCuisineHt: 6000, ratioCuisine: 30, achatsBarHt: 0, ratioBoissons: null, nbFactures: 24 },
}

const prix = {
  produits: [{
    cle: 'beurre|kg', nom: 'Beurre', unite: 'kg', prixMin: 9, prixMax: 12, ecartPct: 33.333, economiePotentielle: 30, aVerifier: false,
    meilleurFournisseur: { clientId: 'JOIA', etablissement: 'JOIA', fournisseur: 'Metro', prix: 8.5 },
    etablissements: [
      { clientId: 'JOIA', nom: 'JOIA', prixMoyen: 9, fournisseurPrincipal: 'Metro' },
      { clientId: 'MARSAN', nom: 'MARSAN', prixMoyen: 12, fournisseurPrincipal: 'Kore' },
    ],
  }],
  fournisseurs: [{
    cle: 'metro', nom: 'Metro', montantTotal: 1500, nbEtablissements: 2,
    etablissements: [{ clientId: 'JOIA', nom: 'JOIA', montant: 1000, nbFactures: 3 }, { clientId: 'MARSAN', nom: 'MARSAN', montant: 500, nbFactures: 2 }],
  }],
}

describe('groupeExport', () => {
  it('synthèse : une ligne par établissement + total, chiffres arrondis', () => {
    const rows = buildSyntheseRows(synthese)
    expect(rows).toHaveLength(3)
    expect(rows[0]).toMatchObject({ 'Établissement': 'JOIA', 'CA HT (€)': 12100.46, 'Ratio cuisine (%)': 30, 'Statut cuisine': 'Orange', 'Ratio boissons (%)': null })
    expect(rows[2]['Établissement']).toBe('Total groupe')
  })

  it('prix : meilleur prix, fournisseurs et une colonne par établissement', () => {
    const [row] = buildPrixRows({ produits: prix.produits, nomsEtablissements: ['JOIA', 'MARSAN'] })
    expect(row).toMatchObject({
      'Produit': 'Beurre', 'Meilleur prix (€)': 9, 'Fournisseur le moins cher': 'Metro', 'Écart (%)': 33.3,
      'Chez': 'Metro (JOIA)', 'JOIA — prix (€)': 9, 'MARSAN — prix (€)': 12, 'MARSAN — fournisseur': 'Kore',
    })
  })

  it('fournisseurs : montant par établissement et total des factures', () => {
    const [row] = buildFournisseursRows({ fournisseurs: prix.fournisseurs, nomsEtablissements: ['JOIA', 'MARSAN'] })
    expect(row).toMatchObject({ 'Fournisseur': 'Metro', 'Commun à plusieurs établissements': 'Oui', 'JOIA (€)': 1000, 'MARSAN (€)': 500, 'Factures': 5 })
  })

  it('classeur : 4 onglets, ou 2 sans les prix', () => {
    expect(buildGroupeWorkbook({ synthese, prix }).SheetNames).toEqual(['Période', 'Synthèse', 'Prix comparés', 'Fournisseurs'])
    const wb = buildGroupeWorkbook({ synthese, prix: null })
    expect(wb.SheetNames).toEqual(['Période', 'Synthèse'])
    const periode = XLSX.utils.sheet_to_json(wb.Sheets['Période']) as { Champ: string; Valeur: unknown }[]
    expect(periode.find((r) => r.Champ === 'Groupe')?.Valeur).toBe('Hélène Darroze')
  })

  it('nom de fichier sans accents ni espaces', () => {
    expect(nomFichierGroupe('Hélène Darroze', '2026-09-01', '2026-09-30')).toBe('vue-groupe-helene-darroze-2026-09-01_2026-09-30.xlsx')
  })
})

describe('blocs choisis', () => {
  it("le classeur ne contient que les onglets des blocs cochés (Période toujours)", () => {
    const seulementPrix = buildGroupeWorkbook({ synthese, prix, blocs: { indicateurs: false, synthese: false, prix: true, fournisseurs: false } })
    expect(seulementPrix.SheetNames).toEqual(['Période', 'Prix comparés'])
    const indicateursSeuls = buildGroupeWorkbook({ synthese, prix, blocs: { indicateurs: true, synthese: false, prix: false, fournisseurs: false } })
    expect(indicateursSeuls.SheetNames).toEqual(['Période', 'Synthèse'])
  })
})
