'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useRouter } from 'next/navigation'
import { theme, Logo } from '../../lib/theme.jsx'
import { useIsMobile } from '../../lib/useIsMobile'
import { useTheme } from '../../lib/useTheme'
import { useRole } from '../../lib/useRole'

export default function AdminPage() {
  const [profils, setProfils] = useState([])
  const [loading, setLoading] = useState(true)
  const [newEmail, setNewEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newNom, setNewNom] = useState('')
  const [newRole, setNewRole] = useState('cuisine')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const router = useRouter()
  const { c } = useTheme()
  const isMobile = useIsMobile()
  const { role, loading: roleLoading } = useRole()

  useEffect(() => {
    if (!roleLoading && role !== 'admin') {
      router.push('/dashboard')
    }
  }, [role, roleLoading])

  useEffect(() => {
    loadProfils()
  }, [])

  const loadProfils = async () => {
    const { data } = await supabase
      .from('profils')
      .select('*')
      .order('created_at')
    setProfils(data || [])
    setLoading(false)
  }

  const creerUtilisateur = async () => {
    if (!newEmail || !newPassword || !newNom) {
      setError('Tous les champs sont obligatoires')
      return
    }
    setCreating(true)
    setError('')
    setSuccess('')

    const { data, error: errCreate } = await supabase.auth.admin.createUser({
      email: newEmail,
      password: newPassword,
      email_confirm: true
    })

    if (errCreate) {
      setError('Erreur : ' + errCreate.message)
      setCreating(false)
      return
    }

    await supabase.from('profils').update({
      role: newRole,
      nom: newNom
    }).eq('id', data.user.id)

    setNewEmail('')
    setNewPassword('')
    setNewNom('')
    setNewRole('cuisine')
    setSuccess(`Compte créé pour ${newNom} !`)
    await loadProfils()
    setCreating(false)
  }

  const changerRole = async (id, newRole) => {
    await supabase.from('profils').update({ role: newRole }).eq('id', id)
    await loadProfils()
  }

  const roleLabel = (role) => {
    switch (role) {
      case 'admin': return { label: 'Administrateur', color: '#2C1810', bg: '#F0E8E0' }
      case 'cuisine': return { label: 'Cuisine', color: '#3B6D11', bg: '#EAF3DE' }
      case 'bar': return { label: 'Bar', color: '#3C3489', bg: '#EEEDFE' }
      case 'directeur': return { label: 'Directeur', color: '#854F0B', bg: '#FAEEDA' }
      default: return { label: 'Non défini', color: '#8B7355', bg: '#FAF9F6' }
    }
  }

  if (roleLoading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: c.fond }}>
      <div style={{ fontSize: '14px', color: c.texteMuted }}>Chargement...</div>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: c.fond }}>

      <div style={{
        background: c.principal, borderBottom: `0.5px solid ${c.accent}40`,
        padding: '0 16px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', height: '56px',
        position: 'sticky', top: 0, zIndex: 100
      }}>
        <Logo height={28} couleur="white" onClick={() => router.push('/dashboard')} />
        <button onClick={() => router.push('/dashboard')} style={{
          background: 'transparent', color: 'rgba(255,255,255,0.7)',
          border: '0.5px solid rgba(255,255,255,0.2)',
          borderRadius: '8px', padding: '8px 12px', fontSize: '13px', cursor: 'pointer'
        }}>← {!isMobile && 'Retour'}</button>
      </div>

      <div style={{ padding: isMobile ? '12px' : '24px', maxWidth: '800px', margin: '0 auto' }}>

        {/* Créer un utilisateur */}
        <div style={{
          background: c.blanc, borderRadius: '12px', padding: isMobile ? '16px' : '24px',
          border: `0.5px solid ${c.bordure}`, marginBottom: '20px'
        }}>
          <div style={{ fontSize: '13px', fontWeight: '500', color: c.texteMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '16px' }}>
            Créer un compte utilisateur
          </div>

          {error && (
            <div style={{ background: '#FCEBEB', color: '#A32D2D', borderRadius: '8px', padding: '12px', fontSize: '13px', marginBottom: '12px', border: '0.5px solid #F09595' }}>
              {error}
            </div>
          )}

          {success && (
            <div style={{ background: '#EAF3DE', color: '#3B6D11', borderRadius: '8px', padding: '12px', fontSize: '13px', marginBottom: '12px', border: '0.5px solid #4A7B6F40' }}>
              ✓ {success}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '12px', color: c.texteMuted, fontWeight: '500', display: 'block', marginBottom: '6px' }}>Nom *</label>
                <input type="text" value={newNom} onChange={e => setNewNom(e.target.value)}
                  placeholder="Ex : Marie Dupont"
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, fontSize: '14px', outline: 'none', color: c.texte, background: c.blanc }}
                />
              </div>
              <div>
                <label style={{ fontSize: '12px', color: c.texteMuted, fontWeight: '500', display: 'block', marginBottom: '6px' }}>Rôle *</label>
                <select value={newRole} onChange={e => setNewRole(e.target.value)} style={{
                  width: '100%', padding: '10px 12px', borderRadius: '8px',
                  border: `0.5px solid ${c.bordure}`, fontSize: '14px',
                  background: c.blanc, outline: 'none', color: c.texte
                }}>
                  <option value="cuisine">Cuisine</option>
                  <option value="bar">Bar</option>
                  <option value="directeur">Directeur de zone</option>
                  <option value="admin">Administrateur</option>
                </select>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '12px', color: c.texteMuted, fontWeight: '500', display: 'block', marginBottom: '6px' }}>Email *</label>
                <input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)}
                  placeholder="marie@lafantaisie.com"
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, fontSize: '14px', outline: 'none', color: c.texte, background: c.blanc }}
                />
              </div>
              <div>
                <label style={{ fontSize: '12px', color: c.texteMuted, fontWeight: '500', display: 'block', marginBottom: '6px' }}>Mot de passe *</label>
                <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)}
                  placeholder="Minimum 6 caractères"
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, fontSize: '14px', outline: 'none', color: c.texte, background: c.blanc }}
                />
              </div>
            </div>

            {/* Info rôle */}
            <div style={{ background: c.fond, borderRadius: '8px', padding: '12px', fontSize: '12px', color: c.texteMuted, border: `0.5px solid ${c.bordure}` }}>
              {newRole === 'cuisine' && '👨‍🍳 Accès complet à la section Cuisine — peut créer, modifier et supprimer des fiches'}
              {newRole === 'bar' && '🍸 Accès complet à la section Bar — peut créer, modifier et supprimer des fiches bar'}
              {newRole === 'directeur' && '👔 Accès en lecture seule sur Cuisine + Bar — peut voir et exporter mais pas modifier'}
              {newRole === 'admin' && '⚙️ Accès complet sur tout — Cuisine, Bar, paramètres et gestion des utilisateurs'}
            </div>

            <button onClick={creerUtilisateur} disabled={creating} style={{
              width: '100%', padding: '12px', background: creating ? c.texteMuted : c.accent,
              color: c.principal, border: 'none', borderRadius: '8px',
              fontSize: '13px', fontWeight: '600', cursor: creating ? 'not-allowed' : 'pointer'
            }}>
              {creating ? 'Création en cours...' : 'Créer le compte'}
            </button>
          </div>
        </div>

        {/* Liste des utilisateurs */}
        <div style={{
          background: c.blanc, borderRadius: '12px',
          border: `0.5px solid ${c.bordure}`, overflow: 'hidden'
        }}>
          <div style={{ padding: '16px 20px', borderBottom: `0.5px solid ${c.bordure}` }}>
            <div style={{ fontSize: '13px', fontWeight: '500', color: c.texte }}>
              Utilisateurs ({profils.length})
            </div>
          </div>

          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: c.texteMuted }}>Chargement...</div>
          ) : (
            profils.map((profil, i) => {
              const r = roleLabel(profil.role)
              return (
                <div key={profil.id} style={{
                  padding: '14px 20px',
                  borderBottom: i < profils.length - 1 ? `0.5px solid ${c.bordure}` : 'none',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  flexWrap: 'wrap', gap: '10px'
                }}>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: '500', color: c.texte }}>
                      {profil.nom || '—'}
                    </div>
                    <div style={{ fontSize: '12px', color: c.texteMuted, marginTop: '2px' }}>
                      {profil.email}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{
                      background: r.bg, color: r.color,
                      borderRadius: '20px', padding: '4px 12px',
                      fontSize: '12px', fontWeight: '500'
                    }}>{r.label}</span>
                    <select
                      value={profil.role || ''}
                      onChange={e => changerRole(profil.id, e.target.value)}
                      style={{
                        padding: '6px 10px', borderRadius: '8px',
                        border: `0.5px solid ${c.bordure}`, fontSize: '12px',
                        background: c.blanc, outline: 'none', color: c.texte, cursor: 'pointer'
                      }}
                    >
                      <option value="">-- Rôle --</option>
                      <option value="cuisine">Cuisine</option>
                      <option value="bar">Bar</option>
                      <option value="directeur">Directeur</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
