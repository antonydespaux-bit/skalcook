import { describe, it, expect } from 'vitest'
import {
  normEmail, normTelephone, choisirFiche, patchFusion, champsTheFork, fenetres,
  type CrmClientLigne,
} from '../services/theforkSync.service'
import type { TheForkCustomer } from '../services/thefork.service'

const tf = (p: Partial<TheForkCustomer> = {}): TheForkCustomer => ({
  customerUuid: 'tf-1',
  email: 'Jean.Dupont@Mail.fr ',
  firstName: 'Jean',
  lastName: 'Dupont',
  phone: '+33 6 12 34 56 78',
  locale: 'fr_FR',
  isVip: true,
  originRestaurantUuid: 'resto-1',
  originRestaurantName: 'MARSAN',
  optins: { restaurantNewsletter: true },
  allergiesAndIntolerances: 'Gluten',
  favFood: 'Ris de veau',
  favDrinks: null,
  ...p,
})

const fiche = (p: Partial<CrmClientLigne> = {}): CrmClientLigne => ({
  id: 'f-1', client_id: 'marsan', nom: null, prenom: null, email: null, telephone: null,
  adresse: null, code_postal: null, ville: null, thefork_customer_uuid: null, ...p,
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
  it("ne fusionne pas avec une fiche déjà liée à un autre client TheFork", () => {
    expect(choisirFiche([fiche({ email: 'jean.dupont@mail.fr', thefork_customer_uuid: 'tf-2' })], tf())).toBeNull()
  })
})

describe('fusion', () => {
  it('ne remplace jamais une identité saisie, complète les cases vides', () => {
    const patch = patchFusion(fiche({ nom: 'DUPONT (traiteur)', email: null }), tf())
    expect(patch.nom).toBeUndefined()
    expect(patch.email).toBe('Jean.Dupont@Mail.fr')
    expect(patch.prenom).toBe('Jean')
  })
  it('recopie toujours VIP, accord newsletter, langue, allergies, préférences', () => {
    expect(champsTheFork(tf())).toEqual({
      thefork_customer_uuid: 'tf-1',
      langue: 'fr_FR',
      vip_thefork: true,
      contactable: true,
      allergies: 'Gluten',
      preferences: 'Plats : Ris de veau',
    })
    expect(champsTheFork(tf({ optins: null, isVip: null })).contactable).toBe(false)
  })
})

describe('fenêtres de dates', () => {
  it('découpe en tranches incluses, la dernière tronquée', () => {
    expect(fenetres('2026-10-01', '2026-10-08', 3)).toEqual([
      ['2026-10-01', '2026-10-03'], ['2026-10-04', '2026-10-06'], ['2026-10-07', '2026-10-08'],
    ])
    expect(fenetres('2026-10-09', '2026-10-08', 3)).toEqual([])
  })
})
