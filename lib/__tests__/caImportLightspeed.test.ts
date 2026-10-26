import { describe, expect, it } from 'vitest'
import {
  construireCellules,
  detecterTypeFichier,
  devinerColonne,
  devinerLieu,
  jourEtService,
  lireDepartements,
  lireTickets,
  partsParTaux,
  periodeDuNomFichier,
  regrouperTickets,
  ttcParTaux,
} from '../caImportLightspeed'

const ENTETE_TICKETS = ['Identifier', 'Date', 'AccountName', 'Total', 'TaxName', 'Couverts', 'Type', 'Consommateur', 'Profil', 'Paiement', 'OpenDate']
const ticket = (id: string, total: string, taxes: string, couverts: string, profil: string, ouverture: string, type = 'SALE') =>
  [id, '', 'Table 1', total, taxes, couverts, type, '', profil, 'Carte bleue', ouverture]

const ENTETE_DEPTS = ['Département', 'Quantité totale', 'Montant total', 'Taxe', 'Montant net', 'Montant brut de la transaction', 'Montant net de la transaction']

describe('detecterTypeFichier / periodeDuNomFichier', () => {
  it('reconnaît les deux exports', () => {
    expect(detecterTypeFichier(['"Identifier"', 'Total', 'TaxName', 'Profil', 'OpenDate'])).toBe('tickets')
    expect(detecterTypeFichier(ENTETE_DEPTS)).toBe('departements')
    expect(detecterTypeFichier(['Désignation', 'SKU'])).toBeNull()
  })
  it('lit la période du nom de fichier', () => {
    expect(periodeDuNomFichier('Marsan_Marsan_accounting-groups_20261024_20261024 (1).csv')).toEqual({ debut: '2026-10-24', fin: '2026-10-24' })
    expect(periodeDuNomFichier('export.csv')).toBeNull()
  })
})

describe('jourEtService', () => {
  const dh = (jour: number, h: number, min: number) => ({ annee: 2026, mois: 10, jour, h, min })
  it('midi avant 18:30, soir après', () => {
    expect(jourEtService(dh(15, 12, 14))).toEqual({ jour: '2026-10-15', service: 'lunch' })
    expect(jourEtService(dh(15, 18, 29))).toEqual({ jour: '2026-10-15', service: 'lunch' })
    expect(jourEtService(dh(15, 19, 18))).toEqual({ jour: '2026-10-15', service: 'dinner' })
  })
  it('après minuit, le ticket reste sur la veille', () => {
    expect(jourEtService(dh(16, 0, 26))).toEqual({ jour: '2026-10-15', service: 'dinner' })
    expect(jourEtService(dh(1, 2, 0))).toEqual({ jour: '2026-09-30', service: 'dinner' })
  })
  it('respecte les réglages de l’établissement', () => {
    const r = { coupure_jour: '04:00', fin_midi: '17:00', lieux: {}, departements: {} }
    expect(jourEtService(dh(15, 17, 30), r).service).toBe('dinner')
    expect(jourEtService(dh(16, 4, 30), r).jour).toBe('2026-10-16')
  })
})

describe('ttcParTaux', () => {
  it('arrondit à l’euro les parts d’un ticket en euros ronds', () => {
    // 2 630 € : TVA 20 % 263,33 → 1 579,98 ; TVA 10 % 95,45 → 1 049,95
    expect(ttcParTaux(263000, { '20': 26333, '10': 9545 })).toEqual({ '20': 158000, '10': 105000 })
    // 160 € : 10 % 0,91 → 10,01 ; 20 % 25 → 150
    expect(ttcParTaux(16000, { '10': 91, '20': 2500 })).toEqual({ '10': 1000, '20': 15000 })
  })
  it('garde les centimes quand les prix ne sont pas ronds', () => {
    // 10 € = café 4,50 € (10 %) + 5,50 € (20 %)
    const r = ttcParTaux(1000, { '10': 41, '20': 92 })
    expect(r['10'] + r['20']).toBe(1000)
    expect(r['10'] % 100).not.toBe(0)
  })
  it('ticket sans taxe → taux 0', () => {
    expect(ttcParTaux(5000, {})).toEqual({ '0': 5000 })
    expect(ttcParTaux(0, {})).toEqual({})
  })
})

