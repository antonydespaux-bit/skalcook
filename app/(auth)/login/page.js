'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../../../lib/supabase'
import { isSuperadminEmail } from '../../../lib/superadmin'
import { useRouter } from 'next/navigation'
import { theme, Logo, LogoBand } from '../../../lib/theme.jsx'

const inputStyle = (c) => ({
  width: '100%',
  padding: '12px 14px',
  borderRadius: '8px',
  border: `0.5px solid ${c.bordure}`,
  fontSize: '14px',
  outline: 'none',
  color: c.texte,
  background: c.fond,
})

export default function LoginPage() {
  const [isSignUp, setIsSignUp] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [nomRestaurant, setNomRestaurant] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const router = useRouter()
  const c = theme.couleurs

  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search)
      if (q.get('mode') === 'signup') setIsSignUp(true)
    } catch {
      // no-op
    }
  }, [])

  const redirectAfterAuth = async (loginEmail) => {
    const normalized = (loginEmail || '').toLowerCase().trim()
    if (isSuperadminEmail(normalized)) {
      router.push('/superadmin')
      return
    }

    const { data: sessionData } = await supabase.auth.getSession()
    const user = sessionData?.session?.user

    const { data: profil } = await supabase
      .from('profils')
      .select('role, client_id')
      .eq('id', user?.id)
      .single()

    const { data: acces } = await supabase
      .from('acces_clients')
      .select('client_id')
      .eq('user_id', user?.id)

    const accesValides = (acces || []).filter((r) => r?.client_id)

    if (accesValides && accesValides.length > 1) {
      try {
        localStorage.removeItem('client_id')
      } catch (e) {}
      router.push('/choix-etablissement')
      return
    }

    if (accesValides.length === 1) {
      try {
        localStorage.setItem('client_id', accesValides[0].client_id)
      } catch (e) {}
    } else if (profil?.client_id) {
      try {
        localStorage.setItem('client_id', profil.client_id)
      } catch (e) {}
    }

    const role = profil?.role

    if (role === 'cuisine') {
      router.push('/dashboard')
    } else if (role === 'bar') {
      router.push('/bar/dashboard')
    } else {
      router.push('/choix-etablissement')
    }
  }

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setInfo('')

    const { data, error: errLogin } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (errLogin) {
      setError('Email ou mot de passe incorrect')
      setLoading(false)
      return
    }

    const userId = data?.user?.id
    if (userId) {
      const { data: profilRow } = await supabase
        .from('profils')
        .select('client_id')
        .eq('id', userId)
        .maybeSingle()

      if (!profilRow?.client_id) {
        const nomMeta = data.user?.user_metadata?.nom_etablissement
        if (typeof nomMeta === 'string' && nomMeta.trim().length >= 2) {
          const { data: sess } = await supabase.auth.getSession()
          const token = sess?.session?.access_token
          if (token) {
            const res = await fetch('/api/complete-registration', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({ nom_etablissement: nomMeta.trim() }),
            })
            const json = await res.json().catch(() => ({}))
            if (!res.ok) {
              setError(json.error || 'Impossible de finaliser votre compte.')
              setLoading(false)
              return
            }
            if (json.client_id) {
              try {
                localStorage.setItem('client_id', json.client_id)
              } catch (e) {}
            }
          }
        }
      }
    }

    await redirectAfterAuth(email)
    setLoading(false)
  }

  const handleSignUp = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setInfo('')

    const nom = nomRestaurant.trim()
    if (nom.length < 2) {
      setError('Indiquez le nom de votre restaurant (au moins 2 caractères).')
      setLoading(false)
      return
    }
    if (password.length < 8) {
      setError('Le mot de passe doit contenir au moins 8 caractères.')
      setLoading(false)
      return
    }

    const { data, error: errSignUp } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { nom_etablissement: nom },
      },
    })

    if (errSignUp) {
      console.error('[login] signUp error', {
        message: errSignUp.message,
        status: errSignUp.status,
        name: errSignUp.name,
      })
      const msg = errSignUp.message || 'Inscription impossible'
      setError(/already|registered|exists|duplicate/i.test(msg) ? 'Un compte existe déjà avec cet email.' : msg)
      setLoading(false)
      return
    }

    // Session absente = confirmation d’email requise (comportement normal Supabase) : ne pas traiter comme un échec.
    if (!data?.session) {
      if (data?.user?.id) {
        setInfo(
          'Un email de confirmation vous a été envoyé. Validez le lien puis connectez-vous pour accéder au tableau de bord et au kit de démarrage.',
        )
      } else {
        console.warn('[login] signUp: pas de session ni user dans la réponse', data)
        setInfo(
          'Si un email de confirmation est configuré sur votre projet, vérifiez votre boîte mail. Sinon, essayez de vous connecter — votre compte peut déjà être actif.',
        )
      }
      setLoading(false)
      return
    }

    const token = data.session.access_token
    const res = await fetch('/api/complete-registration', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ nom_etablissement: nom }),
    })

    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      console.error('[login] complete-registration', res.status, json)
      setError(json.error || 'Finalisation du compte impossible. Contactez le support.')
      setLoading(false)
      return
    }

    if (json.client_id) {
      try {
        localStorage.setItem('client_id', json.client_id)
      } catch (e) {}
    }

    await redirectAfterAuth(email)
    setLoading(false)
  }

  const toggleMode = () => {
    setIsSignUp((v) => !v)
    setError('')
    setInfo('')
  }

  const labelStyle = {
    fontSize: '12px',
    color: c.texteMuted,
    fontWeight: '500',
    display: 'block',
    marginBottom: '6px',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: c.fond,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
    >
      <div style={{ width: '100%', maxWidth: isSignUp ? '420px' : '380px' }}>
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <LogoBand c={c} style={{ marginBottom: '16px' }}>
            <Logo height={32} couleur="white" />
          </LogoBand>
          <div
            style={{
              fontSize: '13px',
              color: c.texteMuted,
              letterSpacing: '2px',
              textTransform: 'uppercase',
            }}
          >
            Gestion des fiches techniques
          </div>
        </div>

        <div
          style={{
            background: c.blanc,
            borderRadius: '16px',
            padding: '32px',
            border: `0.5px solid ${c.bordure}`,
            boxShadow: '0 4px 24px rgba(44, 24, 16, 0.06)',
          }}
        >
          <h2
            style={{
              fontSize: '18px',
              fontWeight: '500',
              color: c.texte,
              marginBottom: '24px',
              textAlign: 'center',
            }}
          >
            {isSignUp ? 'Inscription' : 'Connexion'}
          </h2>

          {error && (
            <div
              style={{
                background: c.rougeClair,
                color: c.rouge,
                borderRadius: '8px',
                padding: '12px 14px',
                fontSize: '13px',
                marginBottom: '16px',
                border: `0.5px solid ${c.rouge}`,
              }}
            >
              {error}
            </div>
          )}

          {info && (
            <div
              style={{
                background: c.accentClair,
                color: c.texte,
                borderRadius: '8px',
                padding: '12px 14px',
                fontSize: '13px',
                marginBottom: '16px',
                border: `0.5px solid ${c.bordure}`,
              }}
            >
              {info}
            </div>
          )}

          <form onSubmit={isSignUp ? handleSignUp : handleLogin}>
            {isSignUp && (
              <div style={{ marginBottom: '16px' }}>
                <label style={labelStyle}>Nom du restaurant</label>
                <input
                  type="text"
                  value={nomRestaurant}
                  onChange={(e) => setNomRestaurant(e.target.value)}
                  placeholder="Ex. : Brasserie du Marché"
                  required
                  autoComplete="organization"
                  style={inputStyle(c)}
                />
              </div>
            )}

            <div style={{ marginBottom: '16px' }}>
              <label style={labelStyle}>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="votre@email.com"
                required
                autoComplete={isSignUp ? 'email' : 'username'}
                style={inputStyle(c)}
              />
            </div>

            <div style={{ marginBottom: '8px' }}>
              <label style={labelStyle}>Mot de passe</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={isSignUp ? 8 : undefined}
                autoComplete={isSignUp ? 'new-password' : 'current-password'}
                style={inputStyle(c)}
              />
            </div>

            {!isSignUp && (
              <div style={{ textAlign: 'right', marginBottom: '20px' }}>
                <button
                  type="button"
                  onClick={() => router.push('/reset-password')}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    fontSize: '12px',
                    color: c.texteMuted,
                    cursor: 'pointer',
                    textDecoration: 'underline',
                    padding: 0,
                  }}
                >
                  Mot de passe oublié ?
                </button>
              </div>
            )}

            {isSignUp && <div style={{ marginBottom: '20px' }} />}

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                padding: '14px',
                background: loading ? c.texteMuted : c.principal,
                color: c.accent,
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '600',
                cursor: loading ? 'not-allowed' : 'pointer',
                letterSpacing: '1px',
                textTransform: 'uppercase',
              }}
            >
              {loading
                ? isSignUp
                  ? 'Inscription...'
                  : 'Connexion...'
                : isSignUp
                  ? "S'inscrire gratuitement"
                  : 'Se connecter'}
            </button>

            {isSignUp && (
              <p
                style={{
                  marginTop: '14px',
                  marginBottom: 0,
                  fontSize: '12px',
                  color: c.texteMuted,
                  textAlign: 'center',
                  lineHeight: 1.45,
                }}
              >
                Essai gratuit : 5 fiches techniques offertes, sans carte bancaire.
              </p>
            )}
          </form>

          <div
            style={{
              marginTop: '22px',
              paddingTop: '20px',
              borderTop: `0.5px solid ${c.bordure}`,
              textAlign: 'center',
            }}
          >
            <button
              type="button"
              onClick={toggleMode}
              style={{
                background: 'transparent',
                border: 'none',
                fontSize: '13px',
                color: c.accent,
                cursor: 'pointer',
                textDecoration: 'underline',
                padding: 0,
                fontWeight: '500',
              }}
            >
              {isSignUp
                ? 'Déjà un compte ? Se connecter'
                : "Pas encore de compte ? S'inscrire gratuitement"}
            </button>
          </div>
        </div>

        <div style={{ textAlign: 'center', marginTop: '20px', fontSize: '11px', color: c.texteMuted }}>
          Skalcook
        </div>
      </div>
    </div>
  )
}
