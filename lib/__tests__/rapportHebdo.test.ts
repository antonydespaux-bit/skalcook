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
  it('pourcentages Food/Bev du TM par service', () => {
    const tm = tmFoodBevParService(caRows, budgetRows, '2026-05-05', '2026-05-05')
    const mix = mixFoodBev(tm)
    // Midi : food 160 / (160+80) = 66.67 %
    expect(mix.midi.food_pct).toBeCloseTo(66.67, 1)
    expect(mix.midi.bev_pct).toBeCloseTo(33.33, 1)
    // Soir : food 200 / (200+100) = 66.67 % (mêmes proportions par hasard)
    expect(mix.soir.food_pct).toBeCloseTo(66.67, 1)
  })

  it('total = moyenne ARITHMÉTIQUE des % midi et soir (pas pondérée)', () => {
    // Cas inspiré du rapport hebdo Joia 18-24 mai où l'utilisateur calculait
    // (83 + 65) / 2 = 74 mais le code affichait 70 (moyenne pondérée tirée
    // par le soir qui a plus de volume). On bascule sur la moyenne arithmétique
    // pour matcher l'attente naturelle de l'utilisateur.
    const tm = {
      midi: { real_tm_food: 83, real_tm_bev: 17 }, // 83/100 = 83 %
      soir: { real_tm_food: 65, real_tm_bev: 35 }, // 65/100 = 65 %
      // total pondéré classique : si midi=10cv et soir=100cv,
      // food_total_tm = (830 + 6500) / 110 = 66.6 → ~ 66 % (proche soir)
      // Avec moyenne arithmétique : (83 + 65) / 2 = 74 % (indépendant des volumes)
      total: { real_tm_food: 66.6, real_tm_bev: 33.4 },
    }
    const mix = mixFoodBev(tm)
    expect(mix.total.food_pct).toBe(74)
    expect(mix.total.bev_pct).toBe(26)
  })

  it('si un seul service a des couverts → total = ce service seul', () => {
    const tm = {
      midi: { real_tm_food: 80, real_tm_bev: 20 },
      soir: { real_tm_food: 0, real_tm_bev: 0 }, // pas de couverts le soir
      total: { real_tm_food: 80, real_tm_bev: 20 },
    }
    const mix = mixFoodBev(tm)
    expect(mix.total.food_pct).toBe(80)
    expect(mix.total.bev_pct).toBe(20)
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

// ── Cas Privat (1 mardi/mois) — overrides par lieu ────────────────────────
//
// Référence du bug : avant fix, periodBudget agrégeait un budget par jds×lieu
// puis le multipliait par le nb calendaire d'occurrences du jds dans la
// période. Pour un lieu "Privat" facturé 1 mardi/mois mais avec un budget
// mensuel saisi en /budgets, le budget cumulé se voyait multiplié par 4 ou 5.
//
// Comportement attendu après fix : la cellule budgétée n'est comptée que pour
// les N dernières occurrences du jour-de-semaine dans le mois (par défaut
// "dernier mardi" pour Privat = 1).
describe('overrides nb_jours par lieu (cas Privat 1 mardi/mois)', () => {
  // Mai 2026 a 4 mardis : 05, 12, 19, 26
  const budgetRowsPrivat = [
    // Joia salle (L1) ouvert tous les mardis soir : budget 9 000 €
    { annee: 2026, mois: 5, jour_semaine: 2, lieu_service_id: 'L1', service: 'dinner',
      couverts_cible: 45, ca_food_cible: 7000, ca_bev_20_cible: 1500, ca_bev_10_cible: 500, ca_autre_cible: 0 },
    // Joia Privat (LPRIVAT) ouvert 1 mardi soir/mois : budget 5 000 €
    { annee: 2026, mois: 5, jour_semaine: 2, lieu_service_id: 'LPRIVAT', service: 'dinner',
      couverts_cible: 30, ca_food_cible: 3500, ca_bev_20_cible: 1500, ca_bev_10_cible: 0, ca_autre_cible: 0 },
  ]
  const overridesPrivat = [
    { annee: 2026, mois: 5, jour_semaine: 2, service: 'dinner', lieu_service_id: 'LPRIVAT', nb_jours: 1 },
  ]

  it('periodBudget : sans override → toutes les cellules sont comptées chaque mardi (régression)', () => {
    // Sans passer joursOverrideRows, le comportement historique : tous les
    // mardis du mois reçoivent budget Salle + Privat → 4 × (9000 + 5000) = 56000.
    const res = caTtcVsBudget([], budgetRowsPrivat, '2026-05-01', '2026-05-31')
    expect(res.budget).toBe(56000)
  })

  it('periodBudget : avec override → Privat n\'est compté que le dernier mardi (26)', () => {
    const res = caTtcVsBudget([], budgetRowsPrivat, '2026-05-01', '2026-05-31', null, overridesPrivat)
    // Salle (L1) tous les mardis : 4 × 9000 = 36000
    // Privat (LPRIVAT) seulement le 26 : 1 × 5000 = 5000
    // Total = 41000
    expect(res.budget).toBe(41000)
  })

  it('periodBudget : semaine SANS le dernier mardi → Privat à 0', () => {
    // 5-11 mai (mardi 5) : pas le dernier mardi du mois.
    const res = caTtcVsBudget([], budgetRowsPrivat, '2026-05-05', '2026-05-11', null, overridesPrivat)
    // Seulement Salle ce mardi : 9000
    expect(res.budget).toBe(9000)
  })

  it('periodBudget : semaine AVEC le dernier mardi (26 mai) → Privat compté', () => {
    // 25-31 mai (mardi 26) : c'est le dernier mardi.
    const res = caTtcVsBudget([], budgetRowsPrivat, '2026-05-25', '2026-05-31', null, overridesPrivat)
    expect(res.budget).toBe(14000) // 9000 + 5000
  })

  it('couvertsJourParJour : Privat (30 cv) n\'est ajouté que le 26 mai', () => {
    const jours = couvertsJourParJour([], budgetRowsPrivat, '2026-05-01', '2026-05-31', null, overridesPrivat)
    const mardi05 = jours.find((j) => j.iso === '2026-05-05')
    const mardi12 = jours.find((j) => j.iso === '2026-05-12')
    const mardi19 = jours.find((j) => j.iso === '2026-05-19')
    const mardi26 = jours.find((j) => j.iso === '2026-05-26')
    // Mardis sans privat : seulement Salle (45 couv dinner)
    expect(mardi05?.soir.budget).toBe(45)
    expect(mardi12?.soir.budget).toBe(45)
    expect(mardi19?.soir.budget).toBe(45)
    // Mardi 26 : Salle 45 + Privat 30 = 75
    expect(mardi26?.soir.budget).toBe(75)
  })

  it('tmParLieuService : Privat agrège uniquement le mardi élu', () => {
    const lieuxMapPrivat = new Map([['L1', 'Salle'], ['LPRIVAT', 'Privat']])
    const lignes = tmParLieuService([], budgetRowsPrivat, lieuxMapPrivat, '2026-05-01', '2026-05-31', null, overridesPrivat)
    const privat = lignes.find((l) => l.lieu_id === 'LPRIVAT' && l.service === 'dinner')
    // Privat compté 1 fois : 30 couverts × 1 mardi, ca 5000 × 1
    expect(privat?.budget_couverts).toBe(30)
    expect(privat?.budget_ca).toBe(5000)
  })

  // Cas Joia mai 2026 : override global vendredi = 4 sur mois à 5 vendredis.
  // Avant fix : Rapport hebdo comptait 5 vendredis × budget (ignorait l'override).
  // Après fix : compte 5 × budget × (4/5) = 4 × budget équivalent (aligné Analyses).
  // L'écart de 8 580 € constaté en prod chez Joia vient de là : budget vendredi
  // Resto Joia = 10 725 €/vendredi, ratio 4/5 → 2 145 € de différence par vendredi
  // × 4 vendredis sur 1-24 mai = 8 580 €.
  describe('overrides global (cas Joia vendredi 4/5)', () => {
    // Mai 2026 a 5 vendredis : 1, 8, 15, 22, 29
    const budgetVen = [
      { annee: 2026, mois: 5, jour_semaine: 5, lieu_service_id: 'L1', service: 'dinner',
        couverts_cible: 50, ca_food_cible: 7000, ca_bev_20_cible: 700, ca_bev_10_cible: 0, ca_autre_cible: 0 }, // total 7 700
      { annee: 2026, mois: 5, jour_semaine: 5, lieu_service_id: 'L1', service: 'lunch',
        couverts_cible: 30, ca_food_cible: 2500, ca_bev_20_cible: 525, ca_bev_10_cible: 0, ca_autre_cible: 0 }, // total 3 025
    ]
    // Override global "vendredi=4" appliqué à dinner ET lunch
    const overridesVen = [
      { annee: 2026, mois: 5, jour_semaine: 5, service: 'dinner', lieu_service_id: null, nb_jours: 4 },
      { annee: 2026, mois: 5, jour_semaine: 5, service: 'lunch',  lieu_service_id: null, nb_jours: 4 },
    ]

    it('sans override : 5 vendredis × 10 725 = 53 625 (comportement avant fix)', () => {
      const res = caTtcVsBudget([], budgetVen, '2026-05-01', '2026-05-31')
      expect(res.budget).toBe(53625)
    })

    it('avec override global vendredi=4 : 5 × 10 725 × (4/5) = 42 900 (mois complet)', () => {
      const res = caTtcVsBudget([], budgetVen, '2026-05-01', '2026-05-31', null, overridesVen)
      expect(res.budget).toBe(42900)
    })

    it('avec override sur 1-24 mai (4 vendredis dans la plage) : 4 × 10 725 × 0.8 = 34 320', () => {
      // C'est exactement le bug constaté chez Joia : sans fix, Rapport hebdo
      // donnerait 4 × 10 725 = 42 900. Avec fix, 34 320 = aligné avec Analyses.
      const res = caTtcVsBudget([], budgetVen, '2026-05-01', '2026-05-24', null, overridesVen)
      expect(res.budget).toBe(34320)
    })

    it('override global lieu null prioritaire sur priorité (lieu, svc) si pas trouvé', () => {
      // Si l'override (lieu spécifique) n'existe pas, retombe sur (NULL, svc)
      // puis (NULL, NULL). C'est la convention de ratioOverrideForCell.
      const budgetSimple = [
        { annee: 2026, mois: 5, jour_semaine: 5, lieu_service_id: 'L1', service: 'dinner',
          couverts_cible: 0, ca_food_cible: 100, ca_bev_20_cible: 0, ca_bev_10_cible: 0, ca_autre_cible: 0 },
      ]
      const overrideGlobalAll = [
        // Pas de service ni lieu : override global "tous les vendredis = 4"
        { annee: 2026, mois: 5, jour_semaine: 5, service: null, lieu_service_id: null, nb_jours: 4 },
      ]
      // Mai entier : 5 vendredis × 100 × (4/5) = 400
      const res = caTtcVsBudget([], budgetSimple, '2026-05-01', '2026-05-31', null, overrideGlobalAll)
      expect(res.budget).toBe(400)
    })
  })

  it('respecte lieu_service_id_source (cas remappage parent du rapport hebdo)', () => {
    // Cas réel : la page rapport-hebdo remap lieu_service_id vers le parent
    // pour les agrégations. La cellule budget remappée perd son ID enfant
    // mais conserve lieu_service_id_source pour matcher l'override.
    const budgetRemap = budgetRowsPrivat.map((r) => ({
      ...r,
      lieu_service_id_source: r.lieu_service_id, // ID enfant conservé
      lieu_service_id: r.lieu_service_id === 'LPRIVAT' ? 'JOIA' : r.lieu_service_id, // remap vers parent
    }))
    const res = caTtcVsBudget([], budgetRemap, '2026-05-01', '2026-05-31', null, overridesPrivat)
    // Même résultat que sans remap : 41000
    expect(res.budget).toBe(41000)
  })
})
