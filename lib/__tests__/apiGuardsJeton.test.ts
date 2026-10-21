import { describe, it, expect, vi, beforeEach } from 'vitest'

const getClaims = vi.fn()
const getUser = vi.fn()
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth: { getClaims, getUser } }),
}))

import { utilisateurDuJeton, requireAuthenticated } from '../apiGuards'

const requete = (auth?: string) => new Request('https://x.test/api', { headers: auth ? { Authorization: auth } : {} })

describe('utilisateurDuJeton', () => {
  beforeEach(() => { getClaims.mockReset(); getUser.mockReset() })

  it("renvoie l'utilisateur d'un jeton valide, sans appeler /auth/v1/user", async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: 'u1', email: 'a@b.fr', role: 'authenticated', user_metadata: { nom: 'Antony' } } }, error: null })
    expect(await utilisateurDuJeton('jwt')).toEqual({ id: 'u1', email: 'a@b.fr', user_metadata: { nom: 'Antony' } })
    expect(getClaims).toHaveBeenCalledWith('jwt')
    expect(getUser).not.toHaveBeenCalled()
  })

  it('refuse un jeton invalide ou expiré', async () => {
    getClaims.mockResolvedValue({ data: null, error: { message: 'JWT expired' } })
    expect(await utilisateurDuJeton('jwt')).toBeNull()
  })

  it('refuse la clé anonyme (pas un utilisateur connecté)', async () => {
    getClaims.mockResolvedValue({ data: { claims: { role: 'anon' } }, error: null })
    expect(await utilisateurDuJeton('jwt')).toBeNull()
  })

  it('refuse si la vérification plante', async () => {
    getClaims.mockRejectedValue(new Error('réseau'))
    expect(await utilisateurDuJeton('jwt')).toBeNull()
  })
})

describe('requireAuthenticated', () => {
  beforeEach(() => getClaims.mockReset())

  it('401 sans en-tête Bearer', async () => {
    const r = await requireAuthenticated(requete())
    expect(r.response?.status).toBe(401)
  })

  it('401 sur jeton refusé', async () => {
    getClaims.mockResolvedValue({ data: null, error: { message: 'invalid' } })
    const r = await requireAuthenticated(requete('Bearer abc'))
    expect(r.response?.status).toBe(401)
  })

  it("laisse passer un jeton valide", async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: 'u1', email: 'a@b.fr', role: 'authenticated' } }, error: null })
    const r = await requireAuthenticated(requete('Bearer abc'))
    expect(r.response).toBeUndefined()
    expect(r.user?.id).toBe('u1')
  })
})
