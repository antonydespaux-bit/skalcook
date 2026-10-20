import { describe, it, expect } from 'vitest'
import { normaliserFactures } from '../services/parseFacture'

// Réponses de l'IA sur deux vraies factures (2026-10-20) : Vergers
// Saint-Eustache (format compact demandé) et La Ferme d'Alexandre (ancien
// format objet, encore accepté).

describe('normaliserFactures', () => {
  it('lit les lignes compactes [designation, quantite, unite, PU, montant, TVA]', () => {
    const [f] = normaliserFactures({
      factures: [{
        fournisseur: 'LES VERGERS SAINT EUSTACHE', date_facture: '2026-10-20', numero_facture: 'V26124064', type: 'facture',
        total_ht_facture: 541.35, total_ttc_facture: 571.12, montant_tva_total: 29.77, montant_taxes_hors_tva: null,
        lignes: [
          ['CIVETTE / CIBOULETTE FRANCAISE EN BOTTE (FRANCE)', 3, 'pièce', 0.99, 2.97, 5.5],
          ['CITRON CAVIAR ROSE IMPORT / KG (GUATEMALA)', 0.08, 'kg', 140.4, 11.23, 5.5],
        ],
      }],
    })
    expect(f).toMatchObject({ fournisseur: 'LES VERGERS SAINT EUSTACHE', numero_facture: 'V26124064', statut: 'facture', total_ht_facture: 541.35 })
    expect(f.lignes).toEqual([
      { designation: 'CIVETTE / CIBOULETTE FRANCAISE EN BOTTE (FRANCE)', quantite: 3, unite: 'pièce', prix_unitaire_ht: 0.99, taux_tva: 5.5 },
      { designation: 'CITRON CAVIAR ROSE IMPORT / KG (GUATEMALA)', quantite: 0.08, unite: 'kg', prix_unitaire_ht: 140.4, taux_tva: 5.5 },
    ])
  })

  it("accepte encore les lignes en objets", () => {
    const [f] = normaliserFactures({
      factures: [{
        fournisseur: "LA FERME D'ALEXANDRE", date_facture: '2026-10-20', numero_facture: '550985', type: 'facture', total_ht_facture: 40.9,
        lignes: [{ designation: 'CREME FLEURETTE 5L PAMPLIE', quantite: 5, unite: 'Litres', prix_unitaire_ht: 5.978, montant_ht: 29.89, taux_tva: 5.5 }],
      }],
    })
    expect(f.lignes[0]).toMatchObject({ designation: 'CREME FLEURETTE 5L PAMPLIE', quantite: 5, prix_unitaire_ht: 5.978 })
  })

  it('déduit le PU du montant ligne quand il manque ou est aberrant', () => {
    const [f] = normaliserFactures({
      factures: [{ lignes: [
        ['SANS PU', 4, 'kg', null, 10, 5.5],
        ['PU MAL LU', 2, 'kg', 1610, 3.22, 5.5],  // « 1,610 » lu 1610 : le montant tranche
        ['RIEN', 1, 'u', null, null, null],
      ] }],
    })
    expect(f.lignes.map((l) => l.prix_unitaire_ht)).toEqual([2.5, 1.61, 0])
  })

  it('ignore les lignes sans désignation et les valeurs hors format', () => {
    const [f] = normaliserFactures({ factures: [{ date_facture: '20/10/2026', lignes: [['', 1, 'u', 1, 1, 20], null, ['OK', 1, 'u', 1, 1, 250]] }] })
    expect(f.date_facture).toBeNull()
    expect(f.lignes).toHaveLength(1)
    expect(f.lignes[0].taux_tva).toBeNull()
  })

  it('avoir : montants en valeur absolue, statut avoir', () => {
    const [f] = normaliserFactures({ factures: [{ type: 'avoir', total_ht_facture: -12, total_ttc_facture: -12.66, lignes: [['RETOUR', -2, 'kg', 6, -12, 5.5]] }] })
    expect(f).toMatchObject({ statut: 'avoir', total_ht_facture: 12, total_ttc_facture: 12.66 })
    expect(f.lignes[0]).toMatchObject({ quantite: 2, prix_unitaire_ht: 6 })
  })

  it("ancien format à plat (sans tableau factures)", () => {
    expect(normaliserFactures({ fournisseur: 'X', lignes: [['A', 1, 'u', 2, 2, 20]] })).toHaveLength(1)
  })
})
