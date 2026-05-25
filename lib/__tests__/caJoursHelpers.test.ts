import { describe, it, expect } from 'vitest'
import {
  countIsoJdsInMonth,
  pickLastNOccurrencesOfDow,
  buildElectedDatesMap,
  isCellElectedForDate,
} from '../caJoursHelpers'

describe('countIsoJdsInMonth', () => {
  it('compte 4 mardis en mai 2026 (5, 12, 19, 26)', () => {
    expect(countIsoJdsInMonth(2026, 5, 2)).toBe(4)
  })
  it('compte 5 vendredis en mai 2026 (1, 8, 15, 22, 29)', () => {
    expect(countIsoJdsInMonth(2026, 5, 5)).toBe(5)
  })
  it('dimanche = isoJds 7 (pas 0)', () => {
    // Mai 2026 a 5 dimanches : 3, 10, 17, 24, 31
    expect(countIsoJdsInMonth(2026, 5, 7)).toBe(5)
  })
  it('février non-bissextile 2026 a 4 occurrences de chaque jour', () => {
    expect(countIsoJdsInMonth(2026, 2, 2)).toBe(4)
  })
})

describe('pickLastNOccurrencesOfDow', () => {
  it('mai 2026, dernier mardi → 2026-05-26', () => {
    expect(pickLastNOccurrencesOfDow(2026, 5, 2, 1)).toEqual(['2026-05-26'])
  })
  it('mai 2026, 2 derniers mardis → 19, 26', () => {
    expect(pickLastNOccurrencesOfDow(2026, 5, 2, 2)).toEqual(['2026-05-19', '2026-05-26'])
  })
  it('n=4 demande exactement tous les mardis du mois', () => {
    expect(pickLastNOccurrencesOfDow(2026, 5, 2, 4)).toEqual([
      '2026-05-05', '2026-05-12', '2026-05-19', '2026-05-26',
    ])
  })
  it('n>=total → cappé à toutes les occurrences', () => {
    expect(pickLastNOccurrencesOfDow(2026, 5, 2, 10)).toEqual([
      '2026-05-05', '2026-05-12', '2026-05-19', '2026-05-26',
    ])
  })
  it('n=0 → liste vide', () => {
    expect(pickLastNOccurrencesOfDow(2026, 5, 2, 0)).toEqual([])
  })
  it('n=null → toutes les occurrences', () => {
    expect(pickLastNOccurrencesOfDow(2026, 5, 2, null)).toHaveLength(4)
  })
})

describe('buildElectedDatesMap', () => {
  it('indexe par (annee, mois, jds, svc, lieu) avec les dates élues', () => {
    const rows = [
      { annee: 2026, mois: 5, jour_semaine: 2, service: 'dinner', lieu_service_id: 'LPRIVAT', nb_jours: 1 },
    ]
    const map = buildElectedDatesMap(rows)
    const set = map.get('2026_5_2_dinner_LPRIVAT')
    expect(set).toBeDefined()
    expect(set?.has('2026-05-26')).toBe(true)
    expect(set?.has('2026-05-19')).toBe(false)
  })
  it('ignore les overrides sans lieu_service_id (global / service)', () => {
    const rows = [
      { annee: 2026, mois: 5, jour_semaine: 2, service: 'dinner', lieu_service_id: null, nb_jours: 1 },
      { annee: 2026, mois: 5, jour_semaine: 3, service: 'lunch', lieu_service_id: 'LPRIVAT', nb_jours: 2 },
    ]
    const map = buildElectedDatesMap(rows)
    expect(map.size).toBe(1) // seul le 2e a été indexé
    expect(map.has('2026_5_3_lunch_LPRIVAT')).toBe(true)
  })
  it('tolère rows vides ou null', () => {
    expect(buildElectedDatesMap(null).size).toBe(0)
    expect(buildElectedDatesMap([]).size).toBe(0)
  })
})

describe('isCellElectedForDate', () => {
  const electedMap = buildElectedDatesMap([
    { annee: 2026, mois: 5, jour_semaine: 2, service: 'dinner', lieu_service_id: 'LPRIVAT', nb_jours: 1 },
  ])

  it('cellule sans override → toujours true', () => {
    const cell = { jour_semaine: 2, service: 'dinner', lieu_service_id: 'L1' }
    expect(isCellElectedForDate(cell, '2026-05-12', 2026, 5, electedMap)).toBe(true)
    expect(isCellElectedForDate(cell, '2026-05-26', 2026, 5, electedMap)).toBe(true)
  })

  it('cellule avec override → true uniquement pour la date élue', () => {
    const cell = { jour_semaine: 2, service: 'dinner', lieu_service_id: 'LPRIVAT' }
    expect(isCellElectedForDate(cell, '2026-05-05', 2026, 5, electedMap)).toBe(false)
    expect(isCellElectedForDate(cell, '2026-05-12', 2026, 5, electedMap)).toBe(false)
    expect(isCellElectedForDate(cell, '2026-05-19', 2026, 5, electedMap)).toBe(false)
    expect(isCellElectedForDate(cell, '2026-05-26', 2026, 5, electedMap)).toBe(true)
  })

  it('lieu_service_id_source prioritaire sur lieu_service_id (cas remappage parent)', () => {
    // Cellule remappée vers parent JOIA mais source = LPRIVAT
    const cell = {
      jour_semaine: 2, service: 'dinner',
      lieu_service_id: 'JOIA',
      lieu_service_id_source: 'LPRIVAT',
    }
    expect(isCellElectedForDate(cell, '2026-05-12', 2026, 5, electedMap)).toBe(false)
    expect(isCellElectedForDate(cell, '2026-05-26', 2026, 5, electedMap)).toBe(true)
  })

  it('map vide ou null → toujours true', () => {
    const cell = { jour_semaine: 2, service: 'dinner', lieu_service_id: 'LPRIVAT' }
    expect(isCellElectedForDate(cell, '2026-05-12', 2026, 5, new Map())).toBe(true)
    expect(isCellElectedForDate(cell, '2026-05-12', 2026, 5, null)).toBe(true)
  })
})
