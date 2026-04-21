'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { isSuperadminEmail } from '../../lib/superadmin'
import { useRouter } from 'next/navigation'
import { useTheme } from '../../lib/useTheme'
import { useIsMobile } from '../../lib/useIsMobile'
import ChefLoader from '../../components/ChefLoader'
import ClientsList from './components/ClientsList'
import { MODULES_DISPONIBLES } from './components/ClientsList'
import ActivityDashboard from './components/ActivityDashboard'
import InviteModal from './components/InviteModal'

const COULEURS_PRESETS = [
  { label: 'Zinc/Indigo (défaut)', principale: '#18181B', accent: '#6366F1', fond: '#F4F4F5' },
  { label: 'Ardoise/Émeraude', principale: '#0F172A', accent: '#10B981', fond: '#F8FAFC' },
  { label: 'Stone/Orange', principale: '#1C1917', accent: '#F97316', fond: '#FAFAF9' },
  { label: 'Zinc/Rose', principale: '#18181B', accent: '#EC4899', fond: '#F4F4F5' },
  { label: 'Personnalisé', principale: '', accent: '', fond: '' },
]

export default function SuperAdminPage() {
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [authorized, setAuthorized] = useState(false)
  const [vue, setVue] = useState('liste')
  const [clientSelectionne, setClientSelectionne] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const router = useRouter()
  const { c } = useTheme()
  const isMobile = useIsMobile()

  // Form state
  const [nom, setNom] = useState('')
  const [nomEtablissement, setNomEtablissement] = useState('')
  const [slug, setSlug] = useState('')
  const [adresse, setAdresse] = useState('')
  const [modulesActifs, setModulesActifs] = useState(['fiches', 'sous-fiches', 'menus', 'bar', 'avis', 'recap', 'ingredients'])
  const [presetCouleur, setPresetCouleur] = useState(0)
  const [couleurPrincipale, setCouleurPrincipale] = useState('#18181B')
  const [couleurAccent, setCouleurAccent] = useState('#6366F1')
  const [couleurFond, setCouleurFond] = useState('#F4F4F5')
  const [logoFile, setLogoFile] = useState(null)
  const [logoPreview, setLogoPreview] = useState(null)
  const [logoExistant, setLogoExistant] = useState(null)
  const [actif, setActif] = useState(true)
  const [seuilVertCuisine, setSeuilVertCuisine] = useState('28')
  const [seuilOrangeCuisine, setSeuilOrangeCuisine] = useState('35')
  const [seuilVertBoissons, setSeuilVertBoissons] = useState('22')
  const [seuilOrangeBoissons, setSeuilOrangeBoissons] = useState('28')

  // Invite modal state
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [inviteClient, setInviteClient] = useState(null)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteNomComplet, setInviteNomComplet] = useState('')
  const [inviteSending, setInviteSending] = useState(false)

  // Navigation & tabs
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [isNavigating, setIsNavigating] = useState(false)
  const [onglet, setOnglet] = useState('gestion')
  const [activityData, setActivityData] = useState(null)
  const [activityLoading, setActivityLoading] = useState(false)

  useEffect(() => { checkAuth() }, [])

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.push('/'); return }
    let userEmail = (session.user?.email || '').toLowerCase().trim()
    if (!userEmail) {
      const { data: userData } = await supabase.auth.getUser()
      userEmail = (userData?.user?.email || '').toLowerCase().trim()
    }
    if (isSuperadminEmail(userEmail)) { setAuthorized(true); loadClients(); return }
    const { data: profil } = await supabase.from('profils').select('is_superadmin').eq('id', session.user.id).single()
    if (!profil?.is_superadmin) { router.push('/dashboard'); return }
    setAuthorized(true)
    loadClients()
  }

  const loadClients = async () => {
    const { data } = await supabase.from('clients').select('*').order('created_at', { ascending: false })
    setClients(data || [])
    setLoading(false)
  }

  const handleLogout = async () => {
    if (!window.confirm('Êtes-vous sûr de vouloir vous déconnecter ?')) return
    await supabase.auth.signOut()
    router.push('/login')
  }

  const handleNavigation = (url) => { setIsNavigating(true); router.push(url) }

  const loadActivity = async (clientFilter, userFilter, deviceFilter) => {
    setActivityLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const params = new URLSearchParams()
      if (clientFilter) params.set('clientId', clientFilter)
      if (userFilter) params.set('userId', userFilter)
      if (deviceFilter) params.set('device', deviceFilter)
      const res = await fetch(`/api/superadmin/activity-logs?${params}`, {
        headers: { Authorization: `Bearer ${session?.access_token}` }
      })
      const data = await res.json()
      if (res.ok) setActivityData(data)
    } catch (err) { console.error('loadActivity error:', err) }
    finally { setActivityLoading(false) }
  }

  const basculerOnglet = (nouvelOnglet) => {
    setOnglet(nouvelOnglet)
    if (nouvelOnglet === 'activite' && !activityData) loadActivity('', '', '')
  }

  const resetForm = () => {
    setNom(''); setNomEtablissement(''); setSlug(''); setAdresse('')
    setModulesActifs(['fiches', 'sous-fiches', 'menus', 'bar', 'avis', 'recap', 'ingredients'])
    setPresetCouleur(0); setCouleurPrincipale('#18181B'); setCouleurAccent('#6366F1'); setCouleurFond('#F4F4F5')
    setLogoFile(null); setLogoPreview(null); setLogoExistant(null); setActif(true)
    setSeuilVertCuisine('28'); setSeuilOrangeCuisine('35'); setSeuilVertBoissons('22'); setSeuilOrangeBoissons('28')
    setError(''); setSuccess('')
  }

  const ouvrirModifier = (client) => {
    setClientSelectionne(client)
    setNom(client.nom || ''); setNomEtablissement(client.nom_etablissement || '')
    setSlug(client.slug || ''); setAdresse(client.adresse || '')
    setModulesActifs(client.modules_actifs || ['fiches'])
    setCouleurPrincipale(client.couleur_principale || '#18181B')
    setCouleurAccent(client.couleur_accent || '#6366F1')
    setCouleurFond(client.couleur_fond || '#F4F4F5')
    setLogoExistant(client.logo_url || null); setLogoPreview(client.logo_url || null)
    setActif(client.actif !== false)
    setSeuilVertCuisine(String(client.seuil_vert_cuisine || '28'))
    setSeuilOrangeCuisine(String(client.seuil_orange_cuisine || '35'))
    setSeuilVertBoissons(String(client.seuil_vert_boissons || '22'))
    setSeuilOrangeBoissons(String(client.seuil_orange_boissons || '28'))
    setError(''); setSuccess(''); setVue('modifier')
  }

  const uploadLogo = async (clientId) => {
    if (!logoFile) return logoExistant
    const ext = logoFile.name.split('.').pop()
    const path = `${clientId}/logo.${ext}`
    const { error: errUpload } = await supabase.storage.from('clients-logos').upload(path, logoFile, { upsert: true })
    if (errUpload) { console.error('Logo upload error:', errUpload); return logoExistant }
    const { data: urlData } = supabase.storage.from('clients-logos').getPublicUrl(path)
    return urlData.publicUrl
  }

  const saveClient = async () => {
    if (!nom || !slug || !nomEtablissement) { setError('Nom, slug et nom établissement sont obligatoires'); return }
    setSaving(true); setError(''); setSuccess('')

    const payload = {
      nom, nom_etablissement: nomEtablissement,
      slug: slug.toLowerCase().replace(/\s+/g, '-'),
      adresse, actif,
      couleur_principale: couleurPrincipale, couleur_accent: couleurAccent, couleur_fond: couleurFond,
      modules_actifs: modulesActifs,
      seuil_vert_cuisine: parseFloat(seuilVertCuisine), seuil_orange_cuisine: parseFloat(seuilOrangeCuisine),
      seuil_vert_boissons: parseFloat(seuilVertBoissons), seuil_orange_boissons: parseFloat(seuilOrangeBoissons),
    }

    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) { setError('Session expirée. Reconnectez-vous.'); setSaving(false); return }
    const authHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` }

    if (vue === 'nouveau') {
      const res = await fetch('/api/superadmin/create-client', {
        method: 'POST', headers: authHeaders, body: JSON.stringify(payload),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setError('Erreur : ' + (json?.error || 'création impossible')); setSaving(false); return }
      const newClient = json?.client
      if (logoFile && newClient?.id) {
        const logoUrl = await uploadLogo(newClient.id)
        await fetch('/api/superadmin/update-client-settings', {
          method: 'POST', headers: authHeaders,
          body: JSON.stringify({ id: newClient.id, logo_url: logoUrl }),
        })
      }
      setSuccess(`✓ Établissement "${nomEtablissement}" créé avec succès !`)
    } else {
      let logoUrl = logoExistant
      if (logoFile) logoUrl = await uploadLogo(clientSelectionne.id)
      const res = await fetch('/api/superadmin/update-client-settings', {
        method: 'POST', headers: authHeaders,
        body: JSON.stringify({ id: clientSelectionne.id, ...payload, logo_url: logoUrl }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setError('Erreur : ' + (json?.error || 'mise à jour impossible')); setSaving(false); return }
      setSuccess(`✓ Établissement "${nomEtablissement}" mis à jour !`)
    }

    await loadClients()
    try { window.dispatchEvent(new Event('tenant_refresh')) } catch {}
    resetForm(); setVue('liste'); setSaving(false)
  }

  const toggleActifClient = async (clientId, actifActuel) => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) return
    await fetch('/api/superadmin/update-client-settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ id: clientId, actif: !actifActuel }),
    })
    await loadClients()
  }

  const handleInviteAdmin = async () => {
    if (!inviteEmail.trim() || !inviteNomComplet.trim() || !inviteClient?.id) return
    setInviteSending(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) { alert('Session expirée.'); return }
      const res = await fetch('/api/invite-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ email: inviteEmail.trim(), nom_complet: inviteNomComplet.trim(), client_id: inviteClient.id })
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { alert(typeof data.error === 'string' ? data.error : 'Erreur lors de l\'invitation.'); return }
      alert('Invitation envoyée avec succès !')
      setShowInviteModal(false); setInviteClient(null); setInviteEmail(''); setInviteNomComplet('')
    } finally { setInviteSending(false) }
  }

  // ── Loading states ───────────────────────────────────────────────────────
  if (!authorized || loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F4F4F5' }}>
      <ChefLoader message="Vérification des accès..." />
    </div>
  )
  if (isNavigating) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F4F4F5' }}>
      <ChefLoader message="Navigation en cours..." />
    </div>
  )

  const inputStyle = { width: '100%', padding: '10px 12px', borderRadius: '8px', border: '0.5px solid #E4E4E7', fontSize: '14px', outline: 'none', color: '#18181B', background: 'white' }
  const labelStyle = { fontSize: '12px', color: '#71717A', fontWeight: '500', display: 'block', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }

  return (
    <div style={{ minHeight: '100vh', background: '#F4F4F5' }}>

      {/* ── Navbar ── */}
      <div style={{
        background: '#18181B', borderBottom: '0.5px solid rgba(255,255,255,0.06)',
        padding: isMobile ? '10px 14px' : '0 24px',
        minHeight: '56px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: '10px',
        position: 'sticky', top: 0, zIndex: 100
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <div style={{ width: '28px', height: '28px', borderRadius: '6px', background: '#6366F1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', flexShrink: 0 }}>⚡</div>
          <span style={{ fontSize: '14px', fontWeight: '600', color: 'white', whiteSpace: 'nowrap' }}>Super Admin</span>
          <div style={{ padding: '2px 10px', borderRadius: '20px', background: 'rgba(99,102,241,0.2)', border: '0.5px solid rgba(99,102,241,0.3)' }}>
            <span style={{ fontSize: '11px', color: '#A5B4FC', fontWeight: '500' }}>Skalcook</span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: isMobile ? 'flex-start' : 'flex-end' }}>
          <div style={{ display: 'flex', background: 'rgba(255,255,255,0.06)', borderRadius: '8px', padding: '3px', border: '0.5px solid rgba(255,255,255,0.1)' }}>
            {[{ id: 'gestion', label: '🏗 Gestion' }, { id: 'activite', label: '📊 Activité' }].map(tab => (
              <button key={tab.id} onClick={() => basculerOnglet(tab.id)} style={{
                background: onglet === tab.id ? 'rgba(99,102,241,0.85)' : 'transparent',
                color: onglet === tab.id ? 'white' : 'rgba(255,255,255,0.55)',
                border: 'none', borderRadius: '6px', padding: '5px 12px', fontSize: '12px',
                fontWeight: onglet === tab.id ? '600' : '400', cursor: 'pointer', whiteSpace: 'nowrap'
              }}>{tab.label}</button>
            ))}
          </div>
          {onglet === 'gestion' && vue !== 'liste' && (
            <button onClick={() => { setVue('liste'); resetForm() }} style={{
              background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)',
              border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '7px 12px', fontSize: '13px', cursor: 'pointer', whiteSpace: 'nowrap'
            }}>← Retour</button>
          )}
          <button onClick={() => handleNavigation('/superadmin/prospects')} style={{ background: 'rgba(99,102,241,0.2)', color: '#A5B4FC', border: '0.5px solid rgba(99,102,241,0.3)', borderRadius: '8px', padding: '7px 12px', fontSize: '13px', cursor: 'pointer', whiteSpace: 'nowrap' }}>👥 Prospects</button>
          <button onClick={() => handleNavigation('/superadmin/utilisateurs')} style={{ background: 'rgba(14,165,233,0.2)', color: '#BAE6FD', border: '0.5px solid rgba(14,165,233,0.35)', borderRadius: '8px', padding: '7px 12px', fontSize: '13px', cursor: 'pointer', whiteSpace: 'nowrap' }}>🧑‍💼 Utilisateurs</button>
          <button onClick={handleLogout} style={{ background: 'transparent', color: '#E11D48', border: '0.5px solid #FDA4AF', borderRadius: '8px', padding: '6px 12px', fontSize: '13px', cursor: 'pointer', whiteSpace: 'nowrap' }}>🚪 Déconnexion</button>
        </div>
      </div>

      <div style={{ padding: isMobile ? '16px' : '32px', maxWidth: '1000px', margin: '0 auto' }}>

        {/* ── Liste des clients ── */}
        {onglet === 'gestion' && vue === 'liste' && (
          <ClientsList
            clients={clients} isMobile={isMobile} success={success}
            onNouveauClick={() => { resetForm(); setVue('nouveau') }}
            onModifierClick={ouvrirModifier}
            onToggleActif={toggleActifClient}
            onNavigate={handleNavigation}
            onInviteAdmin={(client) => { setInviteClient(client); setInviteEmail(''); setInviteNomComplet(''); setShowInviteModal(true) }}
          />
        )}

        {/* ── Formulaire création/modification ── */}
        {onglet === 'gestion' && (vue === 'nouveau' || vue === 'modifier') && (
          <>
            <h1 style={{ fontSize: 'clamp(1.5rem, 5vw, 2.5rem)', fontWeight: '600', color: '#18181B', marginBottom: '8px' }}>
              {vue === 'nouveau' ? 'Nouvel établissement' : `Modifier — ${clientSelectionne?.nom_etablissement}`}
            </h1>
            <p style={{ fontSize: '14px', color: '#71717A', marginBottom: '28px' }}>
              {vue === 'nouveau' ? 'Configurez le nouvel espace client.' : 'Mettez à jour les informations de cet établissement.'}
            </p>

            {error && <div style={{ background: '#FEE2E2', color: '#DC2626', borderRadius: '8px', padding: '12px 16px', fontSize: '13px', marginBottom: '20px', border: '0.5px solid #FECACA' }}>{error}</div>}
            {success && <div style={{ background: '#DCFCE7', color: '#166534', borderRadius: '8px', padding: '12px 16px', fontSize: '13px', marginBottom: '20px', border: '0.5px solid #BBF7D0' }}>{success}</div>}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Infos générales */}
              <div style={{ background: 'white', borderRadius: '12px', border: '0.5px solid #E4E4E7', padding: '24px' }}>
                <div style={{ fontSize: '12px', fontWeight: '600', color: '#71717A', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '20px' }}>Informations générales</div>
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '16px' }}>
                  <div><label style={labelStyle}>Nom interne *</label><input value={nom} onChange={e => setNom(e.target.value)} placeholder="Ex : hotel-la-fantaisie" style={inputStyle} /><div style={{ fontSize: '11px', color: '#71717A', marginTop: '4px' }}>Identifiant interne</div></div>
                  <div><label style={labelStyle}>Nom affiché *</label><input value={nomEtablissement} onChange={e => setNomEtablissement(e.target.value)} placeholder="Ex : Hôtel La Fantaisie" style={inputStyle} /><div style={{ fontSize: '11px', color: '#71717A', marginTop: '4px' }}>Affiché dans la navbar</div></div>
                  <div><label style={labelStyle}>Slug * (sous-domaine)</label><input value={slug} onChange={e => setSlug(e.target.value.toLowerCase().replace(/\s+/g, '-'))} placeholder="Ex : la-fantaisie" style={inputStyle} /><div style={{ fontSize: '11px', color: '#71717A', marginTop: '4px' }}>URL : <code style={{ background: '#F4F4F5', padding: '1px 6px', borderRadius: '4px' }}>{slug || 'votre-slug'}.skalcook.com</code></div></div>
                  <div><label style={labelStyle}>Adresse</label><input value={adresse} onChange={e => setAdresse(e.target.value)} placeholder="Ex : 24 Rue Cadet, Paris 9ème" style={inputStyle} /></div>
                </div>
                <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div onClick={() => setActif(!actif)} style={{ width: '40px', height: '22px', borderRadius: '11px', background: actif ? '#6366F1' : '#E4E4E7', position: 'relative', cursor: 'pointer' }}>
                    <div style={{ position: 'absolute', top: '3px', left: actif ? '21px' : '3px', width: '16px', height: '16px', borderRadius: '50%', background: 'white', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
                  </div>
                  <span style={{ fontSize: '14px', color: '#18181B', fontWeight: '500' }}>{actif ? 'Établissement actif' : 'Établissement inactif'}</span>
                </div>
              </div>

              {/* Logo */}
              <div style={{ background: 'white', borderRadius: '12px', border: '0.5px solid #E4E4E7', padding: '24px' }}>
                <div style={{ fontSize: '12px', fontWeight: '600', color: '#71717A', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '20px' }}>Logo</div>
                <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
                  {logoPreview ? (
                    <div style={{ position: 'relative', flexShrink: 0 }}>
                      <img src={logoPreview} alt="Logo" style={{ width: '80px', height: '80px', objectFit: 'contain', borderRadius: '10px', border: '0.5px solid #E4E4E7', background: '#F4F4F5', padding: '8px' }} />
                      <button onClick={() => { setLogoFile(null); setLogoPreview(null) }} style={{ position: 'absolute', top: '-8px', right: '-8px', background: '#DC2626', color: 'white', border: 'none', borderRadius: '50%', width: '20px', height: '20px', fontSize: '12px', cursor: 'pointer' }}>×</button>
                    </div>
                  ) : (
                    <div style={{ width: '80px', height: '80px', borderRadius: '10px', border: '1px dashed #E4E4E7', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F4F4F5', flexShrink: 0, fontSize: '28px' }}>🏨</div>
                  )}
                  <div style={{ flex: 1 }}>
                    <input type="file" accept="image/*" onChange={e => { const f = e.target.files[0]; if (f) { setLogoFile(f); setLogoPreview(URL.createObjectURL(f)) } }}
                      style={{ width: '100%', padding: '10px 12px', border: '0.5px solid #6366F1', borderRadius: '8px', fontSize: '13px', background: '#EEF2FF', cursor: 'pointer' }} />
                    <div style={{ fontSize: '11px', color: '#71717A', marginTop: '6px' }}>PNG, SVG, WEBP recommandés</div>
                  </div>
                </div>
              </div>

              {/* Couleurs */}
              <div style={{ background: 'white', borderRadius: '12px', border: '0.5px solid #E4E4E7', padding: '24px' }}>
                <div style={{ fontSize: '12px', fontWeight: '600', color: '#71717A', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '20px' }}>Palette de couleurs</div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '20px' }}>
                  {COULEURS_PRESETS.map((preset, i) => (
                    <button key={i} onClick={() => { setPresetCouleur(i); if (preset.principale) setCouleurPrincipale(preset.principale); if (preset.accent) setCouleurAccent(preset.accent); if (preset.fond) setCouleurFond(preset.fond) }} style={{
                      display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', borderRadius: '8px', cursor: 'pointer',
                      border: presetCouleur === i ? '1.5px solid #6366F1' : '0.5px solid #E4E4E7',
                      background: presetCouleur === i ? '#EEF2FF' : 'white', fontSize: '12px', color: presetCouleur === i ? '#4338CA' : '#71717A'
                    }}>
                      <div style={{ display: 'flex', gap: '3px' }}>
                        {preset.principale && <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: preset.principale }} />}
                        {preset.accent && <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: preset.accent }} />}
                        {preset.fond && <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: preset.fond, border: '0.5px solid #E4E4E7' }} />}
                      </div>
                      {preset.label}
                    </button>
                  ))}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: '16px' }}>
                  {[
                    { label: 'Couleur principale', value: couleurPrincipale, setter: setCouleurPrincipale, desc: 'Navbar, texte' },
                    { label: 'Couleur accent', value: couleurAccent, setter: setCouleurAccent, desc: 'Boutons CTA' },
                    { label: 'Couleur fond', value: couleurFond, setter: setCouleurFond, desc: 'Fond de page' },
                  ].map((item) => (
                    <div key={item.label}>
                      <label style={labelStyle}>{item.label}</label>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <input type="color" value={item.value} onChange={e => { item.setter(e.target.value); setPresetCouleur(4) }} style={{ width: '44px', height: '44px', border: 'none', borderRadius: '8px', cursor: 'pointer', padding: '2px' }} />
                        <input type="text" value={item.value} onChange={e => { item.setter(e.target.value); setPresetCouleur(4) }} style={{ flex: 1, padding: '10px 12px', borderRadius: '8px', border: '0.5px solid #E4E4E7', fontSize: '13px', fontFamily: 'monospace', outline: 'none' }} />
                      </div>
                      <div style={{ fontSize: '11px', color: '#71717A', marginTop: '4px' }}>{item.desc}</div>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: '20px', borderRadius: '10px', overflow: 'hidden', border: '0.5px solid #E4E4E7' }}>
                  <div style={{ background: couleurPrincipale, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ width: '20px', height: '20px', borderRadius: '4px', background: couleurAccent }} />
                    <span style={{ fontSize: '13px', color: 'white', fontWeight: '500' }}>{nomEtablissement || 'Nom établissement'}</span>
                    <div style={{ marginLeft: 'auto', padding: '4px 10px', borderRadius: '6px', background: couleurAccent }}>
                      <span style={{ fontSize: '11px', color: 'white', fontWeight: '500' }}>+ Nouvelle fiche</span>
                    </div>
                  </div>
                  <div style={{ background: couleurFond, padding: '12px 16px' }}><span style={{ fontSize: '12px', color: '#71717A' }}>Aperçu navbar</span></div>
                </div>
              </div>

              {/* Modules */}
              <div style={{ background: 'white', borderRadius: '12px', border: '0.5px solid #E4E4E7', padding: '24px' }}>
                <div style={{ fontSize: '12px', fontWeight: '600', color: '#71717A', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '20px' }}>Modules actifs</div>
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: '10px' }}>
                  {MODULES_DISPONIBLES.map((mod) => {
                    const isActive = modulesActifs.includes(mod.id)
                    return (
                      <div key={mod.id} onClick={() => setModulesActifs(prev => prev.includes(mod.id) ? prev.filter(m => m !== mod.id) : [...prev, mod.id])} style={{
                        padding: '14px 12px', borderRadius: '10px', cursor: 'pointer',
                        border: isActive ? '1.5px solid #6366F1' : '0.5px solid #E4E4E7', background: isActive ? '#EEF2FF' : 'white',
                        display: 'flex', alignItems: 'center', gap: '10px'
                      }}>
                        <span style={{ fontSize: '20px' }}>{mod.emoji}</span>
                        <div style={{ fontSize: '13px', fontWeight: isActive ? '500' : '400', color: isActive ? '#4338CA' : '#18181B' }}>{mod.label}</div>
                        <div style={{ marginLeft: 'auto', width: '16px', height: '16px', borderRadius: '50%', background: isActive ? '#6366F1' : '#E4E4E7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {isActive && <span style={{ fontSize: '10px', color: 'white' }}>✓</span>}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Seuils food cost */}
              <div style={{ background: 'white', borderRadius: '12px', border: '0.5px solid #E4E4E7', padding: '24px' }}>
                <div style={{ fontSize: '12px', fontWeight: '600', color: '#71717A', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '20px' }}>Seuils food cost</div>
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: '16px' }}>
                  {[
                    { label: 'Seuil vert cuisine', value: seuilVertCuisine, setter: setSeuilVertCuisine, color: '#16A34A' },
                    { label: 'Seuil orange cuisine', value: seuilOrangeCuisine, setter: setSeuilOrangeCuisine, color: '#D97706' },
                    { label: 'Seuil vert boissons', value: seuilVertBoissons, setter: setSeuilVertBoissons, color: '#16A34A' },
                    { label: 'Seuil orange boissons', value: seuilOrangeBoissons, setter: setSeuilOrangeBoissons, color: '#D97706' },
                  ].map((item) => (
                    <div key={item.label}>
                      <label style={{ ...labelStyle, color: item.color }}>{item.label}</label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <input type="number" value={item.value} onChange={e => item.setter(e.target.value)} min="0" max="100" step="1" style={{ ...inputStyle, textAlign: 'center' }} />
                        <span style={{ fontSize: '16px', color: '#71717A', flexShrink: 0 }}>%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', paddingBottom: '40px' }}>
                <button onClick={() => { setVue('liste'); resetForm() }} style={{ background: 'white', color: '#71717A', border: '0.5px solid #E4E4E7', borderRadius: '8px', padding: '12px 24px', fontSize: '14px', cursor: 'pointer' }}>Annuler</button>
                <button onClick={saveClient} disabled={saving} style={{
                  background: saving ? '#A5B4FC' : '#6366F1', color: 'white', border: 'none', borderRadius: '8px',
                  padding: '12px 28px', fontSize: '14px', fontWeight: '500', cursor: saving ? 'not-allowed' : 'pointer'
                }}>{saving ? 'Enregistrement...' : vue === 'nouveau' ? 'Créer l\'établissement' : 'Sauvegarder'}</button>
              </div>
            </div>
          </>
        )}

        {/* ── Onglet Activité ── */}
        {onglet === 'activite' && (
          <ActivityDashboard
            activityData={activityData}
            activityLoading={activityLoading}
            isMobile={isMobile}
            onLoadActivity={loadActivity}
          />
        )}
      </div>

      {/* ── Modale invitation ── */}
      {showInviteModal && (
        <InviteModal
          client={inviteClient}
          email={inviteEmail}
          nom={inviteNomComplet}
          sending={inviteSending}
          onEmailChange={setInviteEmail}
          onNomChange={setInviteNomComplet}
          onSubmit={handleInviteAdmin}
          onClose={() => { setShowInviteModal(false); setInviteClient(null) }}
        />
      )}
    </div>
  )
}
