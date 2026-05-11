import { describe, it, expect } from 'vitest'
import {
  buildBudgetsEquipesWorkbook,
  buildEquipesFilename,
  isDayOpen,
  cellBudgetTotal,
  joursDansMois,
  jsWeekdayToIso,
  MOIS_LABEL,
} from '../budgetsExcelTemplate'

describe('jsWeekdayToIso', () => {
  it('convertit dimanche=0 en ISO 7', () => {
    expect(jsWeekdayToIso(0)).toBe(7)
    expect(jsWeekdayToIso(1)).toBe(1)
    expect(jsWeekdayToIso(6)).toBe(6)
  })
})

describe('joursDansMois', () => {
  it('compte les jeudis de Mai 2026', () => {
    // Jeudis de mai 2026 : 7, 14, 21, 28 → 4 jeudis
    expect(joursDansMois(2026, 5, 4)).toBe(4)
  })
  it('compte les vendredis de Mai 2026', () => {
    // Vendredis de mai 2026 : 1, 8, 15, 22, 29 → 5 vendredis
    expect(joursDansMois(2026, 5, 5)).toBe(5)
  })
})

describe('cellBudgetTotal', () => {
  it('somme les 4 ca_*_cible', () => {
    expect(cellBudgetTotal({
      ca_food_cible: 100, ca_bev_20_cible: 50, ca_bev_10_cible: 25, ca_autre_cible: 5,
    })).toBe(180)
  })
  it('retourne 0 pour une cellule absente', () => {
    expect(cellBudgetTotal(null)).toBe(0)
    expect(cellBudgetTotal(undefined)).toBe(0)
  })
})

describe('isDayOpen', () => {
  const lieux = [{ id: 'L1', nom: 'Salle', label: 'SALLE' }]
  const services = [{ code: 'lunch' }, { code: 'dinner' }]

  it('renvoie true si au moins une cellule a un budget ou des couverts', () => {
    const moisBudgets = {
      '1_L1_lunch': { couverts_cible: 20, ca_food_cible: 0, ca_bev_20_cible: 0, ca_bev_10_cible: 0, ca_autre_cible: 0 },
    }
    expect(isDayOpen(1, lieux, services, moisBudgets)).toBe(true)
  })

  it('renvoie false si toutes les cellules sont à 0', () => {
    const moisBudgets = {
      '1_L1_lunch':  { couverts_cible: 0, ca_food_cible: 0, ca_bev_20_cible: 0, ca_bev_10_cible: 0, ca_autre_cible: 0 },
      '1_L1_dinner': { couverts_cible: 0, ca_food_cible: 0, ca_bev_20_cible: 0, ca_bev_10_cible: 0, ca_autre_cible: 0 },
    }
    expect(isDayOpen(1, lieux, services, moisBudgets)).toBe(false)
  })

  it('renvoie false si aucune cellule pour ce jour-de-semaine', () => {
    expect(isDayOpen(1, lieux, services, {})).toBe(false)
  })
})

describe('buildEquipesFilename', () => {
  it('format ISO : suivi-ca_YYYY-MM.xlsx', () => {
    expect(buildEquipesFilename(2026, 5)).toBe('suivi-ca_2026-05.xlsx')
    expect(buildEquipesFilename(2026, 12)).toBe('suivi-ca_2026-12.xlsx')
  })
})

describe('MOIS_LABEL', () => {
  it('labels FR commencent à index 1', () => {
    expect(MOIS_LABEL[1]).toBe('Janvier')
    expect(MOIS_LABEL[12]).toBe('Décembre')
  })
})

