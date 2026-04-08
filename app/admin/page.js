'use client'
export const dynamic = 'force-dynamic'
import { useState, useEffect } from 'react'
import { supabase, getClientId } from '../../lib/supabase'
import { useRouter } from 'next/navigation'
import { useIsMobile } from '../../lib/useIsMobile'
import { useTheme } from '../../lib/useTheme'
import { useRole } from '../../lib/useRole'
import { isSuperadminEmail } from '../../lib/superadmin'
import Navbar from '../../components/Navbar'
import ChefLoader from '../../components/ChefLoader'

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
  const [isSuperadmin, setIsSuperadmin] = useState(false)
  const [editingNomId, setEditingNomId] = useState(null)
  const [editNomValue, setEditNomValue] = useState('')
  const [savingNom, setSavingNom] = useState(false)
  const router = useRouter()
  const { c } = useTheme()
  const isMobile = useIsMobile()
  const { role, loading: roleLoading } = useRole()

  useEffect(() => {
    if (!roleLoading && role !== 'admin' && !isSuperadmin) router.push('/dashboard')
  }, [role, roleLoading, isSuperadmin])

  useEffect(() => {
    checkSuperadmin()
    loadProfils()
  }, [])

  const checkSuperadmin = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const email = (user?.email || '').toLowerCase().trim()
      setIsSuperadmin(isSuperadminEmail(email))
    } catch {
      setIsSuperadmin(false)
    }
  }

  const loadProfils = async () => {
    try {
      const clientId = await getClientId()
      if (!clientId) {
        setProfils([])
        return
      }
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData?.session?.access_token
      if (!token) throw new Error('Session expirée')

      const res = await fetch(`/api/admin/list-users?client_id=${encodeURIComponent(clientId)}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data?.error || 'Erreur chargement utilisateurs')
      }

      setProfils(Array.isArray(data?.users) ? data.users : [])
    } catch (err) {
      console.error('Erreur chargement utilisateurs établissement:', err)
      setError('Impossible de charger les utilisateurs de cet établissement.')
      setProfils([])
    } finally {
      setLoading(false)
    }
  }

  const creerUtilisateur = async () => {
    if (!newEmail || !newPassword || !newNom) {
      setError('Tous les champs sont obligatoires')
      return
    }
    setCreating(true)
    setError('')
    setSuccess('')

    const { data: { session } } = await supabase.auth.getSession()
    const clientId = await getClientId()

    if (!clientId) {
      setError('Erreur : client_id introuvable')
      setCreating(false)
      return
    }

    const res = await fetch('/api/create-user', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session?.access_token || ''}`
      },
      body: JSON.stringify({
        email: newEmail,
        password: newPassword,
        nom: newNom,
        role: newRole,
        client_id: clientId
      })
    })

    const data = await res.json()

    if (!res.ok || data.error) {
      setError('Erreur : ' + data.error)
      setCreating(false)
      return
    }

    setNewEmail('')
    setNewPassword('')
    setNewNom('')
    setNewRole('cuisine')
    setSuccess(`Compte créé pour ${newNom} !`)
    await loadProfils()
    setCreating(false)
  }

  const commencerEditNom = (profil) => {
    setEditingNomId(profil.id)
    setEditNomValue(profil.nom || '')
    setError('')
    setSuccess('')
  }

  const annulerEditNom = () => {
    setEditingNomId(null)
    setEditNomValue('')
  }

  const enregistrerNom = async () => {
    const nom = editNomValue.trim()
    if (!nom || !editingNomId) return
    setSavingNom(true)
    setError('')
    setSuccess('')
    try {
      const clientId = await getClientId()
      if (!clientId) { setError('client_id introuvable'); return }
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/admin/update-user-name', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token || ''}`
        },
        body: JSON.stringify({ client_id: clientId, user_id: editingNomId, nom })
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data?.error || 'Erreur lors de la mise à jour du nom.')
        return
      }
      setSuccess('Nom mis à jour.')
      setEditingNomId(null)
      setEditNomValue('')
      await loadProfils()
    } finally {
      setSavingNom(false)
    }
  }

  const changerRole = async (id, newRole) => {
    const clientId = await getClientId()
    if (!clientId) return
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/api/admin/update-user-access', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session?.access_token || ''}`
      },
      body: JSON.stringify({ client_id: clientId, user_id: id, role: newRole })
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data?.error || 'Erreur lors du changement de rôle.')
      return
    }
    await loadProfils()
  }

  const supprimerUtilisateur = async (id, nom) => {
    if (!confirm(`Retirer l'accès de ${nom || 'cet utilisateur'} à cet établissement ?`)) return
    const clientId = await getClientId()
    if (!clientId) return
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/api/admin/remove-user-access', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session?.access_token || ''}`
      },
      body: JSON.stringify({ client_id: clientId, user_id: id })
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data?.error || "Erreur lors du retrait de l'accès.")
      return
    }
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

  const droitsRole = (role) => {
    switch (role) {
      case 'admin': return '⚙️ Accès complet — Cuisine, Bar, paramètres et gestion des utilisateurs'
      case 'cuisine': return '👨‍🍳 Cuisine — peut créer, modifier et supprimer des fiches cuisine'
      case 'bar': return '🍸 Bar — peut créer, modifier et supprimer des fiches bar'
      case 'directeur': return '👔 Lecture seule — peut voir et exporter Cuisine + Bar mais pas modifier'
      default: return '—'
    }
  }

  if (roleLoading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: c.fond }}>
      <ChefLoader />
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: c.fond }}>

      <Navbar section="cuisine" />

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
                  autoComplete="off"
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
                  autoComplete="off"
                  placeholder="marie@lafantaisie.com"
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, fontSize: '14px', outline: 'none', color: c.texte, background: c.blanc }}
                />
              </div>
              <div>
                <label style={{ fontSize: '12px', color: c.texteMuted, fontWeight: '500', display: 'block', marginBottom: '6px' }}>Mot de passe *</label>
                <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                  placeholder="Minimum 6 caractères"
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, fontSize: '14px', outline: 'none', color: c.texte, background: c.blanc }}
                />
              </div>
            </div>

            <div style={{ background: c.fond, borderRadius: '8px', padding: '12px', fontSize: '12px', color: c.texteMuted, border: `0.5px solid ${c.bordure}` }}>
              {droitsRole(newRole)}
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
            <ChefLoader size={120} message="Chargement des utilisateurs..." />
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
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {editingNomId === profil.id ? (
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '4px' }}>
                        <input
                          type="text"
                          autoFocus
                          value={editNomValue}
                          onChange={e => setEditNomValue(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') enregistrerNom()
                            if (e.key === 'Escape') annulerEditNom()
                          }}
                          disabled={savingNom}
                          placeholder="Nom complet"
                          style={{
                            flex: 1, minWidth: '160px', padding: '6px 10px',
                            borderRadius: '6px', border: `0.5px solid ${c.accent}`,
                            fontSize: '14px', outline: 'none', color: c.texte, background: c.blanc,
                          }}
                        />
                        <button
                          onClick={enregistrerNom}
                          disabled={savingNom || !editNomValue.trim()}
                          title="Enregistrer"
                          style={{
                            background: savingNom || !editNomValue.trim() ? c.texteMuted : '#16A34A',
                            color: 'white', border: 'none', borderRadius: '6px',
                            padding: '6px 10px', fontSize: '12px', fontWeight: 500,
                            cursor: savingNom || !editNomValue.trim() ? 'not-allowed' : 'pointer',
                          }}
                        >{savingNom ? '…' : '✓'}</button>
                        <button
                          onClick={annulerEditNom}
                          disabled={savingNom}
                          title="Annuler"
                          style={{
                            background: 'transparent', color: c.texteMuted,
                            border: `0.5px solid ${c.bordure}`, borderRadius: '6px',
                            padding: '6px 10px', fontSize: '12px', cursor: 'pointer',
                          }}
                        >✕</button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '2px' }}>
                        <div style={{ fontSize: '14px', fontWeight: '500', color: c.texte }}>
                          {profil.nom || <span style={{ color: c.texteMuted, fontStyle: 'italic' }}>(sans nom)</span>}
                        </div>
                        <button
                          onClick={() => commencerEditNom(profil)}
                          title="Modifier le nom"
                          style={{
                            background: 'transparent', color: c.texteMuted,
                            border: 'none', padding: '2px 6px', fontSize: '12px',
                            cursor: 'pointer', borderRadius: '4px',
                          }}
                        >✏️</button>
                      </div>
                    )}
                    <div style={{ fontSize: '12px', color: c.texteMuted, marginTop: '2px' }}>{profil.email}</div>
                    <div style={{ fontSize: '11px', color: c.texteMuted, marginTop: '4px', fontStyle: 'italic' }}>
                      {droitsRole(profil.role)}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
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
                    {profil.role !== 'admin' && (
                      <button onClick={() => supprimerUtilisateur(profil.id, profil.nom)} style={{
                        background: 'transparent', color: '#F09595',
                        border: `0.5px solid #F09595`, borderRadius: '8px',
                        padding: '6px 10px', fontSize: '12px', cursor: 'pointer'
                      }}>🗑️</button>
                    )}
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

