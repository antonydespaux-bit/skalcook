'use client'
import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useRouter } from 'next/navigation'
import { theme, Logo } from '../lib/theme.jsx'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const c = theme.couleurs

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError('Email ou mot de passe incorrect')
      setLoading(false)
    } else {
      router.push('/fiches')
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: c.fond
    }}>
      <div style={{
        background: c.principal,
        borderRadius: '20px',
        padding: '48px 40px',
        width: '100%',
        maxWidth: '400px',
        border: `0.5px solid ${c.accent}`
      }}>
        <div style={{ textAlign: 'center', marginBottom: '36px' }}>
          <Logo height={50} couleur="white" />
          <div style={{
            width: '40px', height: '1px',
            background: c.accent,
            margin: '20px auto 16px'
          }} />
          <p style={{ fontSize: '12px', color: c.accent, letterSpacing: '3px', textTransform: 'uppercase' }}>
            Espace cuisine
          </p>
        </div>

        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ fontSize: '11px', color: c.accent, fontWeight: '500', display: 'block', marginBottom: '8px', letterSpacing: '2px', textTransform: 'uppercase' }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="votre@email.com"
              required
              style={{
                width: '100%', padding: '12px 14px',
                borderRadius: '8px',
                border: `0.5px solid ${c.accent}40`,
                background: 'rgba(255,255,255,0.05)',
                color: 'white',
                fontSize: '14px', outline: 'none'
              }}
            />
          </div>

          <div style={{ marginBottom: '28px' }}>
            <label style={{ fontSize: '11px', color: c.accent, fontWeight: '500', display: 'block', marginBottom: '8px', letterSpacing: '2px', textTransform: 'uppercase' }}>
              Mot de passe
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              style={{
                width: '100%', padding: '12px 14px',
                borderRadius: '8px',
                border: `0.5px solid ${c.accent}40`,
                background: 'rgba(255,255,255,0.05)',
                color: 'white',
                fontSize: '14px', outline: 'none'
              }}
            />
          </div>

          {error && (
            <div style={{
              background: '#FCEBEB', color: '#A32D2D',
              borderRadius: '8px', padding: '10px 14px',
              fontSize: '13px', marginBottom: '16px'
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%', padding: '14px',
              background: loading ? c.texteMuted : c.accent,
              color: c.principal,
              border: 'none', borderRadius: '8px',
              fontSize: '13px', fontWeight: '600',
              letterSpacing: '2px', textTransform: 'uppercase',
              cursor: loading ? 'not-allowed' : 'pointer'
            }}
          >
            {loading ? 'Connexion...' : 'Se connecter'}
          </button>
        </form>
      </div>
    </div>
  )
}