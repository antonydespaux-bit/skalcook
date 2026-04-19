'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useRouter } from 'next/navigation'
import { theme, Logo } from '../../lib/theme.jsx'
import { Alert } from '../../components/ui'

export default function NouveauMotDePassePage() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [sessionReady, setSessionReady] = useState(false)
  const router = useRouter()

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      // Supabase envoie les tokens soit dans le hash (#access_token=…), soit
      // dans la query (?code=…) selon le flow configuré côté projet.
      // On gère les deux + une session déjà établie (au cas où un autre
      // composant aurait déjà consommé les tokens).
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''))
      const searchParams = new URLSearchParams(window.location.search)

      const rawErr = hashParams.get('error_description') || searchParams.get('error_description')
        || hashParams.get('error') || searchParams.get('error')
      if (rawErr) {
        const decoded = decodeURIComponent(rawErr).replace(/\+/g, ' ').toLowerCase()
        // Traduction des erreurs Supabase courantes pour déclencher le CTA
        // "Demander un nouveau lien" (le composant le cherche via le mot "expiré")
        let msg = 'Lien invalide ou expiré. Demandez un nouveau lien.'
        if (decoded.includes('expired') || decoded.includes('expir')) {
          msg = 'Lien invalide ou expiré. Demandez un nouveau lien.'
        } else if (decoded.includes('access_denied') || decoded.includes('access denied')) {
          msg = 'Accès refusé. Ce lien n\'est plus valide, demandez-en un nouveau.'
        } else {
          msg = decodeURIComponent(rawErr).replace(/\+/g, ' ')
        }
        if (!cancelled) setError(msg)
        return
      }

      const accessToken = hashParams.get('access_token')
      const refreshToken = hashParams.get('refresh_token')
      const code = searchParams.get('code')

      try {
        if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          })
          if (error) throw error
        } else if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code)
          if (error) throw error
        } else {
          // Pas de token dans l'URL — peut-être session déjà en cours ?
          const { data } = await supabase.auth.getSession()
          if (!data.session) {
            if (!cancelled) setError('Lien invalide ou expiré. Demandez un nouveau lien.')
            return
          }
        }
        if (!cancelled) setSessionReady(true)
      } catch (e) {
        if (!cancelled) setError(e?.message || 'Lien invalide ou expiré. Demandez un nouveau lien.')
      }
    })()
    return () => { cancelled = true }
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (password !== confirm) { setError('Les mots de passe ne correspondent pas'); return }
    if (password.length < 6) { setError('Le mot de passe doit faire au moins 6 caractères'); return }
    setLoading(true)
    setError('')

    const { error: errUpdate } = await supabase.auth.updateUser({ password })
    if (errUpdate) { setError('Erreur : ' + errUpdate.message); setLoading(false); return }

    setSuccess(true)
    setTimeout(() => router.push('/'), 2000)
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
              <div style={{ fontSize: '40px', marginBottom: '16px' }}>✅</div>
              <div style={{ fontSize: '16px', fontWeight: '500', color: theme.couleurs.texte, marginBottom: '8px' }}>Mot de passe mis à jour !</div>
              <div style={{ fontSize: '13px', color: theme.couleurs.texteMuted }}>Redirection en cours...</div>
            </div>
          ) : (
            <>
              <h2 style={{ fontSize: '18px', fontWeight: '500', color: theme.couleurs.texte, marginBottom: '24px', textAlign: 'center' }}>
                Nouveau mot de passe
              </h2>

              {error && (
                <Alert variant="error" style={{ marginBottom: '16px' }}>
                  {error}
                  {(/(expir|refus|invalid|nouveau)/i.test(error)) && (
                    <div style={{ marginTop: '8px' }}>
                      <span onClick={() => router.push('/reset-password')} style={{ color: '#A32D2D', cursor: 'pointer', fontWeight: '600', textDecoration: 'underline' }}>
                        Demander un nouveau lien →
                      </span>
                    </div>
                  )}
                </Alert>
              )}

              {sessionReady && (
                <form onSubmit={handleSubmit}>
                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ fontSize: '12px', color: theme.couleurs.texteMuted, fontWeight: '500', display: 'block', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      Nouveau mot de passe
                    </label>
                    <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                      placeholder="••••••••" required
                      style={{
                        width: '100%', padding: '12px 14px', borderRadius: '8px',
                        border: `0.5px solid ${theme.couleurs.bordure}`, fontSize: '14px',
                        outline: 'none', color: theme.couleurs.texte, background: theme.couleurs.fond
                      }}
                    />
                  </div>
                  <div style={{ marginBottom: '24px' }}>
                    <label style={{ fontSize: '12px', color: theme.couleurs.texteMuted, fontWeight: '500', display: 'block', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      Confirmer le mot de passe
                    </label>
                    <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
                      placeholder="••••••••" required
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
                    {loading ? 'Mise à jour...' : 'Définir le mot de passe'}
                  </button>
                </form>
              )}
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