describe('buildBudgetsEquipesWorkbook', () => {
  const lieux = [
    { id: 'L1', nom: 'Salle à manger', actif: true, ordre: 1 },
  ]
  // Budgets : ouvert le mardi (jds=2) et vendredi (jds=5)
  const moisBudgets = {
    '2_L1_lunch':  { couverts_cible: 25, ca_food_cible: 4000, ca_bev_20_cible: 1500, ca_bev_10_cible: 500, ca_autre_cible: 0 },
    '2_L1_dinner': { couverts_cible: 40, ca_food_cible: 8000, ca_bev_20_cible: 3500, ca_bev_10_cible: 500, ca_autre_cible: 0 },
    '5_L1_lunch':  { couverts_cible: 30, ca_food_cible: 5000, ca_bev_20_cible: 2000, ca_bev_10_cible: 500, ca_autre_cible: 0 },
    '5_L1_dinner': { couverts_cible: 45, ca_food_cible: 9000, ca_bev_20_cible: 3500, ca_bev_10_cible: 500, ca_autre_cible: 0 },
  }

  it('crée un onglet par jour du mois + un onglet Synthèse', async () => {
    const wb = await buildBudgetsEquipesWorkbook({
      annee: 2026, mois: 5, lieux, moisBudgets,
    })
    // Mai 2026 = 31 jours + 1 onglet Synthèse
    expect(wb.worksheets).toHaveLength(32)
    expect(wb.worksheets[0].name).toBe('Synthèse')
    expect(wb.worksheets[1].name).toBe('01-05')
    expect(wb.worksheets[31].name).toBe('31-05')
  })

  it('marque correctement les jours fermés (lundi, mercredi, jeudi en mai)', async () => {
    const wb = await buildBudgetsEquipesWorkbook({
      annee: 2026, mois: 5, lieux, moisBudgets,
    })
    // 04-05 = lundi → fermé (pas de budget jds=1)
    const lundiSheet = wb.getWorksheet('04-05')
    // Le bandeau "JOUR FERMÉ" est sur la ligne 9
    expect(lundiSheet.getCell(9, 1).value).toContain('FERMÉ')
    // 05-05 = mardi → ouvert
    const mardiSheet = wb.getWorksheet('05-05')
    expect(mardiSheet.getCell(9, 1).value).toBeFalsy()
  })

  it('le Synthèse contient une ligne par jour avec Ouvert/Fermé', async () => {
    const wb = await buildBudgetsEquipesWorkbook({
      annee: 2026, mois: 5, lieux, moisBudgets,
    })
    const synth = wb.getWorksheet('Synthèse')
    // Ligne 2 = 01-05 (vendredi 1er mai = ouvert)
    expect(synth.getCell(2, 3).value).toBe('Ouvert')
    // Ligne 5 = 04-05 (lundi = fermé)
    expect(synth.getCell(5, 3).value).toBe('Fermé')
  })

  it('le Synthèse a une colonne Exception (D) avec formule Cumul utilisant SUMIF', async () => {
    const wb = await buildBudgetsEquipesWorkbook({
      annee: 2026, mois: 5, lieux, moisBudgets,
    })
    const synth = wb.getWorksheet('Synthèse')
    // Header colonne 4 = Exception
    expect(synth.getCell(1, 4).value).toBe('Exception')
    // Ligne 2 (1er mai, ouvert) : K2 doit être une formule SUMIF
    const cumulBudget = synth.getCell(2, 11).value
    expect(cumulBudget).toHaveProperty('formula')
    expect(cumulBudget.formula).toContain('SUMIF')
    expect(cumulBudget.formula).toContain('D$2:D2')
    expect(cumulBudget.formula).toContain('H$2:H2')
  })

  it('pré-remplit le ticket budget sur les jours ouverts', async () => {
    const wb = await buildBudgetsEquipesWorkbook({
      annee: 2026, mois: 5, lieux, moisBudgets,
    })
    const mardiSheet = wb.getWorksheet('05-05') // Mardi
    // Row 7 = Ticket Budget, col 2 = Salle / Déjeuner
    // Ticket = (4000 + 1500 + 500) / 25 = 6000 / 25 = 240
    expect(mardiSheet.getCell(7, 2).value).toBe(240)
  })

  it('pré-remplit la colonne Exception depuis joursFermes', async () => {
    const wb = await buildBudgetsEquipesWorkbook({
      annee: 2026, mois: 5, lieux, moisBudgets,
      joursFermes: { '2026-05-01': '1er mai', '2026-05-08': 'Victoire 1945' },
    })
    const synth = wb.getWorksheet('Synthèse')
    // Ligne 2 = 01-05 → motif "1er mai" en col D
    expect(synth.getCell(2, 4).value).toBe('1er mai')
    // Ligne 9 = 08-05 → motif "Victoire 1945"
    expect(synth.getCell(9, 4).value).toBe('Victoire 1945')
    // Ligne 3 = 02-05 → pas de motif (vide)
    expect(synth.getCell(3, 4).value).toBeFalsy()
  })
})
