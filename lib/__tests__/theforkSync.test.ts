import { describe, it, expect } from 'vitest'
import {
  normEmail, normTelephone, choisirFiche, patchFusion, champsTheFork, contactable,
  nouvelleFiche, ligneReservation, type CrmClientLigne,
} from '../services/theforkSync.service'
import type { TheForkCustomer, TheForkReservation } from '../services/thefork.service'

const maintenant = new Date('2026-10-26T03:00:00Z')

const tf = (p: Partial<TheForkCustomer> = {}): TheForkCustomer => ({
  customerUuid: 'tf-1',
  email: 'Jean.Dupont@Mail.fr ',
  firstName: 'Jean',
  lastName: 'Dupont',
  phone: '+33 6 12 34 56 78',
  locale: 'fr_FR',
  civility: 'mr',
  rank: 'gold',
  isVip: true,
  isPromoter: false,
  originRestaurantUuid: 'resto-1',
  originRestaurantName: 'MARSAN',
  optins: { restaurantNewsletter: true },
  favFood: 'Ris de veau',
  favDrinks: null,
  customFields: [
    { labelUuid: 'l1', label: 'Entreprise', type: 'string', value: 'Acme', valueUuid: null },
    { labelUuid: 'l2', label: 'Vide', type: 'string', value: '', valueUuid: null },
  ],
  ...p,
})

const fiche = (p: Partial<CrmClientLigne> = {}): CrmClientLigne => ({
  id: 'f-1', client_id: 'marsan', type: 'particulier', source: null, nom: null, prenom: null, raison_sociale: null,
  email: null, telephone: null, adresse: null, code_postal: null, ville: null,
  thefork_customer_uuid: null, desinscrit_at: null, ...p,
})

describe('normalisation', () => {
  it('e-mail en minuscules sans espaces', () => {
    expect(normEmail(' Jean.Dupont@Mail.fr ')).toBe('jean.dupont@mail.fr')
    expect(normEmail('')).toBeNull()
  })
  it('téléphone : formats français et international donnent la même clé', () => {
    expect(normTelephone('+33 6 12 34 56 78')).toBe('612345678')
    expect(normTelephone('06.12.34.56.78')).toBe('612345678')
    expect(normTelephone(null)).toBeNull()
  })
})

describe('choix de la fiche à fusionner', () => {
  it("l'identifiant TheFork prime", () => {
    const a = fiche({ id: 'a', email: 'jean.dupont@mail.fr' })
    const b = fiche({ id: 'b', thefork_customer_uuid: 'tf-1' })
    expect(choisirFiche([a, b], tf())?.id).toBe('b')
  })
  it("puis l'e-mail, puis le téléphone", () => {
    expect(choisirFiche([fiche({ id: 'e', email: 'JEAN.dupont@mail.fr' })], tf())?.id).toBe('e')
    expect(choisirFiche([fiche({ id: 't', telephone: '06 12 34 56 78' })], tf())?.id).toBe('t')
  })
  it('ne fusionne pas avec une fiche déjà liée à un autre client TheFork', () => {
    expect(choisirFiche([fiche({ email: 'jean.dupont@mail.fr', thefork_customer_uuid: 'tf-2' })], tf())).toBeNull()
  })
})

describe('champs importés', () => {
  it('VIP, prescripteur, rang, préférences, champs personnalisés non vides', () => {
    const c = champsTheFork(tf({ isPromoter: true, favSeating: 'Terrasse' }), maintenant)
    expect(c).toMatchObject({
      thefork_customer_uuid: 'tf-1', langue: 'fr_FR', vip_thefork: true, prescripteur: true, rang: 'gold',
      champs_thefork: { Entreprise: 'Acme' },
      preferences: 'Plats : Ris de veau · Table : Terrasse',
      thefork_verifie_at: '2026-10-26T03:00:00.000Z',
    })
  })
  it("n'importe ni allergies, ni régime, ni notes, ni niveau de risque", () => {
    const c = champsTheFork({ ...tf(), allergiesAndIntolerances: ['gluten'], dietaryRestrictions: ['vegan'], notes: 'x', riskLevel: ['high'] } as TheForkCustomer)
    const json = JSON.stringify(c)
    expect(json).not.toMatch(/gluten|vegan|high/)
    expect(Object.keys(c)).not.toContain('allergies')
  })
  it("une entreprise TheFork devient une fiche entreprise", () => {
    const f = nouvelleFiche(tf({ civility: 'company', lastName: 'Acme SAS', firstName: null }), 'marsan', maintenant)
    expect(f).toMatchObject({ type: 'entreprise', raison_sociale: 'Acme SAS', source: 'thefork', client_id: 'marsan' })
  })
})

describe('consentement', () => {
  it("contactable seulement avec l'opt-in newsletter", () => {
    expect(contactable(tf())).toBe(true)
    expect(contactable(tf({ optins: { restaurantNewsletter: false } }))).toBe(false)
    expect(contactable(tf({ optins: null }))).toBe(false)
  })
  it('une désinscription faite dans skalcook ne repasse jamais à contactable', () => {
    const patch = patchFusion(fiche({ thefork_customer_uuid: 'tf-1', desinscrit_at: '2026-10-01T00:00:00Z' }), tf(), maintenant)
    expect(patch.contactable).toBe(false)
  })
})

describe('fusion', () => {
  it('ne remplace jamais une identité saisie, complète les cases vides', () => {
    const patch = patchFusion(fiche({ nom: 'DUPONT (traiteur)', email: null }), tf(), maintenant)
    expect(patch.nom).toBeUndefined()
    expect(patch.email).toBe('Jean.Dupont@Mail.fr')
    expect(patch.prenom).toBe('Jean')
  })
  it("ne change pas le type d'une fiche saisie à la main", () => {
    expect(patchFusion(fiche({ source: null }), tf({ civility: 'company' }), maintenant).type).toBeUndefined()
    expect(patchFusion(fiche({ source: 'thefork' }), tf({ civility: 'company' }), maintenant).type).toBe('entreprise')
  })
})

describe('réservations', () => {
  it('ne recopie pas la note libre du client', () => {
    const r: TheForkReservation = {
      reservationUuid: 'r-1', restaurantUuid: 'resto-1', customerUuid: 'tf-1', mealDate: '2026-10-30T19:00:00Z',
      partySize: 12, status: 'RECORDED', reservationChannel: 'Booking Module', billAmount: null, customerNote: 'allergie arachide',
    }
    expect(ligneReservation(r, 'marsan', 'f-1')).toMatchObject({ couverts: 12, note_client: null, externe_id: 'r-1', client_id: 'marsan' })
  })
})
