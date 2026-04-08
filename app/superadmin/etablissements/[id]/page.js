'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '../../../../lib/supabase'
import { isSuperadminEmail } from '../../../../lib/superadmin'
import { theme, Logo } from '../../../../lib/theme.jsx'
import { useIsMobile } from '../../../../lib/useIsMobile'
import ChefLoader from '../../../../components/ChefLoader'

const inputStyle = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: '8px',
  border: '0.5px solid #E2E8F0',
  fontSize: '14px',
  outline: 'none',
  background: 'white'
}

const labelStyle = {
  fontSize: '12px',
  fontWeight: 700,
  color: '#64748B',
  marginBottom: '6px',
  display: 'block',
  textTransform: 'uppercase',
  letterSpacing: '0.03em'
}

export default function SuperadminEtablissementDetailPage() {
  const router = useRouter()
  const params = useParams()
  const isMobile = useIsMobile()
  const clientId = String(params?.id || '')
  const c = theme.couleurs

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showSlowSavingLoader, setShowSlowSavingLoader] = useState(false)
  const [uploadingKbis, setUploadingKbis] = useState(false)
  const [uploadingRib, setUploadingRib] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [clientName, setClientName] = useState('')

  const [siret, setSiret] = useState('')
  const [numTva, setNumTva] = useState('')
  const [adresseSiege, setAdresseSiege] = useState('')
  const [codeNaf, setCodeNaf] = useState('')
  const [urlKbis, setUrlKbis] = useState('')
  const [urlRib, setUrlRib] = useState('')
  const [isNavigating, setIsNavigating] = useState(false)

  useEffect(() => {
    init()
  }, [clientId])

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

      let allowed = isSuperadminEmail((session.user?.email || '').toLowerCase().trim())
      if (!allowed) {
        const { data: me } = await supabase
          .from('profils')
          .select('is_superadmin')
          .eq('id', session.user.id)
          .single()
        allowed = !!me?.is_superadmin
      }
      if (!allowed) {
        router.push('/dashboard')
        return
      }

      const token = session.access_token
      const res = await fetch(`/api/superadmin/update-client?id=${encodeURIComponent(clientId)}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data?.error || 'Impossible de charger l’établissement.')
        return
      }

      const client = data?.client || {}
      setClientName(client.nom_etablissement || client.nom || client.id || '')
      setSiret(client.siret || '')
      setNumTva(client.num_tva || '')
      setAdresseSiege(client.adresse_siege || '')
      setCodeNaf(client.code_naf || '')
      setUrlKbis(client.url_kbis || '')
      setUrlRib(client.url_rib || '')
    } finally {
      setLoading(false)
    }
  }

  const uploadLegalDocument = async (file, type) => {
    if (!file || !clientId) return null
    const ext = file.name.includes('.') ? file.name.split('.').pop().toLowerCase() : 'pdf'
    const path = `${clientId}/${type}_${Date.now()}.${ext}`

    const { error: errUpload } = await supabase.storage
      .from('documents_legaux')
      .upload(path, file, {
        upsert: true,
        contentType: file.type || 'application/octet-stream'
      })
    if (errUpload) throw new Error(errUpload.message || 'Upload impossible')

    const { data: urlData } = supabase.storage.from('documents_legaux').getPublicUrl(path)
    return urlData?.publicUrl || null
  }

  const handleUploadKbis = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')
    setSuccess('')
    setUploadingKbis(true)
    try {
      const url = await uploadLegalDocument(file, 'kbis')
      if (url) {
        setUrlKbis(url)
        setSuccess('KBIS uploadé avec succès.')
      }
    } catch (err) {
      setError(err?.message || 'Erreur upload KBIS.')
    } finally {
      setUploadingKbis(false)
      e.target.value = ''
    }
  }

  const handleUploadRib = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')
    setSuccess('')
    setUploadingRib(true)
    try {
      const url = await uploadLegalDocument(file, 'rib')
      if (url) {
        setUrlRib(url)
        setSuccess('RIB uploadé avec succès.')
      }
    } catch (err) {
      setError(err?.message || 'Erreur upload RIB.')
    } finally {
      setUploadingRib(false)
      e.target.value = ''
    }
  }

  const save = async () => {
    setSaving(true)
    setShowSlowSavingLoader(false)
    setError('')
    setSuccess('')
    const timer = setTimeout(() => setShowSlowSavingLoader(true), 500)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData?.session?.access_token
      if (!token) {
        setError('Session expirée. Reconnectez-vous.')
        return
      }

      const res = await fetch('/api/superadmin/update-client', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          id: clientId,
          siret,
          num_tva: numTva,
          adresse_siege: adresseSiege,
          code_naf: codeNaf,
          url_kbis: urlKbis,
          url_rib: urlRib
        })
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data?.error || 'Erreur lors de la sauvegarde.')
        return
      }
      setSuccess('Informations légales mises à jour.')
    } finally {
      clearTimeout(timer)
      setSaving(false)
      setShowSlowSavingLoader(false)
    }
  }
  const handleNavigation = (url) => {
    setIsNavigating(true)
    router.push(url)
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: c.fond, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <ChefLoader />
      </div>
    )
  }
  if (isNavigating) {
    return (
      <div style={{ minHeight: '100vh', background: c.fond, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <ChefLoader message="Navigation en cours..." />
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: c.fond }}>
      <div style={{
        background: c.principal,
        borderBottom: '0.5px solid rgba(255,255,255,0.15)',
        padding: '0 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: '56px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Logo height={28} couleur="white" />
          <span style={{ color: 'rgba(255,255,255,0.3)' }}>|</span>
          <button
            onClick={() => handleNavigation('/superadmin')}
            style={{
              background: 'transparent',
              border: '0.5px solid rgba(255,255,255,0.25)',
              borderRadius: '8px',
              padding: '6px 10px',
              fontSize: '13px',
              cursor: 'pointer',
              color: 'rgba(255,255,255,0.8)'
            }}
          >
            ← Retour SuperAdmin
          </button>
        </div>
      </div>

      <div style={{ maxWidth: '980px', margin: '0 auto', padding: '20px' }}>
        <div style={{
          background: 'white',
          borderRadius: '12px',
          border: '0.5px solid #E2E8F0',
          padding: '18px',
          marginBottom: '12px'
        }}>
          <div style={{ fontSize: '20px', fontWeight: 700, color: c.texte }}>Informations Légales & KYC</div>
          <div style={{ fontSize: '13px', color: c.texteMuted, marginTop: '4px' }}>
            Établissement: {clientName || clientId}
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
          borderRadius: '12px',
          border: '0.5px solid #E2E8F0',
          padding: '16px'
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={labelStyle}>SIRET</label>
              <input
                value={siret}
                onChange={(e) => setSiret(e.target.value)}
                placeholder="14 chiffres"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>TVA Intracommunautaire</label>
              <input
                value={numTva}
                onChange={(e) => setNumTva(e.target.value)}
                placeholder="FRXX123456789"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Adresse du siège</label>
              <input
                value={adresseSiege}
                onChange={(e) => setAdresseSiege(e.target.value)}
                placeholder="Adresse complète"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Code NAF</label>
              <input
                value={codeNaf}
                onChange={(e) => setCodeNaf(e.target.value)}
                placeholder="Ex: 5610A"
                style={inputStyle}
              />
            </div>
          </div>

          <div style={{ height: '1px', background: '#E2E8F0', margin: '16px 0' }} />

          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '12px' }}>
            <div style={{ border: '0.5px solid #E2E8F0', borderRadius: '10px', padding: '12px' }}>
              <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '8px', color: c.texte }}>KBIS</div>
              <label
                style={{
                  display: 'inline-block',
                  border: '0.5px solid #E2E8F0',
                  borderRadius: '8px',
                  padding: '8px 10px',
                  fontSize: '13px',
                  cursor: uploadingKbis ? 'not-allowed' : 'pointer',
                  opacity: uploadingKbis ? 0.7 : 1
                }}
              >
                {uploadingKbis ? 'Upload KBIS...' : 'Uploader KBIS'}
                <input type="file" hidden onChange={handleUploadKbis} disabled={uploadingKbis} />
              </label>
              {urlKbis && (
                <a
                  href={urlKbis}
                  target="_blank"
                  rel="noreferrer"
                  style={{ marginLeft: '10px', fontSize: '13px', color: c.accent, textDecoration: 'underline' }}
                >
                  Voir le document
                </a>
              )}
            </div>

            <div style={{ border: '0.5px solid #E2E8F0', borderRadius: '10px', padding: '12px' }}>
              <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '8px', color: c.texte }}>RIB</div>
              <label
                style={{
                  display: 'inline-block',
                  border: '0.5px solid #E2E8F0',
                  borderRadius: '8px',
                  padding: '8px 10px',
                  fontSize: '13px',
                  cursor: uploadingRib ? 'not-allowed' : 'pointer',
                  opacity: uploadingRib ? 0.7 : 1
                }}
              >
                {uploadingRib ? 'Upload RIB...' : 'Uploader RIB'}
                <input type="file" hidden onChange={handleUploadRib} disabled={uploadingRib} />
              </label>
              {urlRib && (
                <a
                  href={urlRib}
                  target="_blank"
                  rel="noreferrer"
                  style={{ marginLeft: '10px', fontSize: '13px', color: c.accent, textDecoration: 'underline' }}
                >
                  Voir le document
                </a>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
            <button
              onClick={save}
              disabled={saving}
              style={{
                border: 'none',
                borderRadius: '10px',
                padding: '10px 14px',
                fontSize: '14px',
                background: saving ? '#A5B4FC' : c.accent,
                color: 'white',
                cursor: saving ? 'not-allowed' : 'pointer'
              }}
            >
              {saving ? 'Enregistrement...' : 'Enregistrer'}
            </button>
          </div>
          {showSlowSavingLoader && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
              <ChefLoader size={100} message="Sauvegarde en cours…" />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