describe('regroupement et cellules', () => {
  const rows = [
    ticket('1', '2630.0', 'TVA 20%:263.33|TVA 10%:95.45', '8.0', 'Table de Partage', '24/10/26 11:58'),
    ticket('2', '397.0', 'TVA 10%:31.36|TVA 20%:8.67', '2.0', 'Salle à Manger', '24/10/26 12:19'),
    ticket('3', '866.0', 'TVA 10%:60.73|TVA 20%:33', '2.0', 'Salon Privé', '24/10/26 19:57'),
    ticket('4', '-866.0', 'TVA 10%:-60.73|TVA 20%:-33', '-2.0', 'Salon Privé', '24/10/26 22:46', 'VOID'),
    ticket('5', '866.0', 'TVA 10%:60.73|TVA 20%:33', '2.0', 'Salon Privé', '24/10/26 22:46', 'RECALL'),
    ticket('6', '520.0', 'TVA 10%:47.27', '1.0', 'Salle à Manger', '25/10/26 00:17', 'SPLIT'),
    ['x', '', '', 'abc', '', '', '', '', '', '', 'pas une date'],
  ]
  const { tickets, erreurs } = lireTickets(ENTETE_TICKETS, rows)
  const groupes = regrouperTickets(tickets)

  it('signale les lignes illisibles', () => {
    expect(erreurs).toEqual([8])
    expect(tickets).toHaveLength(6)
  })

  it('additionne annulations et rappels, garde l’après-minuit sur la veille', () => {
    const salon = groupes.find((g) => g.profil === 'Salon Privé')!
    expect(salon.total).toBe(86600)
    expect(salon.couverts).toBe(2)
    const salleSoir = groupes.find((g) => g.profil === 'Salle à Manger' && g.service === 'dinner')!
    expect(salleSoir.jour).toBe('2026-10-24')
    expect(salleSoir.total).toBe(52000)
  })

  it('envoie chaque groupe vers le lieu choisi et fusionne', () => {
    const dest: Record<string, string> = {}
    for (const g of groupes) dest[g.cle] = g.profil === 'Table de Partage' ? 'privat' : 'salle'
    const cellules = construireCellules(groupes, dest)
    const soir = cellules.find((c) => c.lieu_service_id === 'salle' && c.service === 'dinner')!
    expect(soir.couverts).toBe(3)
    expect(soir.ca_food + soir.ca_bev_20).toBeCloseTo(1386, 2)
    const privat = cellules.find((c) => c.lieu_service_id === 'privat')!
    // sans export Départements : 10 % → Food, 20 % → Bev 20
    expect(privat.ca_bev_10).toBe(0)
    expect(privat.ca_food + privat.ca_bev_20).toBeCloseTo(2630, 2)
  })

  it('ignore un groupe sans lieu', () => {
    expect(construireCellules(groupes, {})).toEqual([])
  })

  const DEPTS = [
    ['Cuisine', '761', '19342', '1758.36', '17583.64', '19342.0', '17583.64'],
    ['Boissons avec alcool', '117', '8347', '1374.5', '6972.5', '8247.0', '6872.5'],
    ['Boissons sans alcool', '64', '692', '62.91', '629.09', '692.0', '629.09'],
    ['Divers 20%', '12', '700', '116.67', '583.33', '700.0', '583.33'],
    ['Pâtisserie & Chaud', '0', '0', '0', '0', '0.0', '0.0'],
  ]

  it('répartit selon l’export Départements sans perdre un centime', () => {
    const deps = lireDepartements(ENTETE_DEPTS, [
      ['Cuisine', '761', '19342', '1758.36', '17583.64', '19342.0', '17583.64'],
      ['Boissons avec alcool', '117', '8347', '1374.5', '6972.5', '8247.0', '6872.5'],
      ['Boissons sans alcool', '64', '692', '62.91', '629.09', '692.0', '629.09'],
      ['Divers 20%', '12', '700', '116.67', '583.33', '700.0', '583.33'],
      ['Pâtisserie & Chaud', '0', '0', '0', '0', '0.0', '0.0'],
    ])
    expect(deps.map((d) => d.taux)).toEqual([10, 20, 10, 20, null])
    const corr = Object.fromEntries(deps.map((d) => [d.cle, devinerColonne(d.libelle, d.taux)]))
    const parts = partsParTaux(deps, corr)
    expect(parts['10']).toEqual({ ca_food: 1934200, ca_bev_10: 69200 })
    expect(parts['20']).toEqual({ ca_bev_20: 824700, ca_autre: 70000 })
    const dest = Object.fromEntries(groupes.map((g) => [g.cle, 'salle']))
    const regl = Object.fromEntries(Object.entries(corr).map(([k, colonne]) => [k, { colonne }]))
    const cellules = construireCellules(groupes, dest, { '2026-10-24': deps }, regl)
    for (const c of cellules) {
      const g = groupes.filter((x) => x.service === c.service).reduce((s, x) => s + x.total, 0)
      expect(Math.round((c.ca_food + c.ca_bev_20 + c.ca_bev_10 + c.ca_autre) * 100)).toBe(g)
      expect(c.ca_bev_10).toBeGreaterThan(0)
    }
  })
})

