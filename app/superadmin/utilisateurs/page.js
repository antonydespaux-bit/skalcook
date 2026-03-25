'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../../lib/supabase'
import { theme, Logo, LogoBand } from '../../../lib/theme.jsx'

const SUPERADMIN_EMAILS = ['antony.despaux@hotmail.fr', 'antony@skalcook.com']

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

  const [authorized, setAuthorized] = useState(false)
  const [loading, setLoading] = useState(true)
  const [users, setUsers] = useState([])
  const [error, setError] = useState('')
  const [deletingId, setDeletingId] = useState(null)
  const [currentUserId, setCurrentUserId] = useState(null)
  const [roleFilter, setRoleFilter] = useState('tous')

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
        let isAllowed = SUPERADMIN_EMAILS.includes(sessionEmail)

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
        setError(typeof data.error === 'string' ? data.error : 'Erreur lors de la suppression.')
        return
      }

      setUsers((prev) => prev.filter((u) => u.id !== user.id))
    } finally {
      setDeletingId(null)
    }
  }

  if (!authorized || loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: c.fond }}>
        <div style={{ fontSize: '14px', color: c.texteMuted }}>Chargement...</div>
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
            onClick={() => router.push('/superadmin')}
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
            onClick={() => router.push('/superadmin/utilisateurs/nouveau')}
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
          <div style={{ fontSize: '20px', fontWeight: 700, color: c.texte, marginBottom: '4px' }}>
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
                      onClick={() => router.push(`/superadmin/utilisateurs/${user.id}`)}
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
      </div>
    </div>
  )
}

