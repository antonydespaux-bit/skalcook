'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '../../../../lib/supabase'
import { theme, Logo, LogoBand } from '../../../../lib/theme.jsx'

// Gestion des acces multi-etablissements par utilisateur
const SUPERADMIN_EMAILS = ['antony.despaux@hotmail.fr', 'antony@skalcook.com']

export default function SuperadminUserAccessPage() {
  const params = useParams()
  const router = useRouter()
  const c = theme.couleurs

  const userId = params?.id

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [authorized, setAuthorized] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [profil, setProfil] = useState(null)
  const [clients, setClients] = useState([])
  const [initialClientIds, setInitialClientIds] = useState([])
  const [selectedClientIds, setSelectedClientIds] = useState([])

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

        const sessionEmail = (session?.user?.email || '').toLowerCase().trim()
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

        const [profilRes, clientsRes, accesRes] = await Promise.all([
          supabase
            .from('profils')
            .select('id, nom, role, client_id')
            .eq('id', userId)
            .maybeSingle(),
          supabase
            .from('clients')
            .select('id, nom_etablissement, nom, slug, actif')
            .order('nom_etablissement', { ascending: true }),
          supabase
            .from('acces_clients')
            .select('client_id')
            .eq('user_id', userId),
        ])

        if (profilRes.error) {
          setError(`Erreur profil: ${profilRes.error.message}`)
          return
        }
        if (clientsRes.error) {
          setError(`Erreur clients: ${clientsRes.error.message}`)
          return
        }
        if (accesRes.error) {
          setError(`Erreur acces: ${accesRes.error.message}`)
          return
        }

        setProfil(profilRes.data || null)
        setClients(clientsRes.data || [])

        const fromAcces = (accesRes.data || [])
          .map((row) => row.client_id)
          .filter(Boolean)

        // Compat: si l'utilisateur a un `profil.client_id` historique, on le préselectionne.
        const seeded = profilRes.data?.client_id ? Array.from(new Set([...fromAcces, profilRes.data.client_id])) : fromAcces
        setInitialClientIds(seeded)
        setSelectedClientIds(seeded)
      } finally {
        setLoading(false)
      }
    }

    if (userId) init()
  }, [userId])

  const dirty = useMemo(() => {
    const a = [...initialClientIds].sort().join('|')
    const b = [...selectedClientIds].sort().join('|')
    return a !== b
  }, [initialClientIds, selectedClientIds])

  const toggleClient = (clientId) => {
    setSuccess('')
    setSelectedClientIds((prev) => (
      prev.includes(clientId)
        ? prev.filter((id) => id !== clientId)
        : [...prev, clientId]
    ))
  }

  const saveAcces = async () => {
    if (!userId) return
    setSaving(true)
    setError('')
    setSuccess('')

    const toInsert = selectedClientIds.filter((id) => !initialClientIds.includes(id))
    const toDelete = initialClientIds.filter((id) => !selectedClientIds.includes(id))
    const defaultRole = profil?.role || 'cuisine'

    try {
      if (toInsert.length > 0) {
        const rows = toInsert.map((clientId) => ({
          user_id: userId,
          client_id: clientId,
          role: defaultRole,
        }))
        const { error: insertErr } = await supabase
          .from('acces_clients')
          .insert(rows)
        if (insertErr) throw insertErr
      }

      if (toDelete.length > 0) {
        const { error: deleteErr } = await supabase
          .from('acces_clients')
          .delete()
          .eq('user_id', userId)
          .in('client_id', toDelete)
        if (deleteErr) throw deleteErr
      }

      setInitialClientIds(selectedClientIds)
      setSuccess('Acces enregistres avec succes.')
    } catch (e) {
      setError(`Erreur lors de la sauvegarde: ${e.message}`)
    } finally {
      setSaving(false)
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
        background: c.principal,
        borderBottom: `0.5px solid ${c.accent}40`,
        padding: '0 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: '56px',
        position: 'sticky',
        top: 0,
        zIndex: 100
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Logo height={28} couleur="white" />
          <span style={{ color: 'rgba(255,255,255,0.3)' }}>|</span>
          <button
            onClick={() => router.push('/superadmin')}
            style={{
              background: 'transparent',
              border: '0.5px solid rgba(255,255,255,0.2)',
              borderRadius: '8px',
              padding: '6px 10px',
              fontSize: '13px',
              cursor: 'pointer',
              color: 'rgba(255,255,255,0.7)'
            }}
          >
            ← Retour SuperAdmin
          </button>
        </div>
      </div>

      <div style={{ maxWidth: '960px', margin: '0 auto', padding: '20px' }}>
        <LogoBand c={c} style={{ marginBottom: '14px' }}>
          <Logo height={30} couleur="white" />
        </LogoBand>

        <div style={{
          background: 'white',
          borderRadius: '14px',
          border: `0.5px solid ${c.bordure}`,
          padding: '18px',
          marginBottom: '12px'
        }}>
          <div style={{ fontSize: '18px', fontWeight: 600, color: c.texte, marginBottom: '6px' }}>
            Etablissements autorises
          </div>
          <div style={{ fontSize: '13px', color: c.texteMuted }}>
            Utilisateur: <strong style={{ color: c.texte }}>{profil?.nom || userId}</strong>
            {profil?.role ? <span> · Role: <strong style={{ color: c.texte }}>{profil.role}</strong></span> : null}
          </div>
        </div>

        {error && (
          <div style={{
            background: '#FCEBEB',
            color: '#A32D2D',
            borderRadius: '8px',
            padding: '10px 12px',
            border: '0.5px solid #F09595',
            fontSize: '13px',
            marginBottom: '10px'
          }}>
            {error}
          </div>
        )}

        {success && (
          <div style={{
            background: '#DCFCE7',
            color: '#166534',
            borderRadius: '8px',
            padding: '10px 12px',
            border: '0.5px solid #86EFAC',
            fontSize: '13px',
            marginBottom: '10px'
          }}>
            {success}
          </div>
        )}

        <div style={{
          background: 'white',
          borderRadius: '14px',
          border: `0.5px solid ${c.bordure}`,
          padding: '12px'
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '10px' }}>
            {clients.map((client) => {
              const checked = selectedClientIds.includes(client.id)
              return (
                <label
                  key={client.id}
                  style={{
                    border: `1px solid ${checked ? c.accent : c.bordure}`,
                    background: checked ? c.accentClair : 'white',
                    borderRadius: '10px',
                    padding: '10px 12px',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '8px',
                    cursor: 'pointer'
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleClient(client.id)}
                    style={{ marginTop: '2px' }}
                  />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: c.texte }}>
                      {client.nom_etablissement || client.nom || client.slug || client.id}
                    </div>
                    <div style={{ fontSize: '11px', color: c.texteMuted }}>
                      {client.slug ? `${client.slug} · ` : ''}{client.actif ? 'actif' : 'inactif'}
                    </div>
                  </div>
                </label>
              )
            })}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '14px', gap: '8px' }}>
            <button
              onClick={() => {
                setSelectedClientIds(initialClientIds)
                setError('')
                setSuccess('')
              }}
              disabled={saving || !dirty}
              style={{
                border: `0.5px solid ${c.bordure}`,
                background: 'white',
                color: c.texteMuted,
                borderRadius: '8px',
                padding: '8px 12px',
                cursor: (saving || !dirty) ? 'not-allowed' : 'pointer',
                fontSize: '13px'
              }}
            >
              Annuler
            </button>
            <button
              onClick={saveAcces}
              disabled={saving || !dirty}
              style={{
                border: 'none',
                background: (saving || !dirty) ? '#A5B4FC' : c.accent,
                color: 'white',
                borderRadius: '8px',
                padding: '8px 14px',
                cursor: (saving || !dirty) ? 'not-allowed' : 'pointer',
                fontSize: '13px',
                fontWeight: 600
              }}
            >
              {saving ? 'Enregistrement...' : 'Enregistrer les acces'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

