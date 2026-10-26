import { describe, it, expect } from 'vitest'
import { buildClientsRows, buildClientsWorkbook, estContactable } from '../crmExport'

const base = {
  id: 'c1', client_id: 'marsan', type: 'particulier', nom: 'Dupont', prenom: 'Jean', raison_sociale: null,
  email: 'jean@ex.fr', telephone: '0612345678', adresse: null, code_postal: '75001', ville: 'Paris', tags: ['fidèle'],
  source: 'thefork', langue: 'fr_FR', vip_thefork: false, contactable: true, desinscrit_at: null,
  prescripteur: false, rang: 'gold', preferences: 'Plats : Ris de veau', champs_thefork: { Entreprise: 'Acme', Allergique: false },
  created_at: '2026-10-26T10:00:00Z', visites: 6, visites_periode: 5, derniere_visite: '2026-10-01T19:00:00Z',
  prochaine_reservation: null, vip: true, perdu: false,
}

describe('export clients', () => {
  it('une ligne par client avec maison, statuts et champs TheFork', () => {
    const [r] = buildClientsRows([base], { marsan: 'MARSAN' })
    expect(r).toMatchObject({
      'Nom': 'Dupont', 'Maison': 'MARSAN', 'Contactable': 'Oui', 'VIP': 'Oui', 'À relancer': 'Non',
      'Visites (total)': 6, 'Dernière visite': '01/10/2026', 'TheFork · Entreprise': 'Acme', 'TheFork · Allergique': 'Non',
      'Source': 'TheFork', 'Tags': 'fidèle',
    })
  })

  it('un désinscrit ne sort jamais contactable, une entreprise oui', () => {
    expect(estContactable({ ...base, desinscrit_at: '2026-10-02T00:00:00Z' })).toBe(false)
    expect(estContactable({ ...base, contactable: false, type: 'entreprise' })).toBe(true)
    expect(estContactable({ ...base, contactable: false })).toBe(false)
  })

  it("aucune colonne d'allergies ni de notes", () => {
    const cles = Object.keys(buildClientsRows([{ ...base, notes: 'x', allergies: 'y' }], {})[0])
    expect(cles.some((k) => /allerg|note/i.test(k) && !k.startsWith('TheFork ·'))).toBe(false)
  })

  it('workbook : onglets Clients et Infos', () => {
    const wb = buildClientsWorkbook([base], { marsan: 'MARSAN' }, { filtres: 'Contactables' })
    expect(wb.SheetNames).toEqual(['Clients', 'Infos'])
  })
})
