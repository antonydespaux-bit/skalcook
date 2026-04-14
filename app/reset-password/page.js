'use client'
import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useRouter } from 'next/navigation'
import { theme, Logo } from '../../lib/theme.jsx'
import { useTheme } from '../../lib/useTheme'
import { Alert } from '../../components/ui'

export default function ResetPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()
  const { c } = useTheme()

  const handleReset = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const origin = (process.env.NEXT_PUBLIC_SITE_URL || window.location.origin).replace(/\/$/, '')
    const { error: errReset } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${origin}/nouveau-mot-de-passe`
    })

    if (errReset) {
      setError('Erreur : ' + errReset.message)
      setLoading(false)
      return
    }

    setSuccess(true)
    setLoading(false)
  }

  return (
    <div style={{
      minHeight: '100vh', background: theme.couleurs.fond,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'
    }}>
      <div style={{ width: '100%', maxWidth: '380px' }}>

        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <div style={{
            background: theme.couleurs.principal, borderRadius: '16px',
            padding: '24px', display: 'inline-flex',
            alignItems: 'center', justifyContent: 'center', marginBottom: '16px'
          }}>
            <Logo height={32} couleur="white" />
          </div>
        </div>

        <div style={{
          background: 'white', borderRadius: '16px', padding: '32px',
          border: `0.5px solid ${theme.couleurs.bordure}`,
          boxShadow: '0 4px 24px rgba(44, 24, 16, 0.06)'
        }}>
          {success ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '40px', marginBottom: '16px' }}>📧</div>
              <div style={{ fontSize: '16px', fontWeight: '500', color: theme.couleurs.texte, marginBottom: '8px' }}>Email envoyé !</div>
              <div style={{ fontSize: '13px', color: theme.couleurs.texteMuted, lineHeight: '1.6' }}>
                Vérifiez la boîte mail de <strong>{email}</strong> et cliquez sur le lien pour définir un nouveau mot de passe.
              </div>
            </div>
          ) : (
            <>
              <h2 style={{ fontSize: '18px', fontWeight: '500', color: theme.couleurs.texte, marginBottom: '8px', textAlign: 'center' }}>
                Réinitialiser le mot de passe
              </h2>
              <p style={{ fontSize: '13px', color: theme.couleurs.texteMuted, textAlign: 'center', marginBottom: '24px' }}>
                Entrez l'email du compte pour recevoir un lien de réinitialisation.
              </p>

              {error && (
                <Alert variant="error" style={{ marginBottom: '16px' }}>
                  {error}
                </Alert>
              )}

              <form onSubmit={handleReset}>
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ fontSize: '12px', color: theme.couleurs.texteMuted, fontWeight: '500', display: 'block', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Email
                  </label>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                    placeholder="jeremy@lafantaisie.com" required
                    style={{
                      width: '100%', padding: '12px 14px', borderRadius: '8px',
                      border: `0.5px solid ${theme.couleurs.bordure}`, fontSize: '14px',
                      outline: 'none', color: theme.couleurs.texte, background: theme.couleurs.fond
                    }}
                  />
                </div>
                <button type="submit" disabled={loading} style={{
                  width: '100%', padding: '14px',
                  background: loading ? theme.couleurs.texteMuted : theme.couleurs.principal,
                  color: theme.couleurs.accent, border: 'none', borderRadius: '8px',
                  fontSize: '14px', fontWeight: '600', cursor: loading ? 'not-allowed' : 'pointer'
                }}>
                  {loading ? 'Envoi...' : 'Envoyer le lien'}
                </button>
              </form>
            </>
          )}

          <button onClick={() => router.push('/')} style={{
            width: '100%', marginTop: '16px', background: 'transparent',
            color: theme.couleurs.texteMuted, border: 'none', fontSize: '13px',
            cursor: 'pointer', textDecoration: 'underline'
          }}>
            Retour à la connexion
          </button>
        </div>
      </div>
    </div>
  )
}
