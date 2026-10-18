import { describe, it, expect, vi } from 'vitest'

vi.mock('../dashboardPreferences', () => ({ loadLayoutForPage: vi.fn(), persistLayoutForPage: vi.fn() }))

import { reconcileBlocsGroupe, BLOCS_GROUPE } from '../groupePreferences'

describe('reconcileBlocsGroupe', () => {
  it('tout visible par défaut', () => {
    expect(reconcileBlocsGroupe(null)).toEqual({ blocs: Object.fromEntries(BLOCS_GROUPE.map((id) => [id, true])) })
  })
  it('garde les choix connus et ignore les inconnus', () => {
    const r = reconcileBlocsGroupe({ blocs: { prix: false, inconnu: false } })
    expect(r.blocs).toEqual({ indicateurs: true, synthese: true, prix: false, fournisseurs: true })
  })
  it('ne laisse jamais la page vide', () => {
    const r = reconcileBlocsGroupe({ blocs: { indicateurs: false, synthese: false, prix: false, fournisseurs: false } })
    expect(Object.values(r.blocs).every(Boolean)).toBe(true)
  })
})
