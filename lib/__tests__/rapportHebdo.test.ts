import { describe, it, expect } from 'vitest'
import {
  caTtcVsBudget,
  caTtcCumulMois,
  tmParLieuService,
  tmFoodBevParService,
  mixFoodBev,
  couvertsParService,
  couvertsJourParJour,
  autreCaSurPeriode,
  autreCaCumulMois,
  autreCaParLieuService,
  buildRapportData,
  semaineEnCours,
  semainePrecedente,
  formatEur,
  formatPct,
  formatPeriode,
} from '../rapportHebdo'

const lieuxMap = new Map([
  ['L1', 'Salle à manger'],
  ['L2', 'Table de partage'],
])

const caRows = [
  // Mardi 5 mai 2026 - Salle Lunch : 25 couv, 6000 € (food 4000 + bev20 1500 + bev10 500)
  { jour: '2026-05-05', service: 'lunch',  lieu_service_id: 'L1', couverts: 25, ca_food: 4000, ca_bev_20: 1500, ca_bev_10: 500, ca_autre: 0 },
  // Mardi 5 mai - Salle Dinner : 40 couv, 12000 € (food 8000 + bev20 3500 + bev10 500)
  { jour: '2026-05-05', service: 'dinner', lieu_service_id: 'L1', couverts: 40, ca_food: 8000, ca_bev_20: 3500, ca_bev_10: 500, ca_autre: 0 },
]

// Budget : Salle (L1) ouvert mardi (jds=2)
const budgetRows = [
  { annee: 2026, mois: 5, jour_semaine: 2, lieu_service_id: 'L1', service: 'lunch',
    couverts_cible: 30, ca_food_cible: 5000, ca_bev_20_cible: 2000, ca_bev_10_cible: 500, ca_autre_cible: 0 },
  { annee: 2026, mois: 5, jour_semaine: 2, lieu_service_id: 'L1', service: 'dinner',
    couverts_cible: 45, ca_food_cible: 9000, ca_bev_20_cible: 4000, ca_bev_10_cible: 500, ca_autre_cible: 0 },
]

describe('caTtcVsBudget', () => {
  it('somme réel et budget sur la période + écart', () => {
    const res = caTtcVsBudget(caRows, budgetRows, '2026-05-05', '2026-05-05')
    expect(res.real).toBe(18000)         // 6000 + 12000
    expect(res.budget).toBe(21000)       // (5000+2000+500) + (9000+4000+500)
    expect(res.delta).toBe(-3000)
    expect(res.ratio).toBeCloseTo(-14.28, 1)
  })

  it('ignore les lignes hors période', () => {
    const res = caTtcVsBudget(caRows, budgetRows, '2026-05-01', '2026-05-04')
    expect(res.real).toBe(0)
  })
})

describe('caTtcCumulMois', () => {
  it('cumule depuis le 1er du mois jusqu\'à fin', () => {
    const res = caTtcCumulMois(caRows, budgetRows, '2026-05-09')
    // Réel : 18000 (seulement mardi)
    expect(res.real).toBe(18000)
    // Budget : tous les mardis dans la période 01-09 mai. Mardi 5 seulement → 21000
    expect(res.budget).toBe(21000)
  })
})

describe('tmParLieuService', () => {
  it('1 ligne par (lieu, service) avec TM réel et budget', () => {
    const res = tmParLieuService(caRows, budgetRows, lieuxMap, '2026-05-05', '2026-05-05')
    expect(res).toHaveLength(2)
    const lunch = res.find((r) => r.service === 'lunch')
    expect(lunch.lieu_label).toBe('Salle à manger')
    expect(lunch.real_tm).toBe(240)      // 6000 / 25
    expect(lunch.budget_tm).toBe(250)    // 7500 / 30
    expect(lunch.delta_tm).toBe(-10)
    expect(lunch.ratio_tm).toBeCloseTo(-4, 1)
  })
})

describe('tmFoodBevParService', () => {
  it('food et bev par service + total', () => {
    const res = tmFoodBevParService(caRows, budgetRows, '2026-05-05', '2026-05-05')
    // Midi : food=4000/25=160, bev=2000/25=80
    expect(res.midi.real_tm_food).toBe(160)
    expect(res.midi.real_tm_bev).toBe(80)
    // Budget midi : food=5000/30≈166.67, bev=2500/30≈83.33
    expect(res.midi.budget_tm_food).toBeCloseTo(166.67, 1)
    expect(res.midi.budget_tm_bev).toBeCloseTo(83.33, 1)
    // Soir : food=8000/40=200, bev=4000/40=100
    expect(res.soir.real_tm_food).toBe(200)
    expect(res.soir.real_tm_bev).toBe(100)
  })
})

describe('mixFoodBev', () => {
  it('pourcentages Food/Bev du TM total', () => {
    const tm = tmFoodBevParService(caRows, budgetRows, '2026-05-05', '2026-05-05')
    const mix = mixFoodBev(tm)
    // Midi : food 160 / (160+80) = 66.67 %
    expect(mix.midi.food_pct).toBeCloseTo(66.67, 1)
    expect(mix.midi.bev_pct).toBeCloseTo(33.33, 1)
  })
})

describe('couvertsParService', () => {
  it('couverts midi/soir/total réel vs budget', () => {
    const res = couvertsParService(caRows, budgetRows, '2026-05-05', '2026-05-05')
    expect(res.midi.real).toBe(25)
    expect(res.midi.budget).toBe(30)
    expect(res.midi.delta).toBe(-5)
    expect(res.soir.real).toBe(40)
    expect(res.total.real).toBe(65)
    expect(res.total.budget).toBe(75)
  })
})

