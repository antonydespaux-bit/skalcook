import { describe, it, expect } from 'vitest'
import {
  getPeriodDates,
  shiftPeriodByYears,
  aggregateTotals,
  aggregateByDay,
  budgetByIsoJdsForMonth,
  periodBudgetTotal,
  TVA_FOOD,
  TVA_BEV_20,
} from '../caAnalyses'

const TODAY = new Date(2026, 4, 9) // 2026-05-09 (jeudi)

describe('getPeriodDates', () => {
  it('aujourdhui = today → today', () => {
    expect(getPeriodDates('aujourdhui', TODAY)).toEqual({ debut: '2026-05-09', fin: '2026-05-09' })
  })

  it('7j = today-6 → today (incluant aujourdhui)', () => {
    expect(getPeriodDates('7j', TODAY)).toEqual({ debut: '2026-05-03', fin: '2026-05-09' })
  })

  it('30j = today-29 → today', () => {
    expect(getPeriodDates('30j', TODAY)).toEqual({ debut: '2026-04-10', fin: '2026-05-09' })
  })

  it('mois-en-cours = 1er du mois → today (période ouverte)', () => {
    expect(getPeriodDates('mois-en-cours', TODAY)).toEqual({ debut: '2026-05-01', fin: '2026-05-09' })
  })

  it('mois-precedent = mois entier précédent', () => {
    expect(getPeriodDates('mois-precedent', TODAY)).toEqual({ debut: '2026-04-01', fin: '2026-04-30' })
  })

  it('trimestre = 1er du trimestre → today (mai → Q2)', () => {
    expect(getPeriodDates('trimestre', TODAY)).toEqual({ debut: '2026-04-01', fin: '2026-05-09' })
  })

  it('annee = 1er janvier → today', () => {
    expect(getPeriodDates('annee', TODAY)).toEqual({ debut: '2026-01-01', fin: '2026-05-09' })
  })

  it('mois-precedent en début d\'année passe à décembre N-1', () => {
    const jan15 = new Date(2026, 0, 15)
    expect(getPeriodDates('mois-precedent', jan15)).toEqual({ debut: '2025-12-01', fin: '2025-12-31' })
  })
})

describe('shiftPeriodByYears', () => {
  it('décale d\'un an dans le passé', () => {
    expect(shiftPeriodByYears({ debut: '2026-05-01', fin: '2026-05-09' }, -1))
      .toEqual({ debut: '2025-05-01', fin: '2025-05-09' })
  })
})

describe('aggregateTotals', () => {
  it('somme couverts et CA, calcule TM et HT par catégorie', () => {
    const rows = [
      { couverts: 10, ca_food: 110, ca_bev_20: 60, ca_bev_10: 11, ca_autre: 0 },
      { couverts: 5,  ca_food: 0,   ca_bev_20: 0,  ca_bev_10: 0,  ca_autre: 22 },
    ]
    const t = aggregateTotals(rows)
    expect(t.couverts).toBe(15)
    expect(t.food).toBe(110)
    expect(t.bev20).toBe(60)
    expect(t.bev10).toBe(11)
    expect(t.autre).toBe(22)
    expect(t.caTtc).toBe(203)
    // CAHT = 110/1.10 + 60/1.20 + 11/1.10 + 22/1.10 = 100 + 50 + 10 + 20 = 180
    expect(t.caHt).toBeCloseTo(180, 5)
    expect(t.tm).toBeCloseTo(203 / 15, 5)
  })

  it('TM = null si pas de couverts', () => {
    expect(aggregateTotals([]).tm).toBeNull()
  })

  it('utilise les bons taux de TVA', () => {
    const t = aggregateTotals([{ couverts: 1, ca_food: 110, ca_bev_20: 120, ca_bev_10: 0, ca_autre: 0 }])
    expect(t.caHt).toBeCloseTo(110 / TVA_FOOD + 120 / TVA_BEV_20, 5)
  })
})

describe('aggregateByDay', () => {
  it('produit une ligne par jour de la période, même sans data', () => {
    const days = aggregateByDay([], '2026-05-01', '2026-05-03')
    expect(days).toHaveLength(3)
    expect(days[0].iso).toBe('2026-05-01')
    expect(days[2].iso).toBe('2026-05-03')
    expect(days[0].hasData).toBe(false)
  })

  it('regroupe lunch et dinner par jour', () => {
    const rows = [
      { jour: '2026-05-01', service: 'lunch', couverts: 10, ca_food: 100, ca_bev_20: 0, ca_bev_10: 0, ca_autre: 0 },
      { jour: '2026-05-01', service: 'dinner', couverts: 20, ca_food: 200, ca_bev_20: 50, ca_bev_10: 0, ca_autre: 0 },
    ]
    const days = aggregateByDay(rows, '2026-05-01', '2026-05-01')
    expect(days[0].lunchCouverts).toBe(10)
    expect(days[0].dinnerCouverts).toBe(20)
    expect(days[0].couvertsTot).toBe(30)
    expect(days[0].caTot).toBe(350)
    expect(days[0].hasData).toBe(true)
  })
})

