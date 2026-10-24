import { describe, it, expect } from 'vitest'
import { statsVisites } from '../crmVisites'

const maintenant = new Date('2026-10-24T12:00:00Z')
const resa = (date_repas: string, statut = 'RECORDED') => ({ date_repas, statut })

describe('statsVisites', () => {
  it('compte les repas passés non annulés', () => {
    const s = statsVisites([
      resa('2026-10-01T19:00:00Z'),
      resa('2026-09-01T19:00:00Z', 'CANCELED'),
      resa('2026-08-01T19:00:00Z', 'NO_SHOW'),
      resa('2026-11-01T19:00:00Z'),
    ], {}, false, maintenant)
    expect(s.visites).toBe(1)
    expect(s.aVenir).toBe(1)
    expect(s.derniereVisite?.toISOString()).toBe('2026-10-01T19:00:00.000Z')
  })

  it('VIP au-delà du seuil sur la période, ou si TheFork le dit', () => {
    const cinq = ['01', '02', '03', '04', '05'].map((m) => resa(`2026-${m}-15T19:00:00Z`))
    expect(statsVisites(cinq, {}, false, maintenant).vip).toBe(true)
    expect(statsVisites(cinq.slice(0, 4), {}, false, maintenant).vip).toBe(false)
    expect(statsVisites(cinq.slice(0, 4), { vipVisites: 4 }, false, maintenant).vip).toBe(true)
    expect(statsVisites([], {}, true, maintenant).vip).toBe(true)
  })

  it('perdu : venu, plus revenu depuis 6 mois, rien de réservé', () => {
    expect(statsVisites([resa('2026-03-01T19:00:00Z')], {}, false, maintenant).perdu).toBe(true)
    expect(statsVisites([resa('2026-06-01T19:00:00Z')], {}, false, maintenant).perdu).toBe(false)
    expect(statsVisites([resa('2026-03-01T19:00:00Z'), resa('2026-12-01T19:00:00Z')], {}, false, maintenant).perdu).toBe(false)
    expect(statsVisites([], {}, false, maintenant).perdu).toBe(false)
  })
})