describe('couvertsJourParJour', () => {
  it('1 ligne par date entre debut et fin', () => {
    const res = couvertsJourParJour(caRows, budgetRows, '2026-05-05', '2026-05-07')
    expect(res).toHaveLength(3)
    expect(res[0].iso).toBe('2026-05-05')
    expect(res[0].jour_fr).toBe('Mardi')
    expect(res[0].midi.real).toBe(25)
    expect(res[0].soir.real).toBe(40)
    // Mercredi 6 mai : pas de budget jds=3 → real et budget = 0
    expect(res[1].midi.real).toBe(0)
    expect(res[1].midi.budget).toBe(0)
  })
})

describe('buildRapportData', () => {
  it('renvoie toutes les sections en un appel', () => {
    const r = buildRapportData({
      caRows, budgetRows, lieuxMap,
      debut: '2026-05-05', fin: '2026-05-05',
    })
    expect(r.ca.real).toBe(18000)
    expect(r.couverts.total.real).toBe(65)
    expect(r.tmLieux).toHaveLength(2)
    expect(r.couvertsJpJ).toHaveLength(1)
    // Pas d'autre CA dans la fixture → 0 et liste vide
    expect(r.autreCa).toBe(0)
    expect(r.autreCaMois).toBe(0)
    expect(r.autreCaDetail).toEqual([])
  })
})

describe('autreCa helpers', () => {
  // Fixture dédiée — privatisations à La Cave / Salle (1 mer + 1 sam)
  const rowsAutre = [
    { jour: '2026-05-06', service: 'lunch',  lieu_service_id: 'L2', couverts: 12,
      ca_food: 2100, ca_bev_20: 1018, ca_bev_10: 196, ca_autre: 600 },
    { jour: '2026-05-09', service: 'dinner', lieu_service_id: 'L1', couverts: 36,
      ca_food: 9793, ca_bev_20: 4492, ca_bev_10: 414, ca_autre: 250 },
    // ca_autre = 0 → ignoré dans la liste détaillée
    { jour: '2026-05-09', service: 'lunch',  lieu_service_id: 'L1', couverts: 25,
      ca_food: 3691, ca_bev_20: 1519, ca_bev_10: 351, ca_autre: 0 },
    // Hors période (mois suivant) → ignoré
    { jour: '2026-06-02', service: 'dinner', lieu_service_id: 'L2', couverts: 5,
      ca_food: 1000, ca_bev_20: 0, ca_bev_10: 0, ca_autre: 999 },
  ]

  it('autreCaSurPeriode somme ca_autre des lignes dans la période', () => {
    expect(autreCaSurPeriode(rowsAutre, '2026-05-04', '2026-05-10')).toBe(850)
  })

  it('autreCaSurPeriode = 0 si rien à reporter', () => {
    expect(autreCaSurPeriode(rowsAutre, '2026-05-01', '2026-05-03')).toBe(0)
  })

  it('autreCaCumulMois remonte au 1er du mois de `fin`', () => {
    // fin = 9 mai → cumul du 01-09 mai inclut les deux lignes (600 + 250)
    expect(autreCaCumulMois(rowsAutre, '2026-05-09')).toBe(850)
    // fin = 06 mai → seul le mercredi compte (la ligne du 09 est postérieure)
    expect(autreCaCumulMois(rowsAutre, '2026-05-06')).toBe(600)
  })

  it('autreCaParLieuService liste uniquement les ca_autre > 0, triée', () => {
    const res = autreCaParLieuService(rowsAutre, lieuxMap, '2026-05-04', '2026-05-10')
    expect(res).toHaveLength(2)
    // Tri alphabétique : "Salle à manger" avant "Table de partage"
    expect(res[0]).toMatchObject({ lieu_label: 'Salle à manger', service: 'dinner', ca_autre: 250 })
    expect(res[1]).toMatchObject({ lieu_label: 'Table de partage', service: 'lunch', ca_autre: 600 })
  })

  it('autreCaParLieuService renvoie [] si aucune ligne avec ca_autre', () => {
    expect(autreCaParLieuService(caRows, lieuxMap, '2026-05-05', '2026-05-05')).toEqual([])
  })

  it('buildRapportData expose autreCa, autreCaMois et autreCaDetail', () => {
    const r = buildRapportData({
      caRows: rowsAutre, budgetRows: [], lieuxMap,
      debut: '2026-05-04', fin: '2026-05-10',
    })
    expect(r.autreCa).toBe(850)
    expect(r.autreCaMois).toBe(850)
    expect(r.autreCaDetail).toHaveLength(2)
  })
})

describe('semaineEnCours / semainePrecedente', () => {
  it('lundi-dimanche de la semaine courante', () => {
    // Mer 6 mai 2026
    const ref = new Date(2026, 4, 6)
    expect(semaineEnCours(ref)).toEqual({ debut: '2026-05-04', fin: '2026-05-10' })
  })

  it('semaine précédente', () => {
    const ref = new Date(2026, 4, 6)
    expect(semainePrecedente(ref)).toEqual({ debut: '2026-04-27', fin: '2026-05-03' })
  })
})

describe('formatters', () => {
  it('formatEur arrondi', () => {
    expect(formatEur(12345)).toMatch(/12\s345/)
    expect(formatEur(0)).toBe('0 €')
  })
  it('formatPct avec signe', () => {
    expect(formatPct(12.5)).toContain('+')
    expect(formatPct(-3.14)).toContain('-')
    expect(formatPct(null)).toBe('—')
  })
  it('formatPeriode condensé même mois', () => {
    expect(formatPeriode('2026-05-05', '2026-05-09')).toBe('du 05 au 09 mai')
  })
  it('formatPeriode même date', () => {
    expect(formatPeriode('2026-05-05', '2026-05-05')).toBe('du 05 mai')
  })
})
