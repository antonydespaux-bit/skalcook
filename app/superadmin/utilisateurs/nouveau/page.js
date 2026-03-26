'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../../../lib/supabase'
import { isSuperadminEmail } from '../../../../lib/superadmin'
import { theme, Logo, LogoBand } from '../../../../lib/theme.jsx'
import ChefLoader from '../../../../components/ChefLoader'
const ROLES = ['admin', 'consultant', 'directeur', 'cuisine', 'bar']

export default function NouveauUtilisateurPage() {
  const router = useRouter()
  const c = theme.couleurs

  const [authorized, setAuthorized] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [clients, setClients] = useState([])
  const [email, setEmail] = useState('')
  const [nom, setNom] = useState('')
  const [role, setRole] = useState('consultant')
  const [telephone, setTelephone] = useState('')
  const [siteWeb, setSiteWeb] = useState('')
  const [siretPersonnel, setSiretPersonnel] = useState('')
  const [adressePro, setAdressePro] = useState('')
  const [selectedClientIds, setSelectedClientIds] = useState([])
  const [createdUserId, setCreatedUserId] = useState(null)

  useEffect(() => {
    const init = async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession()
        const session = sessionData?.session
        if (!session) {
          router.push('/login')
          return
        }

        const sessionEmail = (session.user?.email || '').toLowerCase().trim()
        let isAllowed = isSuperadminEmail(sessionEmail)

        if (!isAllowed) {
          const { data: profil } = await supabase
            .from('profils')
            .select('is_superadmin')
            .eq('id', session.user.id)
            .single()
          isAllowed = !!profil?.is_superadmin
        }

        if (!isAllowed) {
          router.push('/dashboard')
          return
        }
        setAuthorized(true)

        const { data: clientsData, error: clientsErr } = await supabase
          .from('clients')
          .select('id, nom_etablissement, nom, slug, actif')
          .order('nom_etablissement', { ascending: true })

        if (clientsErr) {
          setError(`Impossible de charger les établissements : ${clientsErr.message}`)
          return
        }
        setClients(clientsData || [])
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [])

  const dirtyAccessCount = useMemo(() => selectedClientIds.length, [selectedClientIds])

  const toggleClient = (clientId) => {
    setSelectedClientIds((prev) =>
      prev.includes(clientId)
        ? prev.filter((id) => id !== clientId)
        : [...prev, clientId]
    )
  }

  const handleCreate = async () => {
    if (!email.trim() || !nom.trim() || !role.trim()) {
      setError('Email, nom et rôle sont obligatoires.')
      return
    }

    setSaving(true)
    setError('')
    setSuccess('')
    setCreatedUserId(null)

    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData?.session?.access_token
      if (!token) {
        setError('Session expirée. Reconnectez-vous.')
        return
      }

      const res = await fetch('/api/superadmin/create-global-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          email: email.trim(),
          nom: nom.trim(),
          role,
          telephone: telephone.trim(),
          site_web: siteWeb.trim(),
          siret_personnel: siretPersonnel.trim(),
          adresse_pro: adressePro.trim(),
          client_ids: selectedClientIds
        })
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : 'Erreur lors de la création.')
        return
      }

      setSuccess('Utilisateur global créé avec succès.')
      setCreatedUserId(data.user_id || null)
      setEmail('')
      setNom('')
      setTelephone('')
      setSiteWeb('')
      setSiretPersonnel('')
      setAdressePro('')
      setSelectedClientIds([])
    } finally {
      setSaving(false)
    }
  }

  if (!authorized || loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: c.fond }}>
        <ChefLoader />
      </div>
    )
  }

  const inputStyle = {
    width: '100%', padding: '10px 12px', borderRadius: '8px',
    border: `0.5px solid ${c.bordure}`, fontSize: '14px',
    outline: 'none', color: c.texte, background: 'white'
  }
  const labelStyle = {
    fontSize: '12px', color: c.texteMuted, fontWeight: 600, marginBottom: '6px', display: 'block',
    textTransform: 'uppercase', letterSpacing: '0.04em'
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
      </div>

      <div style={{ maxWidth: '980px', margin: '0 auto', padding: '20px' }}>
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
          <div style={{ fontSize: '20px', fontWeight: 700, color: c.texte, marginBottom: '6px' }}>
            Nouvel utilisateur global
          </div>
          <div style={{ fontSize: '13px', color: c.texteMuted }}>
            Créez un compte transverse (client_id NULL) et attribuez ses accès établissements via `acces_clients`.
          </div>
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
            <div style={{ marginTop: '6px' }}>
              Un email de réinitialisation a été envoyé à l’utilisateur pour définir son mot de passe.
            </div>
            {createdUserId ? (
              <div style={{ marginTop: '8px' }}>
                <button
                  onClick={() => router.push(`/superadmin/utilisateurs/${createdUserId}`)}
                  style={{
                    border: 'none', background: '#6366F1', color: 'white', borderRadius: '8px',
                    padding: '7px 10px', fontSize: '12px', cursor: 'pointer'
                  }}
                >
                  Ouvrir la gestion des accès
                </button>
              </div>
            ) : null}
          </div>
        )}

        <div style={{
          background: 'white',
          borderRadius: '14px',
          border: `0.5px solid ${c.bordure}`,
          padding: '16px'
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
            <div>
              <label style={labelStyle}>Email *</label>
              <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="utilisateur@skalcook.com" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Nom complet *</label>
              <input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Prénom Nom" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Role *</label>
              <select value={role} onChange={(e) => setRole(e.target.value)} style={inputStyle}>
                {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          </div>

          {role === 'consultant' && (
            <div style={{ marginBottom: '14px' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: c.texteMuted, textTransform: 'uppercase', marginBottom: '8px', letterSpacing: '0.04em' }}>
                Informations Professionnelles
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={labelStyle}>Téléphone</label>
                  <input value={telephone} onChange={(e) => setTelephone(e.target.value)} placeholder="+33..." style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Site Web</label>
                  <input value={siteWeb} onChange={(e) => setSiteWeb(e.target.value)} placeholder="https://..." style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>SIRET Personnel</label>
                  <input value={siretPersonnel} onChange={(e) => setSiretPersonnel(e.target.value)} placeholder="14 chiffres" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Adresse Professionnelle</label>
                  <input value={adressePro} onChange={(e) => setAdressePro(e.target.value)} placeholder="Adresse pro" style={inputStyle} />
                </div>
              </div>
            </div>
          )}

          <div style={{ fontSize: '12px', fontWeight: 700, color: c.texteMuted, textTransform: 'uppercase', marginBottom: '8px' }}>
            Établissements autorisés ({dirtyAccessCount})
          </div>
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

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '14px' }}>
            <button
              onClick={handleCreate}
              disabled={saving}
              style={{
                border: 'none',
                background: saving ? '#A5B4FC' : c.accent,
                color: 'white',
                borderRadius: '8px',
                padding: '10px 14px',
                fontSize: '13px',
                fontWeight: 700,
                cursor: saving ? 'not-allowed' : 'pointer'
              }}
            >
              {saving ? 'Création...' : 'Créer l’utilisateur'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

