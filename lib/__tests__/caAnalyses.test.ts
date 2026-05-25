import { describe, it, expect } from 'vitest'
import {
  getPeriodDates,
  shiftPeriodByYears,
  aggregateTotals,
  aggregateByDay,
  budgetByIsoJdsForMonth,
  periodBudgetTotal,
  pickGranularity,
  isoWeekStart,
  bucketDays,
  perfByWeekday,
  mixSegments,
  topBottomDays,
  aggregateBySerie,
  buildBreakdown,
  mixByService,
  bucketDaysMultiSeries,
  perfByWeekdayMultiSeries,
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

  it('mois-precedent résiste au DST (fin octobre → 31 et pas 30)', () => {
    // 1er novembre 2026 : on s'attend à "octobre 2026 entier" = 01→31/10.
    // L'ancien calcul `firstOfMonth - 86400000ms` retournait le 30/10 à cause
    // du changement d'heure d'hiver (1h récupérée la nuit du 24 → 25 oct).
    const nov1 = new Date(2026, 10, 1)
    expect(getPeriodDates('mois-precedent', nov1)).toEqual({ debut: '2026-10-01', fin: '2026-10-31' })
  })

  it('mois-precedent fonctionne pour tous les mois sur plusieurs années (sanity)', () => {
    // Boucle 2024-2027 × 12 mois : vérifie que `fin` est toujours le dernier
    // jour du mois précédent (et non un jour avant).
    for (let y = 2024; y <= 2027; y++) {
      for (let m = 0; m < 12; m++) {
        const today = new Date(y, m, 1) // 1er du mois courant
        const { debut, fin } = getPeriodDates('mois-precedent', today) || {}
        // Le mois précédent : m-1, ou 11 si m=0 ; année y, ou y-1 si m=0
        const expectedMois = m === 0 ? 12 : m
        const expectedAnnee = m === 0 ? y - 1 : y
        const lastDay = new Date(expectedAnnee, expectedMois, 0).getDate()
        expect(debut).toBe(`${expectedAnnee}-${String(expectedMois).padStart(2,'0')}-01`)
        expect(fin).toBe(`${expectedAnnee}-${String(expectedMois).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`)
      }
    }
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

  it('n\'utilise PAS une row d\'un autre mois comme fallback (cas Joia)', () => {
    // Cas réel : Joia a un budget Dimanche en JANVIER (mois=1, 15400). On
    // demande le budget pour MAI (monthNum=5). L'ancienne version pouvait
    // accidentellement prendre la row janvier comme "défaut" pour mai.
    // Nouvelle version : ignore les rows mois ≠ 5 et ≠ null.
    const rows = [
      { jour_semaine: 7, lieu_service_id: 'L1', service: 'lunch', mois: 1, ca_food_cible: 15400, ca_bev_20_cible: 0, ca_bev_10_cible: 0, ca_autre_cible: 0 },
    ]
    expect(budgetByIsoJdsForMonth(rows, 5).get(7)).toBeUndefined()
    expect(budgetByIsoJdsForMonth(rows, 1).get(7)).toBe(15400)
  })

  it('override d\'un autre mois ne contamine pas le mois demandé même si listé en premier', () => {
    // Garantit l'indépendance par rapport à l'ordre de la query Supabase.
    const rows = [
      // Override février (en premier dans l'array)
      { jour_semaine: 7, lieu_service_id: 'L1', service: 'lunch', mois: 2, ca_food_cible: 20000, ca_bev_20_cible: 0, ca_bev_10_cible: 0, ca_autre_cible: 0 },
      // Défaut annuel
      { jour_semaine: 7, lieu_service_id: 'L1', service: 'lunch', mois: null, ca_food_cible: 10000, ca_bev_20_cible: 0, ca_bev_10_cible: 0, ca_autre_cible: 0 },
    ]
    // Pour janvier (pas d'override) → on doit prendre le défaut 10 000, pas l'override février
    expect(budgetByIsoJdsForMonth(rows, 1).get(7)).toBe(10000)
    // Pour février → override 20 000
    expect(budgetByIsoJdsForMonth(rows, 2).get(7)).toBe(20000)
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

  it('filtre par jour-de-semaine si isoJdsFilter fourni', () => {
    // Lundi et mardi avec budget différent — filtrer sur lundi seul
    const rows = [
      { jour_semaine: 1, lieu_service_id: 'L1', service: 'lunch', mois: null, ca_food_cible: 100, ca_bev_20_cible: 0, ca_bev_10_cible: 0, ca_autre_cible: 0 },
      { jour_semaine: 2, lieu_service_id: 'L1', service: 'lunch', mois: null, ca_food_cible: 200, ca_bev_20_cible: 0, ca_bev_10_cible: 0, ca_autre_cible: 0 },
    ]
    // Période 2026-05-04 → 2026-05-05 (lundi puis mardi). Filtre = lundi seulement.
    const total = periodBudgetTotal({ 2026: rows }, '2026-05-04', '2026-05-05', new Set([1]))
    expect(total).toBe(100)
  })

  it('applique le ratio override nb_jours sur le mois entier', () => {
    // Mai 2026 contient 4 lundis (4, 11, 18, 25). Override dit "3 lundis"
    // (ex : un lundi férié). Budget lundi = 100. Sans override : 4 × 100 = 400.
    // Avec override : 3 × 100 = 300 (ratio 3/4 appliqué aux 4 lundis comptés).
    const rows = [
      { jour_semaine: 1, lieu_service_id: 'L1', service: 'lunch', mois: null, ca_food_cible: 100, ca_bev_20_cible: 0, ca_bev_10_cible: 0, ca_autre_cible: 0 },
    ]
    // Clé override "global" (service=null, lieu=null) → s'applique à toutes les cellules
    const overrides = new Map([['2026_5_1___all_____all__', 3]])
    const total = periodBudgetTotal({ 2026: rows }, '2026-05-01', '2026-05-31', null, overrides)
    expect(total).toBe(300)
  })

  it('ratio override scale proportionnellement quand la plage ne couvre qu\'une partie du mois', () => {
    // Plage 2026-05-01 → 2026-05-15 : couvre 2 lundis (4, 11) sur 4 du mois.
    // Override dit "3 lundis sur le mois" → ratio 3/4 = 0.75.
    // Résultat attendu : 2 × 100 × 0.75 = 150.
    const rows = [
      { jour_semaine: 1, lieu_service_id: 'L1', service: 'lunch', mois: null, ca_food_cible: 100, ca_bev_20_cible: 0, ca_bev_10_cible: 0, ca_autre_cible: 0 },
    ]
    const overrides = new Map([['2026_5_1___all_____all__', 3]])
    const total = periodBudgetTotal({ 2026: rows }, '2026-05-01', '2026-05-15', null, overrides)
    expect(total).toBe(150)
  })

  it('cas Joia : un override service=dinner ne zéroter pas le service=lunch du même jds', () => {
    // Joia : pas de service dimanche soir → override dim/dinner = 0.
    // Le dim midi (lunch) doit garder son budget normal (4 lundis × 100 = 400).
    const rows = [
      { jour_semaine: 7, lieu_service_id: 'L1', service: 'lunch',  mois: null, ca_food_cible: 100, ca_bev_20_cible: 0, ca_bev_10_cible: 0, ca_autre_cible: 0 },
      { jour_semaine: 7, lieu_service_id: 'L1', service: 'dinner', mois: null, ca_food_cible: 50,  ca_bev_20_cible: 0, ca_bev_10_cible: 0, ca_autre_cible: 0 },
    ]
    // 4 dimanches en mai 2026 (3, 10, 17, 24, 31 = 5 dim en réalité). Vérif :
    // Mai 2026 commence par ven → 3, 10, 17, 24, 31 = 5 dimanches.
    // Override dim/dinner = 0 → ratio dinner = 0/5 = 0 → dinner total = 0
    // Lunch : pas d'override → ratio = 1 → 5 dim × 100 = 500.
    const overrides = new Map([['2026_5_7_dinner___all__', 0]])
    const total = periodBudgetTotal({ 2026: rows }, '2026-05-01', '2026-05-31', null, overrides)
    expect(total).toBe(500)
  })

  it('aucun override fourni → comportement identique à l\'ancien', () => {
    // Mai 2026 : 4 lundis × 100 = 400.
    const rows = [
      { jour_semaine: 1, lieu_service_id: 'L1', service: 'lunch', mois: null, ca_food_cible: 100, ca_bev_20_cible: 0, ca_bev_10_cible: 0, ca_autre_cible: 0 },
    ]
    const sansArg = periodBudgetTotal({ 2026: rows }, '2026-05-01', '2026-05-31')
    const avecArgNull = periodBudgetTotal({ 2026: rows }, '2026-05-01', '2026-05-31', null, null)
    const avecMapVide = periodBudgetTotal({ 2026: rows }, '2026-05-01', '2026-05-31', null, new Map())
    expect(sansArg).toBe(400)
    expect(avecArgNull).toBe(400)
    expect(avecMapVide).toBe(400)
  })

  // Cas Privat 1 mardi/mois : budget affecté uniquement au dernier mardi
  // (aligné sur rapportHebdo.js). Avant le fix, le ratio 1/4 répartissait
  // le budget sur tous les mardis, ce qui surestimait le cumul MTD avant
  // le dernier mardi du mois.
  describe('overrides par lieu (cas Privat — dates élues)', () => {
    // Mai 2026 a 4 mardis : 5, 12, 19, 26. Le 26 est le dernier.
    const budgetPrivat = [
      // Joia Salle (L1) ouvert tous les mardis soir : 9000 €/mardi
      { jour_semaine: 2, lieu_service_id: 'L1', service: 'dinner', mois: null,
        ca_food_cible: 7000, ca_bev_20_cible: 1500, ca_bev_10_cible: 500, ca_autre_cible: 0 },
      // Privat (LPRIVAT) : budget mensuel = 8260 € avec override 1 mardi/mois
      { jour_semaine: 2, lieu_service_id: 'LPRIVAT', service: 'dinner', mois: 5,
        ca_food_cible: 6260, ca_bev_20_cible: 1500, ca_bev_10_cible: 500, ca_autre_cible: 0 },
    ]
    const overridesMap = new Map([
      // Override par lieu : 1 mardi/mois pour Privat dinner
      ['2026_5_2_dinner_LPRIVAT', 1],
    ])
    // electedDatesMap construit depuis les rows brutes : Privat élu uniquement le 26 mai
    const electedMap = new Map([
      ['2026_5_2_dinner_LPRIVAT', new Set(['2026-05-26'])],
    ])

    it('sur mois complet (1-31 mai) : Salle 4×9000 + Privat 1×8260 = 44260', () => {
      const total = periodBudgetTotal({ 2026: budgetPrivat }, '2026-05-01', '2026-05-31', null, overridesMap, electedMap)
      expect(total).toBe(44260)
    })

    it('sur MTD (1-25 mai, dernier mardi 26 EXCLU) : Salle 3×9000 + Privat 0 = 27000', () => {
      // C'est le bug que le user a signalé : avant fix, Privat était compté
      // 3 × 2065 = 6195 sur cette période. Maintenant Privat = 0 car le 26
      // n'est pas dans la période.
      const total = periodBudgetTotal({ 2026: budgetPrivat }, '2026-05-01', '2026-05-25', null, overridesMap, electedMap)
      expect(total).toBe(27000)
    })

    it('semaine du 25-31 mai (contient le 26) : Salle 1×9000 + Privat 1×8260 = 17260', () => {
      const total = periodBudgetTotal({ 2026: budgetPrivat }, '2026-05-25', '2026-05-31', null, overridesMap, electedMap)
      expect(total).toBe(17260)
    })

    it('sans electedDatesMap : régression vers ratio (preuve du bug avant fix)', () => {
      // Sur 1-25 mai sans electedDatesMap : Privat avec ratio 1/4
      // = 3 mardis × 2065 = 6195. Salle = 3 × 9000 = 27000. Total = 33195.
      const total = periodBudgetTotal({ 2026: budgetPrivat }, '2026-05-01', '2026-05-25', null, overridesMap)
      expect(total).toBe(33195)
    })

    it('cellule remappée avec lieu_parent_id ≠ lieu_service_id (cas page Analyses)', () => {
      // Reproduction du bug constaté en prod : sur Analyses, filterBudgets
      // ajoute `lieu_parent_id` aux rows budget (parent du lieu) MAIS garde
      // `lieu_service_id` à sa valeur enfant. L'override est stocké en DB
      // avec lieu_service_id = enfant. Le helper doit matcher sur l'enfant,
      // pas le parent — sinon les overrides sur lieux enfants ratent.
      const budgetAvecParent = [
        { jour_semaine: 2, lieu_service_id: 'L1', lieu_parent_id: 'L1', service: 'dinner', mois: null,
          ca_food_cible: 7000, ca_bev_20_cible: 1500, ca_bev_10_cible: 500, ca_autre_cible: 0 },
        // Privat enfant de Joia : lieu_service_id = LPRIVAT, lieu_parent_id = JOIA
        { jour_semaine: 2, lieu_service_id: 'LPRIVAT', lieu_parent_id: 'JOIA', service: 'dinner', mois: 5,
          ca_food_cible: 6260, ca_bev_20_cible: 1500, ca_bev_10_cible: 500, ca_autre_cible: 0 },
      ]
      // Sur MTD 1-25 mai : 3 mardis × 9000 (Salle) + 0 (Privat car le 26 hors plage) = 27000
      const total = periodBudgetTotal({ 2026: budgetAvecParent }, '2026-05-01', '2026-05-25', null, overridesMap, electedMap)
      expect(total).toBe(27000)
    })

    it('overrides global (lieu null) inchangés : ratio classique conservé', () => {
      // Override global (pas de lieu) ne doit PAS être affecté par electedMap.
      // Mai 2026 = 5 dimanches. Override "3 dim sur mois" → ratio 3/5.
      const rowsDim = [
        { jour_semaine: 7, lieu_service_id: 'L1', service: 'lunch', mois: null,
          ca_food_cible: 100, ca_bev_20_cible: 0, ca_bev_10_cible: 0, ca_autre_cible: 0 },
      ]
      const overrideGlobal = new Map([['2026_5_7___all_____all__', 3]])
      // electedMap vide → pas d'élection, comportement = ratio
      const total = periodBudgetTotal({ 2026: rowsDim }, '2026-05-01', '2026-05-31', null, overrideGlobal, new Map())
      // 5 dim × 100 × (3/5) = 300
      expect(total).toBe(300)
    })
  })

  it('cas Marsan : deux lieux enfants d\'un même parent ADDITIONNENT leurs budgets (ne s\'écrasent pas)', () => {
    // Marsan a "Table du chef" enfant de "Salle à manger", et "La cave" enfant
    // de "Table de partage". Avant le fix, le remap parent côté filterBudgets
    // écrasait les rows enfants entre elles dans budgetByIsoJdsForMonth.
    // Ici on simule deux enfants distincts avec le même jds/service/parent :
    // la fonction caAnalyses.js NE remap PAS, donc les deux cellules
    // distinctes (lieu_enfant1 vs lieu_enfant2) survivent et s'additionnent.
    const rows = [
      // Enfant 1 : Salle à manger principale (200/jour lundi midi)
      { jour_semaine: 1, lieu_service_id: 'enfant1', service: 'lunch', mois: null, ca_food_cible: 200, ca_bev_20_cible: 0, ca_bev_10_cible: 0, ca_autre_cible: 0 },
      // Enfant 2 : Table du chef (50/jour lundi midi) — même jds/svc/parent
      { jour_semaine: 1, lieu_service_id: 'enfant2', service: 'lunch', mois: null, ca_food_cible: 50,  ca_bev_20_cible: 0, ca_bev_10_cible: 0, ca_autre_cible: 0 },
    ]
    // Plage 04→04/05/2026 = 1 lundi → total attendu = 200 + 50 = 250
    expect(periodBudgetTotal({ 2026: rows }, '2026-05-04', '2026-05-04')).toBe(250)
  })
})

describe('pickGranularity', () => {
  it('≤ 31 jours → day', () => {
    expect(pickGranularity('2026-05-01', '2026-05-31')).toBe('day')
  })
  it('> 31 et ≤ 183 jours → week', () => {
    expect(pickGranularity('2026-01-01', '2026-04-30')).toBe('week')
  })
  it('> 183 jours → month', () => {
    expect(pickGranularity('2026-01-01', '2026-12-31')).toBe('month')
  })
})

describe('isoWeekStart', () => {
  it('renvoie le lundi de la semaine ISO', () => {
    // 2026-05-09 = samedi → lundi de la semaine = 2026-05-04
    expect(isoWeekStart('2026-05-09')).toBe('2026-05-04')
    // 2026-05-04 = lundi → reste 2026-05-04
    expect(isoWeekStart('2026-05-04')).toBe('2026-05-04')
    // 2026-05-10 = dimanche → lundi de la semaine = 2026-05-04
    expect(isoWeekStart('2026-05-10')).toBe('2026-05-04')
  })
})

describe('bucketDays', () => {
  const sampleDays = [
    { iso: '2026-05-04', isoJds: 1, jsWeekday: 1, caTot: 100, couvertsTot: 10, budget: 80, hasData: true },
    { iso: '2026-05-05', isoJds: 2, jsWeekday: 2, caTot: 200, couvertsTot: 20, budget: 80, hasData: true },
    { iso: '2026-05-11', isoJds: 1, jsWeekday: 1, caTot: 150, couvertsTot: 15, budget: 80, hasData: true },
  ]

  it('day : 1 bucket par jour', () => {
    const buckets = bucketDays(sampleDays, 'day')
    expect(buckets).toHaveLength(3)
    expect(buckets[0].caTot).toBe(100)
    expect(buckets[0].label).toBe('04/05')
  })

  it('week : agrège lundi → dimanche, lundi suivant nouveau bucket', () => {
    const buckets = bucketDays(sampleDays, 'week')
    expect(buckets).toHaveLength(2)
    expect(buckets[0].key).toBe('2026-05-04')
    expect(buckets[0].caTot).toBe(300) // 04 + 05 mai
    expect(buckets[0].budget).toBe(160)
    expect(buckets[1].caTot).toBe(150) // 11 mai
  })

  it('month : agrège par YYYY-MM', () => {
    const days = [
      { iso: '2026-04-30', isoJds: 4, jsWeekday: 4, caTot: 50, couvertsTot: 5, budget: 40, hasData: true },
      { iso: '2026-05-01', isoJds: 5, jsWeekday: 5, caTot: 100, couvertsTot: 10, budget: 80, hasData: true },
      { iso: '2026-05-15', isoJds: 5, jsWeekday: 5, caTot: 200, couvertsTot: 20, budget: 80, hasData: true },
    ]
    const buckets = bucketDays(days, 'month')
    expect(buckets).toHaveLength(2)
    expect(buckets[0].label).toBe('Avr.')
    expect(buckets[0].caTot).toBe(50)
    expect(buckets[1].label).toBe('Mai')
    expect(buckets[1].caTot).toBe(300)
  })
})

describe('perfByWeekday', () => {
  it('moyennes par jour ouvré, ignore les jours sans data', () => {
    const days = [
      { iso: '2026-05-04', isoJds: 1, caTot: 100, couvertsTot: 10, hasData: true },
      { iso: '2026-05-11', isoJds: 1, caTot: 200, couvertsTot: 20, hasData: true },
      { iso: '2026-05-05', isoJds: 2, caTot: 0,   couvertsTot: 0,  hasData: false },
    ]
    const perf = perfByWeekday(days)
    expect(perf).toHaveLength(7)
    // Lundi : moyenne = (100+200)/2 = 150 ; couverts = 30/2 = 15
    expect(perf[0].label).toBe('Lundi')
    expect(perf[0].ca).toBe(150)
    expect(perf[0].cv).toBe(15)
    // Mardi : pas de data → 0
    expect(perf[1].count).toBe(0)
    expect(perf[1].ca).toBe(0)
  })
})

describe('mixSegments', () => {
  const c = { principal: '#000', violet: '#7C3AED', accent: '#6366F1', orange: '#D97706' }

  it('renvoie les pourcentages par catégorie', () => {
    const segs = mixSegments({ food: 60, bev20: 28, bev10: 7, autre: 5 }, c)
    expect(segs).toHaveLength(4)
    expect(segs.find((s) => s.id === 'food').pct).toBeCloseTo(60, 5)
    expect(segs.find((s) => s.id === 'bev20').pct).toBeCloseTo(28, 5)
  })

  it('exclut les catégories à 0', () => {
    const segs = mixSegments({ food: 100, bev20: 0, bev10: 0, autre: 0 }, c)
    expect(segs).toHaveLength(1)
    expect(segs[0].id).toBe('food')
    expect(segs[0].pct).toBe(100)
  })

  it('renvoie [] si total = 0', () => {
    expect(mixSegments({ food: 0, bev20: 0, bev10: 0, autre: 0 }, c)).toEqual([])
  })
})

describe('topBottomDays', () => {
  const days = [
    { iso: '2026-05-01', caTot: 100, hasData: true },
    { iso: '2026-05-02', caTot: 500, hasData: true },
    { iso: '2026-05-03', caTot: 0,   hasData: false },
    { iso: '2026-05-04', caTot: 300, hasData: true },
    { iso: '2026-05-05', caTot: 200, hasData: true },
  ]

  it('top 2 / bottom 2 par CA TTC', () => {
    const { top, bottom } = topBottomDays(days, 2)
    expect(top.map((d) => d.iso)).toEqual(['2026-05-02', '2026-05-04'])
    expect(bottom.map((d) => d.iso)).toEqual(['2026-05-01', '2026-05-05'])
  })

  it('ignore les jours sans data', () => {
    const { top, bottom } = topBottomDays(days, 5)
    expect(top.length + bottom.length).toBeLessThanOrEqual(8) // 4 jours avec data
    expect(top.every((d) => d.hasData)).toBe(true)
    expect(bottom.every((d) => d.hasData)).toBe(true)
  })
})

describe('aggregateBySerie', () => {
  const lieuxLabels = new Map([['L1', 'Salle'], ['L2', 'Privat']])
  const rows = [
    { lieu_service_id: 'L1', service: 'lunch',  couverts: 10, ca_food: 100, ca_bev_20: 0, ca_bev_10: 0, ca_autre: 0 },
    { lieu_service_id: 'L1', service: 'dinner', couverts: 20, ca_food: 200, ca_bev_20: 0, ca_bev_10: 0, ca_autre: 0 },
    { lieu_service_id: 'L2', service: 'lunch',  couverts: 5,  ca_food: 50,  ca_bev_20: 0, ca_bev_10: 0, ca_autre: 0 },
  ]

  it('split par lieu : 1 entrée par lieu, totals agrégés', () => {
    const m = aggregateBySerie(rows, ['lieu'], lieuxLabels)
    expect(m.size).toBe(2)
    expect(m.get('Salle').couverts).toBe(30)
    expect(m.get('Salle').caTtc).toBe(300)
    expect(m.get('Privat').couverts).toBe(5)
  })

  it('split par service : 1 entrée par service', () => {
    const m = aggregateBySerie(rows, ['service'], lieuxLabels)
    expect(m.get('Déjeuner').couverts).toBe(15)
    expect(m.get('Dîner').couverts).toBe(20)
  })

  it('split lieu × service : produit cartésien des combinaisons rencontrées', () => {
    const m = aggregateBySerie(rows, ['lieu', 'service'], lieuxLabels)
    expect(m.size).toBe(3) // L1/lunch, L1/dinner, L2/lunch
    expect(m.get('Salle / Déjeuner').couverts).toBe(10)
    expect(m.get('Salle / Dîner').couverts).toBe(20)
    expect(m.get('Privat / Déjeuner').couverts).toBe(5)
  })

  it('splitDims vide : 1 seule entrée __all__', () => {
    const m = aggregateBySerie(rows, [], lieuxLabels)
    expect(m.size).toBe(1)
    expect(m.get('__all__').couverts).toBe(35)
  })
})

describe('buildBreakdown', () => {
  it('renvoie les % par série, triés décroissant', () => {
    const series = new Map([
      ['Salle', { caTtc: 600, couverts: 60 }],
      ['Privat', { caTtc: 400, couverts: 40 }],
    ])
    const bd = buildBreakdown(series, 'caTtc')
    expect(bd[0]).toEqual({ serie: 'Salle', value: 600, pct: 60 })
    expect(bd[1]).toEqual({ serie: 'Privat', value: 400, pct: 40 })
  })

  it('renvoie pct=0 partout si total=0', () => {
    const series = new Map([['A', { caTtc: 0 }], ['B', { caTtc: 0 }]])
    const bd = buildBreakdown(series, 'caTtc')
    expect(bd.every((e) => e.pct === 0)).toBe(true)
  })
})

describe('mixByService', () => {
  it('matrice 2 services × 4 catégories en pourcentages du grand total', () => {
    const rows = [
      { service: 'lunch',  ca_food: 65, ca_bev_20: 28, ca_bev_10: 7, ca_autre: 0 },
      { service: 'dinner', ca_food: 65, ca_bev_20: 28, ca_bev_10: 7, ca_autre: 0 },
    ]
    const mix = mixByService(rows)
    expect(mix).toHaveLength(2)
    const lunch = mix.find((m) => m.service === 'lunch')
    expect(lunch.ttc).toBe(100)
    expect(lunch.pctFood).toBeCloseTo(32.5, 5) // 65 / 200
    expect(lunch.pctTotal).toBeCloseTo(50, 5)
  })
})

describe('bucketDaysMultiSeries', () => {
  it('fusionne plusieurs séries au même bucket', () => {
    const daysSalle = [
      { iso: '2026-05-01', isoJds: 5, jsWeekday: 5, caTot: 100, couvertsTot: 10, hasData: true },
    ]
    const daysPrivat = [
      { iso: '2026-05-01', isoJds: 5, jsWeekday: 5, caTot: 50, couvertsTot: 5, hasData: true },
    ]
    const daysBySerie = new Map([['Salle', daysSalle], ['Privat', daysPrivat]])
    const { series, buckets } = bucketDaysMultiSeries(daysBySerie, 'day', 'caTot')
    expect(series).toEqual(['Salle', 'Privat'])
    expect(buckets).toHaveLength(1)
    expect(buckets[0]['Salle']).toBe(100)
    expect(buckets[0]['Privat']).toBe(50)
  })
})

describe('perfByWeekdayMultiSeries', () => {
  it('moyennes par jour-semaine ET par série', () => {
    const days = [
      { iso: '2026-05-04', isoJds: 1, caTot: 200, couvertsTot: 20, hasData: true }, // lundi
      { iso: '2026-05-11', isoJds: 1, caTot: 100, couvertsTot: 10, hasData: true }, // lundi
    ]
    const daysBySerie = new Map([['Salle', days]])
    const { data } = perfByWeekdayMultiSeries(daysBySerie, 'ca')
    expect(data[0].label).toBe('Lundi')
    expect(data[0]['Salle']).toBe(150) // (200 + 100) / 2
  })
})
