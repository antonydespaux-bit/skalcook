import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import {
  buildPeriodSheetRows,
  buildKpiSheetRows,
  buildEvolutionCaSheetRows,
  buildEvolutionCouvertsSheetRows,
  buildPerfJourSemaineSheetRows,
  buildMixSheetRows,
  buildTopBottomSheetRows,
  buildTableauJourJourSheetRows,
  buildAnalysesWorkbook,
  buildFilename,
} from '../analysesExport'

describe('buildPeriodSheetRows', () => {
  it('produit une ligne par champ traçabilité', () => {
    const rows = buildPeriodSheetRows({
      periode: 'mois-en-cours', dateDebut: '2026-05-01', dateFin: '2026-05-09',
      comparaison: 'n-1', lieuLabel: 'Salle', service: 'lunch', granularity: 'day',
      generatedAt: new Date(2026, 4, 9, 14, 30),
    })
    expect(rows).toHaveLength(8)
    const map = Object.fromEntries(rows.map((r) => [r.Champ, r.Valeur]))
    expect(map['Période']).toBe('Mois en cours')
    expect(map['Date début']).toBe('2026-05-01')
    expect(map['Comparaison']).toBe('vs même période N-1')
    expect(map['Lieu']).toBe('Salle')
    expect(map['Service']).toBe('Déjeuner')
    expect(map['Granularité auto']).toBe('Jour')
  })
})

describe('buildKpiSheetRows', () => {
  it('inclut les 5 KPIs avec comparaison N-1 si dispo', () => {
    const rows = buildKpiSheetRows({
      totals: { couverts: 100, caTtc: 5000, caHt: 4500, tm: 50 },
      comparisonTotals: { couverts: 80, caTtc: 4000, caHt: 3600, tm: 50 },
      comparisonLabel: 'vs N-1',
      periodBudget: 4500,
    })
    expect(rows).toHaveLength(5)
    const couverts = rows[0]
    expect(couverts.KPI).toBe('Couverts')
    expect(couverts.Valeur).toBe(100)
    expect(couverts['Δ']).toBe(20)
    expect(couverts['Δ (%)']).toBe('25.0 %')
    // Écart vs Budget
    expect(rows[4]['KPI']).toBe('Écart vs Budget (%)')
    expect(String(rows[4]['Valeur'])).toContain('11.1') // (5000-4500)/4500 = 11.11 %
  })

  it('affiche "Pas de budget cible" quand le budget est 0', () => {
    const rows = buildKpiSheetRows({
      totals: { couverts: 10, caTtc: 100, caHt: 90, tm: 10 },
      comparisonTotals: null,
      comparisonLabel: '',
      periodBudget: 0,
    })
    expect(rows[4]['Valeur']).toBe('Pas de budget cible')
  })
})

describe('buildEvolutionCaSheetRows', () => {
  it('1 ligne par bucket avec Δ Budget', () => {
    const rows = buildEvolutionCaSheetRows([
      { key: '2026-05-01', label: '01/05', caTot: 100, couverts: 10, budget: 80 },
      { key: '2026-05-02', label: '02/05', caTot: 50,  couverts: 5,  budget: 80 },
    ])
    expect(rows[0]['CA TTC réel']).toBe(100)
    expect(rows[0]['Δ Budget']).toBe(20)
    expect(rows[1]['Δ Budget']).toBe(-30)
  })
})

describe('buildEvolutionCouvertsSheetRows', () => {
  it('1 ligne par bucket', () => {
    const rows = buildEvolutionCouvertsSheetRows([
      { label: '01/05', couverts: 10 }, { label: '02/05', couverts: 5 },
    ])
    expect(rows).toEqual([
      { Période: '01/05', Couverts: 10 },
      { Période: '02/05', Couverts: 5 },
    ])
  })
})

describe('buildPerfJourSemaineSheetRows', () => {
  it('1 ligne par jour de semaine', () => {
    const perf = [
      { isoJds: 1, label: 'Lundi', count: 2, ca: 150, cv: 15, tm: 10 },
      { isoJds: 2, label: 'Mardi', count: 0, ca: 0, cv: 0, tm: null },
    ]
    const rows = buildPerfJourSemaineSheetRows(perf)
    expect(rows[0]['Jour']).toBe('Lundi')
    expect(rows[0]['CA TTC moyen']).toBe(150)
    expect(rows[1]['Ticket moyen']).toBe('')
  })
})

