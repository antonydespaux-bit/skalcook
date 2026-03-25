'use client'
import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useRouter } from 'next/navigation'
import { theme, Logo, LogoBand } from '../lib/theme.jsx'

const SUPERADMIN_EMAILS = ['antony.despaux@hotmail.fr', 'antony@skalcook.com']

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()
  const c = theme.couleurs

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { data, error: errLogin } = await supabase.auth.signInWithPassword({
      email, password
    })

    if (errLogin) {
      setError('Email ou mot de passe incorrect')
      setLoading(false)
      return
    }

    // Redirection superadmin prioritaire : ne pas laisser la logique profil/role interférer.
    const loginEmail = (email || '').toLowerCase().trim()
    if (SUPERADMIN_EMAILS.includes(loginEmail)) {
      router.push('/superadmin')
      return
    }

    const { data: sessionData } = await supabase.auth.getSession()
    const user = sessionData?.session?.user

    // 1) Récupérer le profil juste après login
    const { data: profil } = await supabase
      .from('profils')
      .select('role, client_id')
      .eq('id', user?.id || data?.user?.id)
      .single()

    // 2) Pré-définir client_id pour éviter des undefined plus tard
    if (profil?.client_id) {
      try {
        localStorage.setItem('client_id', profil.client_id)
      } catch (e) {
        // no-op (localStorage peut être indisponible dans certains contextes)
      }
    }

    const role = profil?.role

    if (role === 'cuisine') {
      router.push('/dashboard')
    } else if (role === 'bar') {
      router.push('/bar/dashboard')
    } else {
      router.push('/choix')
    }
  }
  return (
    <div style={{
      minHeight: '100vh', background: c.fond,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '20px'
    }}>
      <div style={{ width: '100%', maxWidth: '380px' }}>

        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <LogoBand c={c} style={{ marginBottom: '16px' }}>
            <Logo height={32} couleur="white" />
          </LogoBand>
          <div style={{ fontSize: '13px', color: c.texteMuted, letterSpacing: '2px', textTransform: 'uppercase' }}>
            Gestion des fiches techniques
          </div>
        </div>

        <div style={{
          background: 'white', borderRadius: '16px', padding: '32px',
          border: `0.5px solid ${c.bordure}`,
          boxShadow: '0 4px 24px rgba(44, 24, 16, 0.06)'
        }}>
          <h2 style={{ fontSize: '18px', fontWeight: '500', color: c.texte, marginBottom: '24px', textAlign: 'center' }}>
            Connexion
          </h2>

          {error && (
            <div style={{
              background: '#FCEBEB', color: '#A32D2D', borderRadius: '8px',
              padding: '12px 14px', fontSize: '13px', marginBottom: '16px',
              border: '0.5px solid #F09595'
            }}>{error}</div>
          )}

          <form onSubmit={handleLogin}>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ fontSize: '12px', color: c.texteMuted, fontWeight: '500', display: 'block', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Email
              </label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="votre@email.com" required
                style={{
                  width: '100%', padding: '12px 14px', borderRadius: '8px',
                  border: `0.5px solid ${c.bordure}`, fontSize: '14px',
                  outline: 'none', color: c.texte, background: c.fond
                }}
              />
            </div>

            <div style={{ marginBottom: '8px' }}>
              <label style={{ fontSize: '12px', color: c.texteMuted, fontWeight: '500', display: 'block', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Mot de passe
              </label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                placeholder="••••••••" required
                style={{
                  width: '100%', padding: '12px 14px', borderRadius: '8px',
                  border: `0.5px solid ${c.bordure}`, fontSize: '14px',
                  outline: 'none', color: c.texte, background: c.fond
                }}
              />
            </div>

            <div style={{ textAlign: 'right', marginBottom: '20px' }}>
              <button
                type="button"
                onClick={() => router.push('/reset-password')}
                style={{
                  background: 'transparent', border: 'none',
                  fontSize: '12px', color: c.texteMuted,
                  cursor: 'pointer', textDecoration: 'underline', padding: 0
                }}>
                Mot de passe oublié ?
              </button>
            </div>

            <button type="submit" disabled={loading} style={{
              width: '100%', padding: '14px',
              background: loading ? c.texteMuted : c.principal,
              color: c.accent, border: 'none', borderRadius: '8px',
              fontSize: '14px', fontWeight: '600', cursor: loading ? 'not-allowed' : 'pointer',
              letterSpacing: '1px', textTransform: 'uppercase'
            }}>
              {loading ? 'Connexion...' : 'Se connecter'}
            </button>
          </form>
        </div>

        <div style={{ textAlign: 'center', marginTop: '20px', fontSize: '11px', color: c.texteMuted }}>
          Skalcook
        </div>
      </div>
    </div>
  )
}
