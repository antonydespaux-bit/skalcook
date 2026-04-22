'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../../lib/supabase'
import { isSuperadminEmail } from '../../../lib/superadmin'
import { theme, Logo, LogoBand } from '../../../lib/theme.jsx'
import ChefLoader from '../../../components/ChefLoader'
import { useIsMobile } from '../../../lib/useIsMobile'

function formatDate(value) {
  if (!value) return '-'
  try {
    return new Date(value).toLocaleDateString('fr-FR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    })
  } catch {
    return '-'
  }
}

function roleBadgeStyle(role) {
  const safeRole = String(role || '').toLowerCase()
  if (safeRole === 'consultant') {
    return {
      background: '#ECFEFF',
      color: '#155E75',
      border: '0.5px solid #A5F3FC'
    }
  }
  if (safeRole === 'admin') {
    return {
      background: '#EEF2FF',
      color: '#3730A3',
      border: '0.5px solid #C7D2FE'
    }
  }
  return {
    background: '#F4F4F5',
    color: '#52525B',
    border: '0.5px solid #E4E4E7'
  }
}

export default function SuperadminUsersPage() {
  const router = useRouter()
  const c = theme.couleurs
  const isMobile = useIsMobile()

  const [authorized, setAuthorized] = useState(false)
  const [loading, setLoading] = useState(true)
  const [users, setUsers] = useState([])
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [deletingId, setDeletingId] = useState(null)
  const [updatingId, setUpdatingId] = useState(null)
  const [currentUserId, setCurrentUserId] = useState(null)
  const [roleFilter, setRoleFilter] = useState('tous')
  const [editingUser, setEditingUser] = useState(null)
  const [editNom, setEditNom] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [editRole, setEditRole] = useState('')
  const [editTelephone, setEditTelephone] = useState('')
  const [editSiteWeb, setEditSiteWeb] = useState('')
  const [editSiretPersonnel, setEditSiretPersonnel] = useState('')
  const [editAdressePro, setEditAdressePro] = useState('')
  const [isNavigating, setIsNavigating] = useState(false)

  const loadUsers = async () => {
    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData?.session?.access_token
    if (!token) {
      setError('Session expirée. Reconnectez-vous.')
      return
    }

    const res = await fetch('/api/superadmin/list-users', {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` }
    })

    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setError(`Impossible de charger les utilisateurs : ${data?.error || 'Erreur inconnue'}`)
      return
    }
    setUsers(Array.isArray(data?.users) ? data.users : [])
  }

  useEffect(() => {
    const init = async () => {
      try {
        setLoading(true)
        setError('')

        const { data: sessionData } = await supabase.auth.getSession()
        const session = sessionData?.session
        if (!session) {
          router.push('/login')
          return
        }

        setCurrentUserId(session.user.id || null)

        const sessionEmail = (session.user?.email || '').toLowerCase().trim()
        let isAllowed = isSuperadminEmail(sessionEmail)

        if (!isAllowed) {
          const { data: meProfil } = await supabase
            .from('profils')
            .select('is_superadmin')
            .eq('id', session.user.id)
            .single()
          isAllowed = !!meProfil?.is_superadmin
        }

        if (!isAllowed) {
          router.push('/dashboard')
          return
        }

        setAuthorized(true)
        await loadUsers()
      } finally {
        setLoading(false)
      }
    }

    init()
  }, [])

  const roleOptions = useMemo(() => {
    const roles = Array.from(new Set((users || []).map((u) => String(u.role || '').trim()).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b))
    return ['tous', ...roles]
  }, [users])

  const filteredUsers = useMemo(() => {
    if (roleFilter === 'tous') return users
    return users.filter((u) => String(u.role || '').toLowerCase() === roleFilter.toLowerCase())
  }, [users, roleFilter])

  const deleteUser = async (user) => {
    if (!user?.id) return

    if (user.id === currentUserId) {
      alert('Vous ne pouvez pas vous supprimer vous-même.')
      return
    }

    const ok = window.confirm(`Supprimer l'utilisateur "${user.nom || user.email || user.id}" ?`)
    if (!ok) return

    setDeletingId(user.id)
    setError('')
    setSuccess('')
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData?.session?.access_token
      if (!token) {
        setError('Session expirée. Reconnectez-vous.')
        return
      }

      const res = await fetch('/api/superadmin/delete-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ user_id: user.id })
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(formatApiError(data, 'Erreur lors de la suppression.'))
        return
      }

      setUsers((prev) => prev.filter((u) => u.id !== user.id))
    } finally {
      setDeletingId(null)
    }
  }

  const openEditModal = (user) => {
    setEditingUser(user)
    setEditNom(user?.nom || '')
    setEditEmail(user?.email || '')
    setEditRole(user?.role || '')
    setEditTelephone(user?.telephone || '')
    setEditSiteWeb(user?.site_web || '')
    setEditSiretPersonnel(user?.siret_personnel || '')
    setEditAdressePro(user?.adresse_pro || '')
    setError('')
    setSuccess('')
  }

  const closeEditModal = () => {
    if (updatingId) return
    setEditingUser(null)
    setEditNom('')
    setEditEmail('')
    setEditRole('')
    setEditTelephone('')
    setEditSiteWeb('')
    setEditSiretPersonnel('')
    setEditAdressePro('')
  }

  // Formate une erreur API (avec détails Zod éventuels) en message lisible.
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

  const updateUser = async () => {
    if (!editingUser?.id) return
    setUpdatingId(editingUser.id)
    setError('')
    setSuccess('')
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData?.session?.access_token
      if (!token) {
        setError('Session expirée. Reconnectez-vous.')
        return
      }

      // N'envoie que les champs non vides — sinon Zod rejette nom:"" (min 1),
      // role:"" (enum). user_id est toujours envoyé.
      const payload = { user_id: editingUser.id }
      const nom = editNom.trim()
      const email = editEmail.trim()
      const telephone = editTelephone.trim()
      const siteWeb = editSiteWeb.trim()
      const siretPersonnel = editSiretPersonnel.trim()
      const adressePro = editAdressePro.trim()
      if (nom) payload.nom = nom
      if (email) payload.email = email
      if (editRole) payload.role = editRole
      if (telephone) payload.telephone = telephone
      if (siteWeb) payload.site_web = siteWeb
      if (siretPersonnel) payload.siret_personnel = siretPersonnel
      if (adressePro) payload.adresse_pro = adressePro

      const res = await fetch('/api/superadmin/update-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(formatApiError(data, 'Erreur lors de la mise à jour.'))
        return
      }

      setUsers((prev) => prev.map((u) => (
        u.id === editingUser.id
          ? {
              ...u,
              nom: editNom.trim(),
              email: editEmail.trim(),
              role: editRole,
              telephone: editTelephone.trim() || null,
              site_web: editSiteWeb.trim() || null,
              siret_personnel: editSiretPersonnel.trim() || null,
              adresse_pro: editAdressePro.trim() || null
            }
          : u
      )))
      setSuccess('Utilisateur mis à jour avec succès.')
      closeEditModal()
    } finally {
      setUpdatingId(null)
    }
  }
  const handleNavigation = (url) => {
    setIsNavigating(true)
    router.push(url)
  }

  if (!authorized || loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: c.fond }}>
        <ChefLoader />
      </div>
    )
  }
  if (isNavigating) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: c.fond }}>
        <ChefLoader message="Navigation en cours..." />
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: c.fond }}>
      <div style={{
        background: c.principal, borderBottom: `0.5px solid ${c.accent}40`,
        padding: '0 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        height: '56px', position: 'sticky', top: 0, zIndex: 100
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Logo height={28} couleur="white" />
          <span style={{ color: 'rgba(255,255,255,0.3)' }}>|</span>
          <button
            onClick={() => handleNavigation('/superadmin')}
            style={{
              background: 'transparent', border: '0.5px solid rgba(255,255,255,0.2)',
              borderRadius: '8px', padding: '6px 10px', fontSize: '13px',
              cursor: 'pointer', color: 'rgba(255,255,255,0.7)'
            }}
          >
            ← Retour SuperAdmin
          </button>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => handleNavigation('/superadmin/utilisateurs/nouveau')}
            style={{
              background: 'rgba(16,185,129,0.2)', color: '#A7F3D0',
              border: '0.5px solid rgba(16,185,129,0.35)',
              borderRadius: '8px', padding: '7px 12px', fontSize: '13px', cursor: 'pointer'
            }}
          >
            ➕ Nouvel utilisateur
          </button>
        </div>
      </div>

      <div style={{ maxWidth: '1080px', margin: '0 auto', padding: '20px' }}>
        <LogoBand c={c} style={{ marginBottom: '14px' }}>
          <Logo height={30} couleur="white" />
        </LogoBand>

        <div style={{
          background: 'white', borderRadius: '14px', border: `0.5px solid ${c.bordure}`,
          padding: '18px', marginBottom: '12px'
        }}>
          <div style={{ fontSize: 'clamp(1.5rem, 5vw, 2.5rem)', fontWeight: 700, color: c.texte, marginBottom: '4px' }}>
            Utilisateurs
          </div>
          <div style={{ fontSize: '13px', color: c.texteMuted }}>
            {filteredUsers.length} utilisateur{filteredUsers.length > 1 ? 's' : ''}
            {roleFilter !== 'tous' ? ` (${roleFilter})` : ''} · total: {users.length}
          </div>
        </div>

        <div style={{
          background: 'white', borderRadius: '12px', border: `0.5px solid ${c.bordure}`,
          padding: '12px', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '10px'
        }}>
          <span style={{ fontSize: '12px', color: c.texteMuted, textTransform: 'uppercase', fontWeight: 700 }}>
            Filtrer par role
          </span>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            style={{
              border: `0.5px solid ${c.bordure}`,
              borderRadius: '8px',
              padding: '7px 10px',
              fontSize: '13px',
              color: c.texte,
              background: 'white'
            }}
          >
            {roleOptions.map((role) => (
              <option key={role} value={role}>
                {role === 'tous' ? 'Tous les roles' : role}
              </option>
            ))}
          </select>
        </div>

        {error && (
          <div style={{
            background: '#FCEBEB', color: '#A32D2D',
            borderRadius: '8px', padding: '10px 12px',
            border: '0.5px solid #F09595', fontSize: '13px', marginBottom: '10px'
          }}>
            {error}
          </div>
        )}

        {success && (
          <div style={{
            background: '#DCFCE7', color: '#166534',
            borderRadius: '8px', padding: '10px 12px',
            border: '0.5px solid #86EFAC', fontSize: '13px', marginBottom: '10px'
          }}>
            {success}
          </div>
        )}

        {!isMobile ? (
          <div style={{
            background: 'white',
            borderRadius: '14px',
            border: `0.5px solid ${c.bordure}`,
            overflow: 'hidden'
          }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '760px' }}>
              <thead>
                <tr style={{ background: '#FAFAFA', borderBottom: `0.5px solid ${c.bordure}` }}>
                  <th style={{ textAlign: 'left', padding: '12px', fontSize: '11px', color: c.texteMuted, textTransform: 'uppercase' }}>Nom</th>
                  <th style={{ textAlign: 'left', padding: '12px', fontSize: '11px', color: c.texteMuted, textTransform: 'uppercase' }}>Email</th>
                  <th style={{ textAlign: 'left', padding: '12px', fontSize: '11px', color: c.texteMuted, textTransform: 'uppercase' }}>Role</th>
                  <th style={{ textAlign: 'left', padding: '12px', fontSize: '11px', color: c.texteMuted, textTransform: 'uppercase' }}>Etablissements</th>
                  <th style={{ textAlign: 'left', padding: '12px', fontSize: '11px', color: c.texteMuted, textTransform: 'uppercase' }}>Date de création</th>
                  <th style={{ textAlign: 'right', padding: '12px', fontSize: '11px', color: c.texteMuted, textTransform: 'uppercase' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user) => {
                  const badge = roleBadgeStyle(user.role)
                  const isSelf = user.id === currentUserId
                  return (
                    <tr
                      key={user.id}
                      onClick={() => handleNavigation(`/superadmin/utilisateurs/${user.id}`)}
                      style={{ borderBottom: `0.5px solid ${c.bordure}`, cursor: 'pointer' }}
                    >
                      <td style={{ padding: '12px', fontSize: '13px', color: c.texte, fontWeight: 600 }}>
                        {user.nom || '-'}
                      </td>
                      <td style={{ padding: '12px', fontSize: '13px', color: c.texteMuted }}>
                        {user.email || '-'}
                      </td>
                      <td style={{ padding: '12px' }}>
                        <span style={{
                          ...badge,
                          borderRadius: '999px',
                          padding: '4px 10px',
                          fontSize: '12px',
                          fontWeight: 700,
                          textTransform: 'capitalize'
                        }}>
                          {user.role || '-'}
                        </span>
                      </td>
                      <td style={{ padding: '12px', fontSize: '13px', color: c.texte, fontWeight: 600 }}>
                        {user.etablissement_count ?? 0}
                      </td>
                      <td style={{ padding: '12px', fontSize: '13px', color: c.texteMuted }}>
                        {formatDate(user.created_at)}
                      </td>
                      <td style={{ padding: '12px', textAlign: 'right' }}>
                        <button
                          onClick={(e) => { e.stopPropagation(); openEditModal(user) }}
                          disabled={!!deletingId || !!updatingId}
                          title="Modifier cet utilisateur"
                          style={{
                            border: '0.5px solid #CBD5E1',
                            background: 'white',
                            color: '#334155',
                            borderRadius: '8px',
                            padding: '7px 10px',
                            fontSize: '12px',
                            fontWeight: 700,
                            cursor: (!!deletingId || !!updatingId) ? 'not-allowed' : 'pointer',
                            marginRight: '8px',
                            opacity: (!!deletingId || !!updatingId) ? 0.7 : 1
                          }}
                        >
                          ✏️ Modifier
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); deleteUser(user) }}
                          disabled={!!deletingId || isSelf}
                          title={isSelf ? 'Suppression de votre propre compte interdite' : 'Supprimer cet utilisateur'}
                          style={{
                            border: 'none',
                            background: isSelf ? '#E4E4E7' : '#EF4444',
                            color: isSelf ? '#71717A' : 'white',
                            borderRadius: '8px',
                            padding: '7px 10px',
                            fontSize: '12px',
                            fontWeight: 700,
                            cursor: (!!deletingId || isSelf) ? 'not-allowed' : 'pointer',
                            opacity: deletingId === user.id ? 0.7 : 1
                          }}
                        >
                          {deletingId === user.id ? 'Suppression...' : 'Supprimer'}
                        </button>
                      </td>
                    </tr>
                  )
                })}
                {filteredUsers.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ padding: '20px', fontSize: '13px', color: c.texteMuted, textAlign: 'center' }}>
                      Aucun utilisateur trouvé.
                    </td>
                  </tr>
                )}
              </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {filteredUsers.map((user) => {
              const badge = roleBadgeStyle(user.role)
              const isSelf = user.id === currentUserId
              return (
                <div
                  key={user.id}
                  onClick={() => handleNavigation(`/superadmin/utilisateurs/${user.id}`)}
                  style={{
                    background: 'white',
                    borderRadius: '12px',
                    border: `0.5px solid ${c.bordure}`,
                    padding: '12px',
                    cursor: 'pointer'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', marginBottom: '6px' }}>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: c.texte }}>{user.nom || '-'}</div>
                    <span style={{ ...badge, borderRadius: '999px', padding: '3px 8px', fontSize: '11px', fontWeight: 700, textTransform: 'capitalize', alignSelf: 'flex-start' }}>
                      {user.role || '-'}
                    </span>
                  </div>
                  <div style={{ fontSize: '12px', color: c.texteMuted, marginBottom: '4px' }}>{user.email || '-'}</div>
                  <div style={{ fontSize: '12px', color: c.texteMuted, marginBottom: '8px' }}>
                    Établissements: <strong style={{ color: c.texte }}>{user.etablissement_count ?? 0}</strong> · Créé le {formatDate(user.created_at)}
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={(e) => { e.stopPropagation(); openEditModal(user) }}
                      disabled={!!deletingId || !!updatingId}
                      style={{
                        flex: 1,
                        border: '0.5px solid #CBD5E1',
                        background: 'white',
                        color: '#334155',
                        borderRadius: '8px',
                        padding: '7px 10px',
                        fontSize: '12px',
                        fontWeight: 700,
                        cursor: (!!deletingId || !!updatingId) ? 'not-allowed' : 'pointer'
                      }}
                    >
                      ✏️ Modifier
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteUser(user) }}
                      disabled={!!deletingId || isSelf}
                      style={{
                        flex: 1,
                        border: 'none',
                        background: isSelf ? '#E4E4E7' : '#EF4444',
                        color: isSelf ? '#71717A' : 'white',
                        borderRadius: '8px',
                        padding: '7px 10px',
                        fontSize: '12px',
                        fontWeight: 700,
                        cursor: (!!deletingId || isSelf) ? 'not-allowed' : 'pointer'
                      }}
                    >
                      {deletingId === user.id ? 'Suppression...' : 'Supprimer'}
                    </button>
                  </div>
                </div>
              )
            })}
            {filteredUsers.length === 0 && (
              <div style={{ background: 'white', borderRadius: '12px', border: `0.5px solid ${c.bordure}`, padding: '20px', fontSize: '13px', color: c.texteMuted, textAlign: 'center' }}>
                Aucun utilisateur trouvé.
              </div>
            )}
          </div>
        )}
      </div>

      {editingUser && (
        <div
          onClick={closeEditModal}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(24,24,27,0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 300
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: '520px',
              background: 'white',
              borderRadius: '14px',
              border: `0.5px solid ${c.bordure}`,
              padding: '16px'
            }}
          >
            <div style={{ fontSize: '17px', fontWeight: 700, color: c.texte, marginBottom: '4px' }}>
              Modifier l&apos;utilisateur
            </div>
            <div style={{ fontSize: '12px', color: c.texteMuted, marginBottom: '14px' }}>
              Mettez à jour le nom et l&apos;email du compte.
            </div>

            <div style={{ display: 'grid', gap: '10px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '12px', color: c.texteMuted, fontWeight: 600, display: 'block', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Nom
                  </label>
                  <input
                    value={editNom}
                    onChange={(e) => setEditNom(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: `0.5px solid ${c.bordure}`,
                      fontSize: '14px',
                      outline: 'none',
                      color: c.texte
                    }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: c.texteMuted, fontWeight: 600, display: 'block', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Email
                  </label>
                  <input
                    type="email"
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: `0.5px solid ${c.bordure}`,
                      fontSize: '14px',
                      outline: 'none',
                      color: c.texte
                    }}
                  />
                </div>
              </div>
              <div>
                <label style={{ fontSize: '12px', color: c.texteMuted, fontWeight: 600, display: 'block', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Role
                </label>
                <select
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: `0.5px solid ${c.bordure}`,
                    fontSize: '14px',
                    outline: 'none',
                    color: c.texte,
                    background: 'white'
                  }}
                >
                  {['admin', 'consultant', 'directeur', 'cuisine', 'bar'].map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>

              {editRole === 'consultant' && (
                <div style={{ border: `0.5px solid ${c.bordure}`, borderRadius: '10px', padding: '10px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: c.texteMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '8px' }}>
                    Informations Professionnelles
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div>
                      <label style={{ fontSize: '12px', color: c.texteMuted, fontWeight: 600, display: 'block', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        Téléphone
                      </label>
                      <input
                        value={editTelephone}
                        onChange={(e) => setEditTelephone(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '10px 12px',
                          borderRadius: '8px',
                          border: `0.5px solid ${c.bordure}`,
                          fontSize: '14px',
                          outline: 'none',
                          color: c.texte
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '12px', color: c.texteMuted, fontWeight: 600, display: 'block', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        Site Web
                      </label>
                      <input
                        value={editSiteWeb}
                        onChange={(e) => setEditSiteWeb(e.target.value)}
                        placeholder="https://..."
                        style={{
                          width: '100%',
                          padding: '10px 12px',
                          borderRadius: '8px',
                          border: `0.5px solid ${c.bordure}`,
                          fontSize: '14px',
                          outline: 'none',
                          color: c.texte
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '12px', color: c.texteMuted, fontWeight: 600, display: 'block', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        SIRET Personnel
                      </label>
                      <input
                        value={editSiretPersonnel}
                        onChange={(e) => setEditSiretPersonnel(e.target.value)}
                        placeholder="14 chiffres"
                        style={{
                          width: '100%',
                          padding: '10px 12px',
                          borderRadius: '8px',
                          border: `0.5px solid ${c.bordure}`,
                          fontSize: '14px',
                          outline: 'none',
                          color: c.texte
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '12px', color: c.texteMuted, fontWeight: 600, display: 'block', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        Adresse Professionnelle
                      </label>
                      <input
                        value={editAdressePro}
                        onChange={(e) => setEditAdressePro(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '10px 12px',
                          borderRadius: '8px',
                          border: `0.5px solid ${c.bordure}`,
                          fontSize: '14px',
                          outline: 'none',
                          color: c.texte
                        }}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '14px' }}>
              <button
                onClick={closeEditModal}
                disabled={!!updatingId}
                style={{
                  border: `0.5px solid ${c.bordure}`,
                  background: 'white',
                  color: c.texteMuted,
                  borderRadius: '8px',
                  padding: '8px 10px',
                  fontSize: '12px',
                  cursor: !!updatingId ? 'not-allowed' : 'pointer'
                }}
              >
                Annuler
              </button>
              <button
                onClick={updateUser}
                disabled={!!updatingId}
                style={{
                  border: 'none',
                  background: c.accent,
                  color: 'white',
                  borderRadius: '8px',
                  padding: '8px 10px',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: !!updatingId ? 'not-allowed' : 'pointer',
                  opacity: !!updatingId ? 0.7 : 1
                }}
              >
                {updatingId ? 'Enregistrement...' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

