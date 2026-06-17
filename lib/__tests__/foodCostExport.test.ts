import { describe, it, expect } from 'vitest'
import { buildFoodCostWorkbook } from '../foodCostExport'

describe('buildFoodCostWorkbook — dates', () => {
  // Régression : le workbook est généré côté navigateur. Avec un minuit local,
  // exceljs (qui sérialise via la valeur UTC) décalait les dates d'un jour
  // selon le fuseau (facture du 16 affichée le 15). On vérifie que la date
  // écrite correspond au bon jour calendaire en UTC, indépendamment du fuseau.
  it('écrit la date de facture sur le bon jour (pas de décalage de fuseau)', async () => {
    const wb = await buildFoodCostWorkbook({
      periodeDebut: '2026-06-01',
      periodeFin: '2026-06-16',
      caFoodHt: 1000,
      achatsHt: 300,
      inventaireDebut: '',
      inventaireFin: '',
      notes: '',
      factures: [
        { date_facture: '2026-06-16', fournisseur: 'METRO', numero_facture: 'F1', total_ht: 300 },
      ],
      ajustements: [],
    })

    const wsFact = wb.getWorksheet('Factures')
    // Ligne 1 = en-têtes, ligne 2 = première facture.
    const cell = wsFact.getRow(2).getCell('date')
    const d = cell.value as Date
    expect(d).toBeInstanceOf(Date)
    expect(d.getUTCFullYear()).toBe(2026)
    expect(d.getUTCMonth()).toBe(5) // juin (0-indexé)
    expect(d.getUTCDate()).toBe(16)
  })
})