describe('budgetByIsoJdsForMonth', () => {
  // jds 4 = jeudi (mai 2026). Trois lieux × 2 services = 6 cellules potentielles.
  it('override mensuel prioritaire sur défaut (mois NULL)', () => {
    const rows = [
      { jour_semaine: 4, lieu_service_id: 'L1', service: 'lunch',  mois: null, ca_food_cible: 100, ca_bev_20_cible: 0, ca_bev_10_cible: 0, ca_autre_cible: 0 },
      { jour_semaine: 4, lieu_service_id: 'L1', service: 'lunch',  mois: 5,    ca_food_cible: 200, ca_bev_20_cible: 0, ca_bev_10_cible: 0, ca_autre_cible: 0 },
      { jour_semaine: 4, lieu_service_id: 'L1', service: 'dinner', mois: null, ca_food_cible: 50,  ca_bev_20_cible: 10, ca_bev_10_cible: 0, ca_autre_cible: 0 },
    ]
    const map = budgetByIsoJdsForMonth(rows, 5)
    // L1 lunch = 200 (override), L1 dinner = 60 (default) → total 260 pour jds 4
    expect(map.get(4)).toBe(260)
  })

  it('rien pour ce jour-de-semaine si pas de budget', () => {
    const map = budgetByIsoJdsForMonth([], 5)
    expect(map.get(1)).toBeUndefined()
  })

  it('agrège par jour-de-semaine indépendamment des cellules', () => {
    const rows = [
      { jour_semaine: 1, lieu_service_id: 'L1', service: 'lunch', mois: null, ca_food_cible: 50, ca_bev_20_cible: 0, ca_bev_10_cible: 0, ca_autre_cible: 0 },
      { jour_semaine: 1, lieu_service_id: 'L2', service: 'lunch', mois: null, ca_food_cible: 80, ca_bev_20_cible: 0, ca_bev_10_cible: 0, ca_autre_cible: 0 },
    ]
    expect(budgetByIsoJdsForMonth(rows, 5).get(1)).toBe(130)
  })
})

describe('periodBudgetTotal', () => {
  it('somme correctement sur une période en agrégeant par jour-de-semaine', () => {
    // Période : 2026-05-04 (lundi) → 2026-05-06 (mercredi) = 3 jours
    // Budget : lundi=100, mardi=200, mercredi=300
    const rows = [
      { jour_semaine: 1, lieu_service_id: 'L1', service: 'lunch', mois: null, ca_food_cible: 100, ca_bev_20_cible: 0, ca_bev_10_cible: 0, ca_autre_cible: 0 },
      { jour_semaine: 2, lieu_service_id: 'L1', service: 'lunch', mois: null, ca_food_cible: 200, ca_bev_20_cible: 0, ca_bev_10_cible: 0, ca_autre_cible: 0 },
      { jour_semaine: 3, lieu_service_id: 'L1', service: 'lunch', mois: null, ca_food_cible: 300, ca_bev_20_cible: 0, ca_bev_10_cible: 0, ca_autre_cible: 0 },
    ]
    const total = periodBudgetTotal({ 2026: rows }, '2026-05-04', '2026-05-06')
    expect(total).toBe(600)
  })

  it('gère les périodes à cheval sur deux années', () => {
    // Période : 2025-12-31 (mercredi) → 2026-01-01 (jeudi)
    const rows2025 = [
      { jour_semaine: 3, lieu_service_id: 'L1', service: 'lunch', mois: null, ca_food_cible: 100, ca_bev_20_cible: 0, ca_bev_10_cible: 0, ca_autre_cible: 0 },
    ]
    const rows2026 = [
      { jour_semaine: 4, lieu_service_id: 'L1', service: 'lunch', mois: null, ca_food_cible: 200, ca_bev_20_cible: 0, ca_bev_10_cible: 0, ca_autre_cible: 0 },
    ]
    const total = periodBudgetTotal({ 2025: rows2025, 2026: rows2026 }, '2025-12-31', '2026-01-01')
    expect(total).toBe(300)
  })
})