describe('département rattaché à un lieu', () => {
  const { tickets } = lireTickets(ENTETE_TICKETS, [
    ticket('1', '2630.0', 'TVA 20%:263.33|TVA 10%:95.45', '8.0', 'Table de Partage', '24/10/26 11:58'),
    ticket('2', '5898.0', 'TVA 20%:275.67|TVA 10%:385.82', '27.0', 'Salle à Manger', '24/10/26 12:19'),
  ])
  const groupes = regrouperTickets(tickets)
  const dest = Object.fromEntries(groupes.map((g) => [g.cle, g.profil === 'Table de Partage' ? 'privat' : 'salle']))
  const deps = lireDepartements(ENTETE_DEPTS, [
    ['Cuisine', '', '', '', '', '4920.0', '4472.73'],
    ['Boissons sans alcool', '', '', '', '', '374.0', '340.0'],
    ['Boissons avec alcool', '', '', '', '', '2534.0', '2111.67'],
    ['Divers 20%', '', '', '', '', '700.0', '583.33'],
  ])
  const regl = {
    cuisine: { colonne: 'ca_food' },
    'boissons sans alcool': { colonne: 'ca_bev_10' },
    'boissons avec alcool': { colonne: 'ca_bev_20' },
    'divers 20%': { colonne: 'ca_autre', lieu: 'privat' },
  }

  it('met tout le Divers sur le lieu choisi, les totaux restent exacts', () => {
    const cellules = construireCellules(groupes, dest, { '2026-10-24': deps }, regl)
    const privat = cellules.find((c) => c.lieu_service_id === 'privat')!
    const salle = cellules.find((c) => c.lieu_service_id === 'salle')!
    expect(privat.ca_autre).toBe(700)
    expect(salle.ca_autre).toBe(0)
    expect(privat.ca_bev_20).toBe(880)
    expect(privat.ca_food + privat.ca_bev_20 + privat.ca_bev_10 + privat.ca_autre).toBeCloseTo(2630, 2)
    expect(salle.ca_food + salle.ca_bev_20 + salle.ca_bev_10 + salle.ca_autre).toBeCloseTo(5898, 2)
  })

  it('lieu absent ce jour-là : le département est réparti normalement', () => {
    const toutSalle = Object.fromEntries(groupes.map((g) => [g.cle, 'salle']))
    const cellules = construireCellules(groupes, toutSalle, { '2026-10-24': deps }, regl)
    expect(cellules.reduce((s, c) => s + c.ca_autre, 0)).toBeCloseTo(700, 2)
  })
})

describe('devinerColonne / devinerLieu', () => {
  it('classe les départements courants', () => {
    expect(devinerColonne('Boissons sans alcool', 10)).toBe('ca_bev_10')
    expect(devinerColonne('Cafétérie', 10)).toBe('ca_bev_10')
    expect(devinerColonne('Boissons avec alcool', 20)).toBe('ca_bev_20')
    expect(devinerColonne('Divers 20%', 20)).toBe('ca_autre')
    expect(devinerColonne('DIVERS 10 %', 10)).toBe('ca_food')
    expect(devinerColonne('Cuisine Chaud', 10)).toBe('ca_food')
  })
  it('propose le lieu de même nom', () => {
    const lieux = [{ id: 'a', nom: 'Salle à manger' }, { id: 'b', nom: 'Table du chef' }]
    expect(devinerLieu('Salle à Manger', lieux)).toBe('a')
    expect(devinerLieu('Table du chef', lieux)).toBe('b')
    expect(devinerLieu('Salon Privé', lieux)).toBeNull()
  })
})