describe('buildMixSheetRows', () => {
  it('1 ligne par segment avec %', () => {
    const rows = buildMixSheetRows([
      { id: 'food', label: 'Food', value: 65, color: '#000', pct: 65 },
      { id: 'bev20', label: 'Alcool', value: 28, color: '#000', pct: 28 },
    ])
    expect(rows[0]).toEqual({ Catégorie: 'Food', 'CA TTC': 65, 'Part (%)': '65.0 %' })
  })
})

describe('buildTopBottomSheetRows', () => {
  it('top puis bottom dans la même feuille', () => {
    const rows = buildTopBottomSheetRows({
      top:    [{ iso: '2026-05-01', couvertsTot: 30, caTot: 1000, tm: 33.33 }],
      bottom: [{ iso: '2026-05-02', couvertsTot: 5,  caTot: 100,  tm: 20 }],
    })
    expect(rows).toHaveLength(2)
    expect(rows[0].Groupe).toBe('Top')
    expect(rows[1].Groupe).toBe('Bottom')
  })
})

describe('buildTableauJourJourSheetRows', () => {
  it('1 ligne par jour avec budget et Δ', () => {
    const rows = buildTableauJourJourSheetRows([
      { iso: '2026-05-01', lunchCouverts: 10, dinnerCouverts: 20, food: 200, bev_20: 50, bev_10: 10, autre: 5, caTot: 265, budget: 250, tm: 8.83 },
    ])
    expect(rows[0]['CA Total']).toBe(265)
    expect(rows[0]['Budget']).toBe(250)
    expect(rows[0]['Δ Budget']).toBe(15)
  })
})

describe('buildAnalysesWorkbook', () => {
  const baseOpts = {
    visibleIds: new Set(['kpi-couverts', 'kpi-ca-ttc', 'section-evolution-ca', 'section-tableau-jour-jour']),
    periode: '7j', dateDebut: '2026-05-03', dateFin: '2026-05-09',
    comparaison: 'aucune', lieuLabel: 'Tous lieux', service: 'tout',
    totals: { couverts: 100, caTtc: 5000, caHt: 4500, tm: 50, food: 3250, bev20: 1400, bev10: 350, autre: 0 },
    comparisonTotals: null, comparisonLabel: '', periodBudget: 4800,
    buckets: [{ key: '2026-05-03', label: '03/05', caTot: 1000, couverts: 20, budget: 700 }],
    granularity: 'day',
    perfWeekday: [],
    mix: [],
    topBottom: { top: [], bottom: [] },
    daysWithBudget: [{ iso: '2026-05-03', lunchCouverts: 10, dinnerCouverts: 10, food: 700, bev_20: 250, bev_10: 50, autre: 0, caTot: 1000, budget: 700, tm: 50 }],
  }

  it('crée toujours l\'onglet "Période & filtres"', () => {
    const wb = buildAnalysesWorkbook(baseOpts)
    expect(wb.SheetNames).toContain('Période & filtres')
  })

  it('un onglet KPIs si au moins un KPI est visible', () => {
    const wb = buildAnalysesWorkbook(baseOpts)
    expect(wb.SheetNames).toContain('KPIs')
  })

  it('un onglet par section visible, et seulement celles-là', () => {
    const wb = buildAnalysesWorkbook(baseOpts)
    expect(wb.SheetNames).toContain('Évolution CA')
    expect(wb.SheetNames).toContain('Tableau jour par jour')
    expect(wb.SheetNames).not.toContain('Mix Food-Bev')
    expect(wb.SheetNames).not.toContain('Évolution couverts')
  })

  it('respecte la limite Excel de 31 chars pour les noms d\'onglet', () => {
    const wb = buildAnalysesWorkbook({
      ...baseOpts,
      visibleIds: new Set([
        'kpi-couverts', 'kpi-ca-ttc', 'kpi-ca-ht', 'kpi-tm', 'kpi-ecart-budget-pct',
        'section-evolution-ca', 'section-evolution-couverts', 'section-perf-jour-semaine',
        'section-mix-food-bev', 'section-top-bottom-jours', 'section-tableau-jour-jour',
      ]),
    })
    for (const name of wb.SheetNames) {
      expect(name.length).toBeLessThanOrEqual(31)
    }
  })

  it('l\'onglet KPIs contient bien 5 lignes', () => {
    const wb = buildAnalysesWorkbook(baseOpts)
    const sheet = wb.Sheets['KPIs']
    const rows = XLSX.utils.sheet_to_json(sheet)
    expect(rows).toHaveLength(5)
  })
})

describe('buildFilename', () => {
  it('inclut les dates de la période', () => {
    expect(buildFilename('2026-05-01', '2026-05-09')).toBe('analyses-ca_2026-05-01_2026-05-09.xlsx')
  })
})
