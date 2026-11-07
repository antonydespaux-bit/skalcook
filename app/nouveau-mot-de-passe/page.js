'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useRouter } from 'next/navigation'
import { theme, Logo } from '../../lib/theme.jsx'
import { Alert } from '../../components/ui'
import { CGU_VERSION } from '../../lib/constants'

export default function NouveauMotDePassePage() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [sessionReady, setSessionReady] = useState(false)
  // Acceptation CGU : requise uniquement à la 1re activation (profil sans
  // cgu_accepted_at). Une simple réinitialisation de mot de passe ne la
  // redemande pas.
  const [needsCgu, setNeedsCgu] = useState(false)
  const [cguAccepted, setCguAccepted] = useState(false)
  // Lien au format ?token_hash=…&type=… : on ne consomme le jeton qu'au clic
  // sur « Continuer ». Les antivirus de messagerie (Microsoft Safe Links…)
  // ouvrent les liens reçus pour les contrôler : avec l'ancien lien direct
  // vers /auth/v1/verify, ils grillaient le jeton (usage unique) avant que
  // la personne clique, d'où « lien expiré ». Un robot ne clique pas.
  const [pendingVerify, setPendingVerify] = useState(null)
  const [verifying, setVerifying] = useState(false)
  const router = useRouter()

  // 1re activation (profil sans cgu_accepted_at) → case CGU obligatoire.
  // En cas d'échec de lecture, on demande l'acceptation par prudence.
  const chargerBesoinCgu = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: profil } = await supabase
        .from('profils').select('cgu_accepted_at').eq('id', user.id).maybeSingle()
      setNeedsCgu(!profil?.cgu_accepted_at)
    }
  }

  const handleContinuer = async () => {
    if (!pendingVerify) return
    setVerifying(true)
    setError('')
    const { error: errVerify } = await supabase.auth.verifyOtp({
      token_hash: pendingVerify.tokenHash,
      type: pendingVerify.type,
    })
    if (errVerify) {
      setError('Lien invalide ou expiré. Demandez un nouveau lien.')
      setPendingVerify(null)
      setVerifying(false)
      return
    }
    // Retire le jeton de l'URL (historique, partage d'écran…).
    window.history.replaceState(null, '', window.location.pathname)
    setPendingVerify(null)
    setVerifying(false)
    setSessionReady(true)
    await chargerBesoinCgu()
  }

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

      const tokenHash = searchParams.get('token_hash')
      if (tokenHash) {
        const type = searchParams.get('type')
        const TYPES = ['recovery', 'invite', 'signup', 'email', 'magiclink']
        if (!cancelled) setPendingVerify({ tokenHash, type: TYPES.includes(type) ? type : 'recovery' })
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
        if (cancelled) return
        setSessionReady(true)
        await chargerBesoinCgu()
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
    if (needsCgu && !cguAccepted) { setError('Vous devez accepter les CGU et la politique de confidentialité pour activer votre compte.'); return }
    setLoading(true)
    setError('')

    const { error: errUpdate } = await supabase.auth.updateUser({ password })
    if (errUpdate) { setError('Erreur : ' + errUpdate.message); setLoading(false); return }

    // Traçabilité de l'acceptation (date + version). Best-effort : on ne bloque
    // pas l'activation si l'écriture échoue, le mot de passe est déjà posé.
    if (needsCgu) {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        await supabase.from('profils')
          .update({ cgu_accepted_at: new Date().toISOString(), cgu_version: CGU_VERSION })
          .eq('id', user.id)
      }
    }

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

              {pendingVerify && !sessionReady && (
                <div style={{ textAlign: 'center' }}>
                  <p style={{ fontSize: '14px', color: theme.couleurs.texteMuted, marginBottom: '20px', lineHeight: '1.5' }}>
                    {pendingVerify.type === 'invite'
                      ? 'Bienvenue ! Cliquez sur « Continuer » pour activer votre compte et choisir votre mot de passe.'
                      : 'Cliquez sur « Continuer » pour choisir votre nouveau mot de passe.'}
                  </p>
                  <button type="button" onClick={handleContinuer} disabled={verifying} style={{
                    width: '100%', padding: '14px',
                    background: verifying ? theme.couleurs.texteMuted : theme.couleurs.principal,
                    color: theme.couleurs.accent, border: 'none', borderRadius: '8px',
                    fontSize: '14px', fontWeight: '600', cursor: verifying ? 'not-allowed' : 'pointer'
                  }}>
                    {verifying ? 'Vérification...' : 'Continuer'}
                  </button>
                </div>
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
                  {needsCgu && (
                    <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '20px', cursor: 'pointer' }}>
                      <input type="checkbox" checked={cguAccepted} onChange={e => setCguAccepted(e.target.checked)}
                        style={{ marginTop: '2px', width: '16px', height: '16px', flexShrink: 0, cursor: 'pointer', accentColor: theme.couleurs.principal }}
                      />
                      <span style={{ fontSize: '13px', color: theme.couleurs.texteMuted, lineHeight: '1.5' }}>
                        J&apos;accepte les{' '}
                        <a href="/cgu" target="_blank" rel="noopener noreferrer" style={{ color: theme.couleurs.principal, fontWeight: '500' }}>
                          Conditions Générales d&apos;Utilisation
                        </a>{' '}et la{' '}
                        <a href="/politique-confidentialite" target="_blank" rel="noopener noreferrer" style={{ color: theme.couleurs.principal, fontWeight: '500' }}>
                          Politique de confidentialité
                        </a>.
                      </span>
                    </label>
                  )}

                  <button type="submit" disabled={loading || (needsCgu && !cguAccepted)} style={{
                    width: '100%', padding: '14px',
                    background: (loading || (needsCgu && !cguAccepted)) ? theme.couleurs.texteMuted : theme.couleurs.principal,
                    color: theme.couleurs.accent, border: 'none', borderRadius: '8px',
                    fontSize: '14px', fontWeight: '600', cursor: (loading || (needsCgu && !cguAccepted)) ? 'not-allowed' : 'pointer'
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
