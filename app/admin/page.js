'use client'
export const dynamic = 'force-dynamic'
import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase, getClientId } from '../../lib/supabase'
import { useRouter } from 'next/navigation'
import { useIsMobile } from '../../lib/useIsMobile'
import { useTheme } from '../../lib/useTheme'
import { useRole } from '../../lib/useRole'
import { isSuperadminEmail } from '../../lib/superadmin'
import Navbar from '../../components/Navbar'
import ChefLoader from '../../components/ChefLoader'
import { Alert } from '../../components/ui'

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
  const [currentUserId, setCurrentUserId] = useState(null)
  const [editingNomId, setEditingNomId] = useState(null)
  const [editNomValue, setEditNomValue] = useState('')
  const [savingNom, setSavingNom] = useState(false)
  const router = useRouter()
  const { t } = useTranslation()
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
      setCurrentUserId(user?.id || null)
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
      setError(t('admin.users.loadError'))
      setProfils([])
    } finally {
      setLoading(false)
    }
  }

  const creerUtilisateur = async () => {
    if (!newEmail || !newPassword || !newNom) {
      setError(t('admin.users.allRequired'))
      return
    }
    if (newPassword.length < 8) {
      setError('Le mot de passe doit contenir au moins 8 caractères.')
      return
    }
    setCreating(true)
    setError('')
    setSuccess('')

    const { data: { session } } = await supabase.auth.getSession()
    const clientId = await getClientId()

    if (!clientId) {
      setError(t('admin.users.clientIdMissing'))
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
      setError('Erreur : ' + formatApiError(data, 'Données invalides'))
      setCreating(false)
      return
    }

    setNewEmail('')
    setNewPassword('')
    setNewNom('')
    setNewRole('cuisine')
    setSuccess(t('admin.users.accountCreated', { name: newNom }))
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

  // Formate une erreur API en message lisible, en incluant les détails Zod
  // si l'API a renvoyé { error, details: { fieldErrors: { champ: [msg] } } }
  const formatApiError = (data, fallback) => {
    const base = typeof data?.error === 'string' ? data.error : fallback
    const fieldErrors = data?.details?.fieldErrors
    if (fieldErrors && typeof fieldErrors === 'object') {
      const parts = []
      for (const [champ, msgs] of Object.entries(fieldErrors)) {
        if (Array.isArray(msgs) && msgs.length > 0) parts.push(`${champ}: ${msgs.join(', ')}`)
      }
      if (parts.length > 0) return `${base} — ${parts.join(' ; ')}`
    }
    return base
  }

  const enregistrerNom = async () => {
    const nom = editNomValue.trim()
    if (!nom || !editingNomId) return
    setSavingNom(true)
    setError('')
    setSuccess('')
    try {
      const clientId = await getClientId()
      if (!clientId) { setError(t('admin.users.clientIdReload')); window.scrollTo({ top: 0, behavior: 'smooth' }); return }
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
        setError(formatApiError(data, t('admin.users.nameUpdateError')))
        window.scrollTo({ top: 0, behavior: 'smooth' })
        return
      }
      setSuccess(t('admin.users.nameUpdated'))
      setEditingNomId(null)
      setEditNomValue('')
      await loadProfils()
    } finally {
      setSavingNom(false)
    }
  }

  const changerRole = async (id, newRole) => {
    const clientId = await getClientId()
    if (!clientId) { setError(t('admin.users.clientIdReload')); window.scrollTo({ top: 0, behavior: 'smooth' }); return }
    setError('')
    setSuccess('')
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
      setError(formatApiError(data, t('admin.users.roleChangeError')))
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    setSuccess(t('admin.users.roleUpdated'))
    await loadProfils()
  }

  const supprimerUtilisateur = async (id, nom, role) => {
    if (id === currentUserId) {
      setError(t('admin.users.cannotRemoveSelf'))
      return
    }
    const baseMsg = t('admin.users.removeConfirm', { name: nom || t('admin.users.removeConfirmGeneric') })
    const strongMsg = role === 'admin'
      ? `${baseMsg}\n\n${t('admin.users.removeAdminWarning')}`
      : baseMsg
    if (!confirm(strongMsg)) return
    const clientId = await getClientId()
    if (!clientId) { setError(t('admin.users.clientIdReload')); return }
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
      setError(formatApiError(data, t('admin.users.removeError')))
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    setSuccess(t('admin.users.accessRemoved', { name: nom || t('admin.users.userFallback') }))
    await loadProfils()
  }

  const roleLabel = (role) => {
    switch (role) {
      case 'admin': return { label: t('admin.users.roles.admin'), color: '#2C1810', bg: '#F0E8E0' }
      case 'cuisine': return { label: t('admin.users.roles.cuisine'), color: '#3B6D11', bg: '#EAF3DE' }
      case 'bar': return { label: t('admin.users.roles.bar'), color: '#3C3489', bg: '#EEEDFE' }
      case 'directeur': return { label: t('admin.users.roles.directeur'), color: '#854F0B', bg: '#FAEEDA' }
      default: return { label: t('admin.users.roles.undefined'), color: '#8B7355', bg: '#FAF9F6' }
    }
  }

  const droitsRole = (role) => {
    switch (role) {
      case 'admin': return t('admin.users.rights.admin')
      case 'cuisine': return t('admin.users.rights.cuisine')
      case 'bar': return t('admin.users.rights.bar')
      case 'directeur': return t('admin.users.rights.directeur')
      default: return t('admin.users.rights.none')
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
            {t('admin.users.createTitle')}
          </div>

          {error && (
            <Alert variant="error" style={{ marginBottom: '12px' }}>
              {error}
            </Alert>
          )}

          {success && (
            <Alert variant="success" style={{ marginBottom: '12px' }}>
              ✓ {success}
            </Alert>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '12px', color: c.texteMuted, fontWeight: '500', display: 'block', marginBottom: '6px' }}>{t('admin.users.name')}</label>
                <input type="text" value={newNom} onChange={e => setNewNom(e.target.value)}
                  autoComplete="off"
                  placeholder={t('admin.users.namePlaceholder')}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, fontSize: '14px', outline: 'none', color: c.texte, background: c.blanc }}
                />
              </div>
              <div>
                <label style={{ fontSize: '12px', color: c.texteMuted, fontWeight: '500', display: 'block', marginBottom: '6px' }}>{t('admin.users.role')}</label>
                <select value={newRole} onChange={e => setNewRole(e.target.value)} style={{
                  width: '100%', padding: '10px 12px', borderRadius: '8px',
                  border: `0.5px solid ${c.bordure}`, fontSize: '14px',
                  background: c.blanc, outline: 'none', color: c.texte
                }}>
                  <option value="cuisine">{t('admin.users.createOptions.cuisine')}</option>
                  <option value="bar">{t('admin.users.createOptions.bar')}</option>
                  <option value="directeur">{t('admin.users.createOptions.directeurZone')}</option>
                  <option value="admin">{t('admin.users.createOptions.admin')}</option>
                </select>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '12px', color: c.texteMuted, fontWeight: '500', display: 'block', marginBottom: '6px' }}>{t('admin.users.email')}</label>
                <input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)}
                  autoComplete="off"
                  placeholder={t('admin.users.emailPlaceholder')}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, fontSize: '14px', outline: 'none', color: c.texte, background: c.blanc }}
                />
              </div>
              <div>
                <label style={{ fontSize: '12px', color: c.texteMuted, fontWeight: '500', display: 'block', marginBottom: '6px' }}>{t('admin.users.password')}</label>
                <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                  placeholder={t('admin.users.passwordPlaceholder')}
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
              {creating ? t('admin.users.creating') : t('admin.users.createBtn')}
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
              {t('admin.users.listTitle', { count: profils.length })}
            </div>
          </div>

          {loading ? (
            <ChefLoader size={120} message={t('admin.users.loadingUsers')} />
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
                          placeholder={t('admin.users.fullNamePlaceholder')}
                          style={{
                            flex: 1, minWidth: '160px', padding: '6px 10px',
                            borderRadius: '6px', border: `0.5px solid ${c.accent}`,
                            fontSize: '14px', outline: 'none', color: c.texte, background: c.blanc,
                          }}
                        />
                        <button
                          onClick={enregistrerNom}
                          disabled={savingNom || !editNomValue.trim()}
                          title={t('admin.users.saveName')}
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
                          title={t('admin.users.cancelName')}
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
                          {profil.nom || <span style={{ color: c.texteMuted, fontStyle: 'italic' }}>{t('admin.users.noName')}</span>}
                        </div>
                        <button
                          onClick={() => commencerEditNom(profil)}
                          title={t('admin.users.editName')}
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
                      <option value="">{t('admin.users.roleSelectPlaceholder')}</option>
                      <option value="cuisine">{t('admin.users.roles.cuisine')}</option>
                      <option value="bar">{t('admin.users.roles.bar')}</option>
                      <option value="directeur">{t('admin.users.roles.directeur')}</option>
                      <option value="admin">{t('admin.logs.admin')}</option>
                    </select>
                    {profil.id !== currentUserId && (
                      <button
                        onClick={() => supprimerUtilisateur(profil.id, profil.nom, profil.role)}
                        title={profil.role === 'admin' ? t('admin.users.removeAdminAccess') : t('admin.users.removeAccess')}
                        style={{
                          background: 'transparent', color: '#F09595',
                          border: `0.5px solid #F09595`, borderRadius: '8px',
                          padding: '6px 10px', fontSize: '12px', cursor: 'pointer'
                        }}
                      >🗑️</button>
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

