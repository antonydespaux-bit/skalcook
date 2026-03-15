'use client'
import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useRouter } from 'next/navigation'
import { theme, Logo } from '../../lib/theme.jsx'

export default function InscriptionPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [nom, setNom] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const router = useRouter()

  const handleInscription = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { data, error: errSignup } = await supabase.auth.signUp({
      email, password,
      options: { data: { nom } }
    })

    if (errSignup) { setError('Erreur : ' + errSignup.message); setLoading(false); return }

    // Créer le profil avec rôle cuisine
    if (data.user) {
      await supabase.from('profils').upsert({
        id: data.user.id,
        email,
        nom,
        role: 'cuisine'
      })
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
              <div style={{ fontSize: '40px', marginBottom: '16px' }}>✅</div>
              <div style={{ fontSize: '16px', fontWeight: '500', color: theme.couleurs.texte, marginBottom: '8px' }}>
                Compte créé !
              </div>
              <div style={{ fontSize: '13px', color: theme.couleurs.texteMuted, marginBottom: '20px' }}>
                Vous pouvez maintenant vous connecter.
              </div>
              <button onClick={() => router.push('/')} style={{
                width: '100%', padding: '14px',
                background: theme.couleurs.principal,
                color: theme.couleurs.accent, border: 'none', borderRadius: '8px',
                fontSize: '14px', fontWeight: '600', cursor: 'pointer'
              }}>Se connecter</button>
            </div>
          ) : (
            <>
              <h2 style={{ fontSize: '18px', fontWeight: '500', color: theme.couleurs.texte, marginBottom: '24px', textAlign: 'center' }}>
                Créer un compte
              </h2>

              {error && (
                <div style={{ background: '#FCEBEB', color: '#A32D2D', borderRadius: '8px', padding: '12px 14px', fontSize: '13px', marginBottom: '16px' }}>
                  {error}
                </div>
              )}

              <form onSubmit={handleInscription}>
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ fontSize: '12px', color: theme.couleurs.texteMuted, fontWeight: '500', display: 'block', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Prénom</label>
                  <input type="text" value={nom} onChange={e => setNom(e.target.value)}
                    placeholder="Jérémy" required
                    style={{ width: '100%', padding: '12px 14px', borderRadius: '8px', border: `0.5px solid ${theme.couleurs.bordure}`, fontSize: '14px', outline: 'none', color: theme.couleurs.texte, background: theme.couleurs.fond }}
                  />
                </div>
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ fontSize: '12px', color: theme.couleurs.texteMuted, fontWeight: '500', display: 'block', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Email</label>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                    placeholder="jeremy@lafantaisie.com" required
                    style={{ width: '100%', padding: '12px 14px', borderRadius: '8px', border: `0.5px solid ${theme.couleurs.bordure}`, fontSize: '14px', outline: 'none', color: theme.couleurs.texte, background: theme.couleurs.fond }}
                  />
                </div>
                <div style={{ marginBottom: '24px' }}>
                  <label style={{ fontSize: '12px', color: theme.couleurs.texteMuted, fontWeight: '500', display: 'block', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Mot de passe</label>
                  <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••" required
                    style={{ width: '100%', padding: '12px 14px', borderRadius: '8px', border: `0.5px solid ${theme.couleurs.bordure}`, fontSize: '14px', outline: 'none', color: theme.couleurs.texte, background: theme.couleurs.fond }}
                  />
                </div>
                <button type="submit" disabled={loading} style={{
                  width: '100%', padding: '14px',
                  background: loading ? theme.couleurs.texteMuted : theme.couleurs.principal,
                  color: theme.couleurs.accent, border: 'none', borderRadius: '8px',
                  fontSize: '14px', fontWeight: '600', cursor: loading ? 'not-allowed' : 'pointer'
                }}>
                  {loading ? 'Création...' : 'Créer le compte'}
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
