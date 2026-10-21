import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../supabase', () => ({ supabase: { auth: { onAuthStateChange: vi.fn() } } }))

import { memoLecture, viderCacheLectures } from '../requeteCache'

describe('memoLecture', () => {
  beforeEach(() => viderCacheLectures())

  it('partage une seule requête entre les appels simultanés', async () => {
    const charger = vi.fn(async () => ({ data: { nom: 'JOIA' }, error: null }))
    const [a, b, c] = await Promise.all([
      memoLecture('branding:1', charger),
      memoLecture('branding:1', charger),
      memoLecture('branding:1', charger),
    ])
    expect(charger).toHaveBeenCalledTimes(1)
    expect(a).toBe(b)
    expect(c.data.nom).toBe('JOIA')
  })

  it('distingue les clés', async () => {
    const charger = vi.fn(async () => ({ data: 1, error: null }))
    await memoLecture('branding:1', charger)
    await memoLecture('branding:2', charger)
    expect(charger).toHaveBeenCalledTimes(2)
  })

  it('relit après expiration du TTL', async () => {
    vi.useFakeTimers()
    const charger = vi.fn(async () => ({ data: 1, error: null }))
    await memoLecture('role:u:c', charger, 1000)
    vi.advanceTimersByTime(1001)
    await memoLecture('role:u:c', charger, 1000)
    expect(charger).toHaveBeenCalledTimes(2)
    vi.useRealTimers()
  })

  it("ne garde pas une réponse en erreur ni une promesse rejetée", async () => {
    const enErreur = vi.fn(async () => ({ data: null, error: { message: 'timeout' } }))
    await memoLecture('profil:u', enErreur)
    await memoLecture('profil:u', enErreur)
    expect(enErreur).toHaveBeenCalledTimes(2)

    const rejet = vi.fn(async () => { throw new Error('réseau') })
    await expect(memoLecture('client:id:x', rejet)).rejects.toThrow('réseau')
    await expect(memoLecture('client:id:x', rejet)).rejects.toThrow('réseau')
    expect(rejet).toHaveBeenCalledTimes(2)
  })

  it('viderCacheLectures force une nouvelle lecture', async () => {
    const charger = vi.fn(async () => ({ data: 1, error: null }))
    await memoLecture('branding:1', charger)
    viderCacheLectures()
    await memoLecture('branding:1', charger)
    expect(charger).toHaveBeenCalledTimes(2)
  })
})
