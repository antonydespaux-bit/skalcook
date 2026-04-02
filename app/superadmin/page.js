'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { isSuperadminEmail } from '../../lib/superadmin'
import { useRouter } from 'next/navigation'
import { useTheme } from '../../lib/useTheme'
import { useIsMobile } from '../../lib/useIsMobile'
import ChefLoader from '../../components/ChefLoader'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

const MODULES_DISPONIBLES = [
  { id: 'fiches', label: 'Fiches techniques', emoji: '📝' },
  { id: 'sous-fiches', label: 'Sous-fiches', emoji: '🔗' },
  { id: 'menus', label: 'Menus', emoji: '📋' },
  { id: 'bar', label: 'Module Bar', emoji: '🍸' },
  { id: 'avis', label: 'Avis clients', emoji: '⭐' },
  { id: 'recap', label: 'Récap food cost', emoji: '📊' },
  { id: 'ingredients', label: 'Ingrédients', emoji: '🥦' },
  { id: 'ardoise', label: 'Ardoise', emoji: '🖊️' },
  { id: 'cartes', label: 'Cartes', emoji: '🍽️' },
  { id: 'gestion', label: 'Gestion', emoji: '📦' },
]

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
  const [vue, setVue] = useState('liste') // 'liste' | 'nouveau' | 'modifier'
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
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [inviteClient, setInviteClient] = useState(null)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteNomComplet, setInviteNomComplet] = useState('')
  const [inviteSending, setInviteSending] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [isNavigating, setIsNavigating] = useState(false)
  const [onglet, setOnglet] = useState('gestion') // 'gestion' | 'activite'
  const [activityData, setActivityData] = useState(null)
  const [activityLoading, setActivityLoading] = useState(false)
  const [filterClient, setFilterClient] = useState('')
  const [filterUser, setFilterUser] = useState('')
  const [filterDevice, setFilterDevice] = useState('')

  useEffect(() => {
    checkAuth()
  }, [])

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.push('/'); return }
    let userEmail = (session.user?.email || '').toLowerCase().trim()
    if (!userEmail) {
      const { data: userData } = await supabase.auth.getUser()
      userEmail = (userData?.user?.email || '').toLowerCase().trim()
    }
    if (isSuperadminEmail(userEmail)) {
      setAuthorized(true)
      loadClients()
      return
    }

    const { data: profil } = await supabase
      .from('profils')
      .select('is_superadmin')
      .eq('id', session.user.id)
      .single()

    if (!profil?.is_superadmin) {
      router.push('/dashboard')
      return
    }

    setAuthorized(true)
    loadClients()
  }

  const loadClients = async () => {
    const { data } = await supabase
      .from('clients')
      .select('*')
      .order('created_at', { ascending: false })
    setClients(data || [])
    setLoading(false)
  }

  const handleLogout = async () => {
    const ok = window.confirm('Êtes-vous sûr de vouloir vous déconnecter ?')
    if (!ok) return
    await supabase.auth.signOut()
    router.push('/login')
  }

  const handleNavigation = (url) => {
    setIsNavigating(true)
    router.push(url)
  }

  const loadActivity = async (clientFilter, userFilter, deviceFilter) => {
    setActivityLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      const params = new URLSearchParams()
      if (clientFilter) params.set('clientId', clientFilter)
      if (userFilter) params.set('userId', userFilter)
      if (deviceFilter) params.set('device', deviceFilter)
      const res = await fetch(`/api/superadmin/activity-logs?${params}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      if (res.ok) setActivityData(data)
    } catch (err) {
      console.error('loadActivity error:', err)
    } finally {
      setActivityLoading(false)
    }
  }

  const basculerOnglet = (nouvelOnglet) => {
    setOnglet(nouvelOnglet)
    if (nouvelOnglet === 'activite' && !activityData) {
      loadActivity('', '', '')
    }
  }

  const resetForm = () => {
    setNom(''); setNomEtablissement(''); setSlug(''); setAdresse('')
    setModulesActifs(['fiches', 'sous-fiches', 'menus', 'bar', 'avis', 'recap', 'ingredients'])
    setPresetCouleur(0); setCouleurPrincipale('#18181B')
    setCouleurAccent('#6366F1'); setCouleurFond('#F4F4F5')
    setLogoFile(null); setLogoPreview(null); setLogoExistant(null)
    setActif(true)
    setSeuilVertCuisine('28'); setSeuilOrangeCuisine('35')
    setSeuilVertBoissons('22'); setSeuilOrangeBoissons('28')
    setError(''); setSuccess('')
  }

  const ouvrirModifier = (client) => {
    setClientSelectionne(client)
    setNom(client.nom || '')
    setNomEtablissement(client.nom_etablissement || '')
    setSlug(client.slug || '')
    setAdresse(client.adresse || '')
    setModulesActifs(client.modules_actifs || ['fiches'])
    setCouleurPrincipale(client.couleur_principale || '#18181B')
    setCouleurAccent(client.couleur_accent || '#6366F1')
    setCouleurFond(client.couleur_fond || '#F4F4F5')
    setLogoExistant(client.logo_url || null)
    setLogoPreview(client.logo_url || null)
    setActif(client.actif !== false)
    setSeuilVertCuisine(String(client.seuil_vert_cuisine || '28'))
    setSeuilOrangeCuisine(String(client.seuil_orange_cuisine || '35'))
    setSeuilVertBoissons(String(client.seuil_vert_boissons || '22'))
    setSeuilOrangeBoissons(String(client.seuil_orange_boissons || '28'))
    setError(''); setSuccess('')
    setVue('modifier')
  }

  const handleLogoChange = (e) => {
    const file = e.target.files[0]
    if (!file) return
    setLogoFile(file)
    setLogoPreview(URL.createObjectURL(file))
  }

  const appliquerPreset = (index) => {
    setPresetCouleur(index)
    const preset = COULEURS_PRESETS[index]
    if (preset.principale) setCouleurPrincipale(preset.principale)
    if (preset.accent) setCouleurAccent(preset.accent)
    if (preset.fond) setCouleurFond(preset.fond)
  }

  const toggleModule = (moduleId) => {
    setModulesActifs(prev =>
      prev.includes(moduleId)
        ? prev.filter(m => m !== moduleId)
        : [...prev, moduleId]
    )
  }

  const uploadLogo = async (clientId) => {
    if (!logoFile) return logoExistant
    const ext = logoFile.name.split('.').pop()
    const path = `${clientId}/logo.${ext}`
    const { error: errUpload } = await supabase.storage
      .from('clients-logos')
      .upload(path, logoFile, { upsert: true })
    if (errUpload) { console.error('Logo upload error:', errUpload); return logoExistant }
    const { data: urlData } = supabase.storage.from('clients-logos').getPublicUrl(path)
    return urlData.publicUrl
  }

  const creerClient = async () => {
    if (!nom || !slug || !nomEtablissement) {
      setError('Nom, slug et nom établissement sont obligatoires')
      return
    }
    setSaving(true); setError(''); setSuccess('')

    const { data: client, error: errClient } = await supabase
      .from('clients')
      .insert([{
        nom, nom_etablissement: nomEtablissement,
        slug: slug.toLowerCase().replace(/\s+/g, '-'),
        adresse, actif,
        couleur_principale: couleurPrincipale,
        couleur_accent: couleurAccent,
        couleur_fond: couleurFond,
        modules_actifs: modulesActifs,
        seuil_vert_cuisine: parseFloat(seuilVertCuisine),
        seuil_orange_cuisine: parseFloat(seuilOrangeCuisine),
        seuil_vert_boissons: parseFloat(seuilVertBoissons),
        seuil_orange_boissons: parseFloat(seuilOrangeBoissons),
      }])
      .select().single()

    if (errClient) { setError('Erreur : ' + errClient.message); setSaving(false); return }

    // Upload logo
    if (logoFile) {
      const logoUrl = await uploadLogo(client.id)
      await supabase.from('clients').update({ logo_url: logoUrl }).eq('id', client.id)
    }

    setSuccess(`✓ Établissement "${nomEtablissement}" créé avec succès !`)
    await loadClients()
    try { window.dispatchEvent(new Event('tenant_refresh')) } catch (e) { /* no-op */ }
    resetForm()
    setVue('liste')
    setSaving(false)
  }

  const modifierClient = async () => {
    if (!nom || !slug || !nomEtablissement) {
      setError('Nom, slug et nom établissement sont obligatoires')
      return
    }
    setSaving(true); setError(''); setSuccess('')

    let logoUrl = logoExistant
    if (logoFile) logoUrl = await uploadLogo(clientSelectionne.id)

    const payload = {
      nom,
      nom_etablissement: nomEtablissement,
      slug: slug.toLowerCase().replace(/\s+/g, '-'),
      adresse,
      actif,
      logo_url: logoUrl,
      couleur_principale: couleurPrincipale,
      couleur_accent: couleurAccent,
      couleur_fond: couleurFond,
      modules_actifs: modulesActifs,
      seuil_vert_cuisine: parseFloat(seuilVertCuisine),
      seuil_orange_cuisine: parseFloat(seuilOrangeCuisine),
      seuil_vert_boissons: parseFloat(seuilVertBoissons),
      seuil_orange_boissons: parseFloat(seuilOrangeBoissons),
    }

    console.log('Données envoyées:', payload)

    const { error: errUpdate } = await supabase
      .from('clients')
      .update(payload)
      .eq('id', clientSelectionne.id)

    if (errUpdate) {
      console.log('Erreur Supabase:', errUpdate)
      setError('Erreur : ' + errUpdate.message)
      setSaving(false)
      return
    }

    setSuccess(`✓ Établissement "${nomEtablissement}" mis à jour !`)
    await loadClients()
    try { window.dispatchEvent(new Event('tenant_refresh')) } catch (e) { /* no-op */ }
    try { router.refresh() } catch (e) { /* no-op */ }
    setSaving(false)
  }

  const toggleActifClient = async (clientId, actifActuel) => {
    await supabase.from('clients').update({ actif: !actifActuel }).eq('id', clientId)
    await loadClients()
  }

  const ouvrirInviteAdmin = (client) => {
    setInviteClient(client)
    setInviteEmail('')
    setInviteNomComplet('')
    setInviteSending(false)
    setShowInviteModal(true)
  }

  const fermerInviteAdmin = () => {
    setShowInviteModal(false)
    setInviteClient(null)
    setInviteEmail('')
    setInviteNomComplet('')
    setInviteSending(false)
  }

  const handleInviteAdmin = async () => {
    if (!inviteEmail.trim() || !inviteNomComplet.trim() || !inviteClient?.id) return
    setInviteSending(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        alert('Session expirée. Reconnectez-vous.')
        return
      }
      const res = await fetch('/api/invite-admin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          email: inviteEmail.trim(),
          nom_complet: inviteNomComplet.trim(),
          client_id: inviteClient.id
        })
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        alert(typeof data.error === 'string' ? data.error : 'Erreur lors de l’invitation.')
        return
      }
      alert('Invitation envoyée avec succès !')
      fermerInviteAdmin()
    } finally {
      setInviteSending(false)
    }
  }

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

  const inputStyle = {
    width: '100%', padding: '10px 12px', borderRadius: '8px',
    border: '0.5px solid #E4E4E7', fontSize: '14px',
    outline: 'none', color: '#18181B', background: 'white'
  }
  const labelStyle = {
    fontSize: '12px', color: '#71717A', fontWeight: '500',
    display: 'block', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px'
  }

  return (
    <div style={{ minHeight: '100vh', background: '#F4F4F5' }}>

      {/* Navbar super admin */}
      <div style={{
        background: '#18181B', borderBottom: '0.5px solid rgba(255,255,255,0.06)',
        padding: '0 24px', height: '56px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        position: 'sticky', top: 0, zIndex: 100
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '28px', height: '28px', borderRadius: '6px',
            background: '#6366F1', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '14px'
          }}>⚡</div>
          <span style={{ fontSize: '14px', fontWeight: '600', color: 'white' }}>Super Admin</span>
          <div style={{
            padding: '2px 10px', borderRadius: '20px',
            background: 'rgba(99,102,241,0.2)', border: '0.5px solid rgba(99,102,241,0.3)'
          }}>
            <span style={{ fontSize: '11px', color: '#A5B4FC', fontWeight: '500' }}>Skalcook</span>
          </div>
        </div>
        {isMobile ? (
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setMobileNavOpen((v) => !v)}
              style={{
                background: 'rgba(255,255,255,0.06)',
                color: 'rgba(255,255,255,0.9)',
                border: '0.5px solid rgba(255,255,255,0.2)',
                borderRadius: '8px',
                padding: '6px 10px',
                fontSize: '16px',
                cursor: 'pointer'
              }}
            >
              ☰
            </button>
            {mobileNavOpen && (
              <div style={{
                position: 'absolute',
                right: 0,
                top: 'calc(100% + 8px)',
                background: '#111827',
                border: '0.5px solid rgba(255,255,255,0.15)',
                borderRadius: '10px',
                padding: '8px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                minWidth: '220px',
                zIndex: 120
              }}>
                <div style={{ display: 'flex', gap: '4px', background: 'rgba(255,255,255,0.06)', borderRadius: '8px', padding: '3px' }}>
                  {[{ id: 'gestion', label: '🏗 Gestion' }, { id: 'activite', label: '📊 Activité' }].map(tab => (
                    <button key={tab.id} onClick={() => { basculerOnglet(tab.id); setMobileNavOpen(false) }} style={{
                      flex: 1, background: onglet === tab.id ? 'rgba(99,102,241,0.85)' : 'transparent',
                      color: onglet === tab.id ? 'white' : 'rgba(255,255,255,0.55)',
                      border: 'none', borderRadius: '6px', padding: '6px 8px', fontSize: '11px',
                      fontWeight: onglet === tab.id ? '600' : '400', cursor: 'pointer'
                    }}>{tab.label}</button>
                  ))}
                </div>
                {onglet === 'gestion' && vue !== 'liste' && (
                  <button onClick={() => { setVue('liste'); resetForm(); setMobileNavOpen(false) }} style={{
                    background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.75)',
                    border: '0.5px solid rgba(255,255,255,0.1)',
                    borderRadius: '8px', padding: '7px 10px', fontSize: '12px', cursor: 'pointer', textAlign: 'left'
                  }}>← Retour</button>
                )}
                <button onClick={() => { setMobileNavOpen(false); handleNavigation('/superadmin/prospects') }} style={{
                  background: 'rgba(99,102,241,0.2)', color: '#A5B4FC',
                  border: '0.5px solid rgba(99,102,241,0.3)',
                  borderRadius: '8px', padding: '7px 10px', fontSize: '12px', cursor: 'pointer', textAlign: 'left'
                }}>👥 Prospects</button>
                <button onClick={() => { setMobileNavOpen(false); handleNavigation('/superadmin/utilisateurs') }} style={{
                  background: 'rgba(14,165,233,0.2)', color: '#BAE6FD',
                  border: '0.5px solid rgba(14,165,233,0.35)',
                  borderRadius: '8px', padding: '7px 10px', fontSize: '12px', cursor: 'pointer', textAlign: 'left'
                }}>🧑‍💼 Utilisateurs</button>
                <button onClick={() => { setMobileNavOpen(false); handleNavigation('/superadmin/utilisateurs/nouveau') }} style={{
                  background: 'rgba(16,185,129,0.2)', color: '#A7F3D0',
                  border: '0.5px solid rgba(16,185,129,0.35)',
                  borderRadius: '8px', padding: '7px 10px', fontSize: '12px', cursor: 'pointer', textAlign: 'left'
                }}>➕ Utilisateur global</button>
                <button onClick={async () => { setMobileNavOpen(false); await handleLogout() }} style={{
                  background: 'transparent',
                  color: '#E11D48',
                  border: '0.5px solid #FDA4AF',
                  borderRadius: '8px',
                  padding: '7px 10px',
                  fontSize: '12px',
                  cursor: 'pointer',
                  textAlign: 'left'
                }}>🚪 Déconnexion</button>
              </div>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', gap: '8px' }}>
            <div style={{ display: 'flex', background: 'rgba(255,255,255,0.06)', borderRadius: '8px', padding: '3px', border: '0.5px solid rgba(255,255,255,0.1)' }}>
              {[{ id: 'gestion', label: '🏗 Gestion' }, { id: 'activite', label: '📊 Activité' }].map(tab => (
                <button key={tab.id} onClick={() => basculerOnglet(tab.id)} style={{
                  background: onglet === tab.id ? 'rgba(99,102,241,0.85)' : 'transparent',
                  color: onglet === tab.id ? 'white' : 'rgba(255,255,255,0.55)',
                  border: 'none', borderRadius: '6px', padding: '5px 12px', fontSize: '12px',
                  fontWeight: onglet === tab.id ? '600' : '400', cursor: 'pointer', transition: 'all 0.15s'
                }}>{tab.label}</button>
              ))}
            </div>
            {onglet === 'gestion' && vue !== 'liste' && (
              <button onClick={() => { setVue('liste'); resetForm() }} style={{
                background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)',
                border: '0.5px solid rgba(255,255,255,0.1)',
                borderRadius: '8px', padding: '7px 12px', fontSize: '13px', cursor: 'pointer'
              }}>← Retour</button>
            )}
            <button onClick={() => handleNavigation('/superadmin/prospects')} style={{
              background: 'rgba(99,102,241,0.2)', color: '#A5B4FC',
              border: '0.5px solid rgba(99,102,241,0.3)',
              borderRadius: '8px', padding: '7px 12px', fontSize: '13px', cursor: 'pointer'
            }}>👥 Prospects</button>
            <button onClick={() => handleNavigation('/superadmin/utilisateurs')} style={{
              background: 'rgba(14,165,233,0.2)', color: '#BAE6FD',
              border: '0.5px solid rgba(14,165,233,0.35)',
              borderRadius: '8px', padding: '7px 12px', fontSize: '13px', cursor: 'pointer'
            }}>🧑‍💼 Utilisateurs</button>
            <button onClick={() => handleNavigation('/superadmin/utilisateurs/nouveau')} style={{
              background: 'rgba(16,185,129,0.2)', color: '#A7F3D0',
              border: '0.5px solid rgba(16,185,129,0.35)',
              borderRadius: '8px', padding: '7px 12px', fontSize: '13px', cursor: 'pointer'
            }}>➕ Utilisateur global</button>
            <button
              onClick={handleLogout}
              style={{
                background: 'transparent',
                color: '#E11D48',
                border: '0.5px solid #FDA4AF',
                borderRadius: '8px',
                padding: '6px 12px',
                fontSize: '13px',
                cursor: 'pointer'
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#FFF1F2' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
            >
              🚪 Déconnexion
            </button>
          </div>
        )}
      </div>

      <div style={{ padding: isMobile ? '16px' : '32px', maxWidth: '1000px', margin: '0 auto' }}>

        {/* ── ONGLET GESTION ── */}
        {onglet === 'gestion' && vue === 'liste' && (
          <>
            {success && (
              <div style={{ background: '#DCFCE7', color: '#166534', borderRadius: '10px', padding: '14px 16px', marginBottom: '20px', fontSize: '14px', border: '0.5px solid #BBF7D0' }}>
                {success}
              </div>
            )}

            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <div>
                <h1 style={{ fontSize: 'clamp(1.5rem, 5vw, 2.5rem)', fontWeight: '600', color: '#18181B', marginBottom: '4px' }}>
                  Établissements
                </h1>
                <p style={{ fontSize: '14px', color: '#71717A' }}>
                  {clients.length} client{clients.length > 1 ? 's' : ''} enregistré{clients.length > 1 ? 's' : ''}
                </p>
              </div>
              <button
                onClick={() => { resetForm(); setVue('nouveau') }}
                style={{
                  background: '#6366F1', color: 'white', border: 'none',
                  borderRadius: '8px', padding: '10px 20px',
                  fontSize: '13px', fontWeight: '500', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: '6px'
                }}
              >
                <span style={{ fontSize: '18px', lineHeight: 1 }}>+</span>
                Nouvel établissement
              </button>
            </div>

            {/* Liste clients */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {!isMobile && clients.length > 0 && (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr auto',
                  gap: '16px',
                  padding: '0 8px',
                  marginBottom: '4px'
                }}>
                  <div style={{ fontSize: '11px', color: '#71717A', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Établissement
                  </div>
                  <div style={{ fontSize: '11px', color: '#71717A', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Actions
                  </div>
                </div>
              )}
              {clients.map((client) => (
                <div key={client.id} style={{
                  background: 'white', borderRadius: '12px',
                  border: `0.5px solid ${client.actif ? '#E4E4E7' : '#FECACA'}`,
                  padding: '20px 24px',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  flexWrap: 'wrap', gap: '16px',
                  opacity: client.actif ? 1 : 0.7
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    {client.logo_url ? (
                      <img src={client.logo_url} alt={client.nom_etablissement}
                        style={{ width: '44px', height: '44px', objectFit: 'contain', borderRadius: '8px', border: '0.5px solid #E4E4E7' }}
                      />
                    ) : (
                      <div style={{
                        width: '44px', height: '44px', borderRadius: '8px',
                        background: client.couleur_accent || '#6366F1',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '20px'
                      }}>🏨</div>
                    )}
                    <div>
                      <div style={{ fontSize: '15px', fontWeight: '600', color: '#18181B', marginBottom: '4px' }}>
                        {client.nom_etablissement}
                        {!client.actif && (
                          <span style={{ marginLeft: '8px', fontSize: '11px', background: '#FEE2E2', color: '#DC2626', padding: '2px 8px', borderRadius: '20px' }}>
                            Inactif
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '12px', color: '#71717A', marginBottom: '6px' }}>
                        slug: <code style={{ background: '#F4F4F5', padding: '1px 6px', borderRadius: '4px', fontSize: '12px' }}>{client.slug}</code>
                        {client.adresse && ` — ${client.adresse}`}
                      </div>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        {(client.modules_actifs || []).map(m => {
                          const mod = MODULES_DISPONIBLES.find(md => md.id === m)
                          return mod ? (
                            <span key={m} style={{
                              fontSize: '11px', padding: '2px 8px', borderRadius: '20px',
                              background: '#EEF2FF', color: '#4338CA'
                            }}>{mod.emoji} {mod.label}</span>
                          ) : null
                        })}
                      </div>
                    </div>
                  </div>
                  <div style={{
                    display: 'flex',
                    gap: '8px',
                    alignItems: isMobile ? 'stretch' : 'center',
                    flexDirection: isMobile ? 'column' : 'row',
                    width: isMobile ? '100%' : 'auto'
                  }}>
                    {/* Aperçu couleurs */}
                    <div style={{ display: 'flex', gap: '4px' }}>
                      {[client.couleur_principale, client.couleur_accent, client.couleur_fond].map((col, i) => (
                        col ? <div key={i} style={{
                          width: '16px', height: '16px', borderRadius: '50%',
                          background: col, border: '0.5px solid #E4E4E7'
                        }} /> : null
                      ))}
                    </div>
                    <button
                      onClick={() => toggleActifClient(client.id, client.actif)}
                      style={{
                        background: client.actif ? '#FEE2E2' : '#DCFCE7',
                        color: client.actif ? '#DC2626' : '#16A34A',
                        border: 'none', borderRadius: '8px',
                        padding: isMobile ? '6px 10px' : '7px 12px', fontSize: isMobile ? '11px' : '12px', cursor: 'pointer', fontWeight: '500',
                        width: isMobile ? '100%' : 'auto'
                      }}
                    >{client.actif ? 'Désactiver' : 'Activer'}</button>
                    <button
                      onClick={() => ouvrirModifier(client)}
                      style={{
                        background: '#18181B', color: 'white',
                        border: 'none', borderRadius: '8px',
                        padding: isMobile ? '6px 10px' : '7px 14px', fontSize: isMobile ? '11px' : '13px', cursor: 'pointer', fontWeight: '500',
                        width: isMobile ? '100%' : 'auto'
                      }}
                    >Modifier</button>
                    <button
                      onClick={() => handleNavigation(`/superadmin/etablissements/${client.id}`)}
                      style={{
                        background: '#F8FAFC', color: '#0F172A',
                        border: '0.5px solid #CBD5E1', borderRadius: '8px',
                        padding: isMobile ? '6px 10px' : '7px 12px', fontSize: isMobile ? '11px' : '12px', cursor: 'pointer', fontWeight: '500',
                        width: isMobile ? '100%' : 'auto'
                      }}
                    >
                      KYC & Légal
                    </button>
                    <button
                      onClick={() => {
                        const selectedId = client.id
                        console.log('FORCE SET:', selectedId)
                        setIsNavigating(true)
                        window.localStorage.removeItem('client_id')
                        window.localStorage.removeItem('tenant')
                        window.localStorage.setItem('client_id', selectedId)

                        // Micro-pause pour être sûr que le navigateur a écrit l'ID
                        setTimeout(() => {
                          window.location.href = '/dashboard'
                        }, 100)
                      }}
                      style={{
                        background: '#EEF2FF', color: '#4338CA',
                        border: '0.5px solid #C7D2FE', borderRadius: '8px',
                        padding: isMobile ? '6px 10px' : '7px 12px', fontSize: isMobile ? '11px' : '12px', cursor: 'pointer', fontWeight: '500',
                        width: isMobile ? '100%' : 'auto'
                      }}
                    >
                      Accéder au Dashboard
                    </button>
                    <button
                      onClick={() => ouvrirInviteAdmin(client)}
                      style={{
                        background: '#EEF2FF', color: '#4338CA',
                        border: '0.5px solid #C7D2FE', borderRadius: '8px',
                        padding: isMobile ? '6px 10px' : '7px 12px', fontSize: isMobile ? '11px' : '12px', cursor: 'pointer', fontWeight: '500',
                        width: isMobile ? '100%' : 'auto',
                        display: 'flex', alignItems: 'center', gap: '6px'
                      }}
                    >
                      <span>✉️</span>
                      Inviter Admin
                    </button>
                  </div>
                </div>
              ))}

              {clients.length === 0 && (
                <div style={{
                  background: 'white', borderRadius: '12px',
                  border: '0.5px solid #E4E4E7', padding: '60px',
                  textAlign: 'center', color: '#71717A', fontSize: '14px'
                }}>
                  Aucun établissement — créez le premier !
                </div>
              )}
            </div>
          </>
        )}

        {/* ── ONGLET GESTION FORMULAIRE ── */}
        {onglet === 'gestion' && (vue === 'nouveau' || vue === 'modifier') && (
          <>
            <h1 style={{ fontSize: 'clamp(1.5rem, 5vw, 2.5rem)', fontWeight: '600', color: '#18181B', marginBottom: '8px' }}>
              {vue === 'nouveau' ? 'Nouvel établissement' : `Modifier — ${clientSelectionne?.nom_etablissement}`}
            </h1>
            <p style={{ fontSize: '14px', color: '#71717A', marginBottom: '28px' }}>
              {vue === 'nouveau' ? 'Configurez le nouvel espace client.' : 'Mettez à jour les informations de cet établissement.'}
            </p>

            {error && (
              <div style={{ background: '#FEE2E2', color: '#DC2626', borderRadius: '8px', padding: '12px 16px', fontSize: '13px', marginBottom: '20px', border: '0.5px solid #FECACA' }}>
                {error}
              </div>
            )}
            {success && (
              <div style={{ background: '#DCFCE7', color: '#166534', borderRadius: '8px', padding: '12px 16px', fontSize: '13px', marginBottom: '20px', border: '0.5px solid #BBF7D0' }}>
                {success}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

              {/* Infos générales */}
              <div style={{ background: 'white', borderRadius: '12px', border: '0.5px solid #E4E4E7', padding: '24px' }}>
                <div style={{ fontSize: '12px', fontWeight: '600', color: '#71717A', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '20px' }}>
                  Informations générales
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '16px' }}>
                  <div>
                    <label style={labelStyle}>Nom interne *</label>
                    <input value={nom} onChange={e => setNom(e.target.value)}
                      placeholder="Ex : hotel-la-fantaisie" style={inputStyle} />
                    <div style={{ fontSize: '11px', color: '#71717A', marginTop: '4px' }}>Identifiant interne (non visible)</div>
                  </div>
                  <div>
                    <label style={labelStyle}>Nom affiché *</label>
                    <input value={nomEtablissement} onChange={e => setNomEtablissement(e.target.value)}
                      placeholder="Ex : Hôtel La Fantaisie" style={inputStyle} />
                    <div style={{ fontSize: '11px', color: '#71717A', marginTop: '4px' }}>Affiché dans la navbar</div>
                  </div>
                  <div>
                    <label style={labelStyle}>Slug * (sous-domaine)</label>
                    <input value={slug} onChange={e => setSlug(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
                      placeholder="Ex : la-fantaisie" style={inputStyle} />
                    <div style={{ fontSize: '11px', color: '#71717A', marginTop: '4px' }}>
                      URL : <code style={{ background: '#F4F4F5', padding: '1px 6px', borderRadius: '4px' }}>{slug || 'votre-slug'}.skalcook.com</code>
                    </div>
                  </div>
                  <div>
                    <label style={labelStyle}>Adresse</label>
                    <input value={adresse} onChange={e => setAdresse(e.target.value)}
                      placeholder="Ex : 24 Rue Cadet, Paris 9ème" style={inputStyle} />
                  </div>
                </div>
                <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div
                    onClick={() => setActif(!actif)}
                    style={{
                      width: '40px', height: '22px', borderRadius: '11px',
                      background: actif ? '#6366F1' : '#E4E4E7',
                      position: 'relative', cursor: 'pointer', transition: 'background 0.2s'
                    }}
                  >
                    <div style={{
                      position: 'absolute', top: '3px',
                      left: actif ? '21px' : '3px',
                      width: '16px', height: '16px', borderRadius: '50%',
                      background: 'white', transition: 'left 0.2s',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
                    }} />
                  </div>
                  <span style={{ fontSize: '14px', color: '#18181B', fontWeight: '500' }}>
                    {actif ? 'Établissement actif' : 'Établissement inactif'}
                  </span>
                </div>
              </div>

              {/* Logo */}
              <div style={{ background: 'white', borderRadius: '12px', border: '0.5px solid #E4E4E7', padding: '24px' }}>
                <div style={{ fontSize: '12px', fontWeight: '600', color: '#71717A', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '20px' }}>
                  Logo
                </div>
                <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
                  {logoPreview ? (
                    <div style={{ position: 'relative', flexShrink: 0 }}>
                      <img src={logoPreview} alt="Logo"
                        style={{ width: '80px', height: '80px', objectFit: 'contain', borderRadius: '10px', border: '0.5px solid #E4E4E7', background: '#F4F4F5', padding: '8px' }}
                      />
                      <button onClick={() => { setLogoFile(null); setLogoPreview(null) }} style={{
                        position: 'absolute', top: '-8px', right: '-8px',
                        background: '#DC2626', color: 'white', border: 'none',
                        borderRadius: '50%', width: '20px', height: '20px', fontSize: '12px', cursor: 'pointer'
                      }}>×</button>
                    </div>
                  ) : (
                    <div style={{
                      width: '80px', height: '80px', borderRadius: '10px',
                      border: '1px dashed #E4E4E7', display: 'flex', alignItems: 'center',
                      justifyContent: 'center', background: '#F4F4F5', flexShrink: 0, fontSize: '28px'
                    }}>🏨</div>
                  )}
                  <div style={{ flex: 1 }}>
                    <input type="file" accept="image/*" onChange={handleLogoChange}
                      style={{ width: '100%', padding: '10px 12px', border: '0.5px solid #6366F1', borderRadius: '8px', fontSize: '13px', background: '#EEF2FF', cursor: 'pointer' }}
                    />
                    <div style={{ fontSize: '11px', color: '#71717A', marginTop: '6px' }}>PNG, SVG, WEBP recommandés — fond transparent idéal</div>
                  </div>
                </div>
              </div>

              {/* Couleurs */}
              <div style={{ background: 'white', borderRadius: '12px', border: '0.5px solid #E4E4E7', padding: '24px' }}>
                <div style={{ fontSize: '12px', fontWeight: '600', color: '#71717A', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '20px' }}>
                  Palette de couleurs
                </div>

                {/* Presets */}
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '20px' }}>
                  {COULEURS_PRESETS.map((preset, i) => (
                    <button key={i} onClick={() => appliquerPreset(i)} style={{
                      display: 'flex', alignItems: 'center', gap: '8px',
                      padding: '8px 12px', borderRadius: '8px', cursor: 'pointer',
                      border: presetCouleur === i ? '1.5px solid #6366F1' : '0.5px solid #E4E4E7',
                      background: presetCouleur === i ? '#EEF2FF' : 'white',
                      fontSize: '12px', color: presetCouleur === i ? '#4338CA' : '#71717A',
                      fontWeight: presetCouleur === i ? '500' : '400'
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

                {/* Custom colors */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
                  {[
                    { label: 'Couleur principale', value: couleurPrincipale, setter: setCouleurPrincipale, desc: 'Navbar, texte principal' },
                    { label: 'Couleur accent', value: couleurAccent, setter: setCouleurAccent, desc: 'Boutons CTA, liens actifs' },
                    { label: 'Couleur fond', value: couleurFond, setter: setCouleurFond, desc: 'Fond de page' },
                  ].map((item) => (
                    <div key={item.label}>
                      <label style={labelStyle}>{item.label}</label>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <input type="color" value={item.value} onChange={e => { item.setter(e.target.value); setPresetCouleur(4) }}
                          style={{ width: '44px', height: '44px', border: 'none', borderRadius: '8px', cursor: 'pointer', padding: '2px' }}
                        />
                        <input type="text" value={item.value} onChange={e => { item.setter(e.target.value); setPresetCouleur(4) }}
                          placeholder="#000000"
                          style={{ flex: 1, padding: '10px 12px', borderRadius: '8px', border: '0.5px solid #E4E4E7', fontSize: '13px', fontFamily: 'monospace', outline: 'none' }}
                        />
                      </div>
                      <div style={{ fontSize: '11px', color: '#71717A', marginTop: '4px' }}>{item.desc}</div>
                    </div>
                  ))}
                </div>

                {/* Aperçu */}
                <div style={{ marginTop: '20px', borderRadius: '10px', overflow: 'hidden', border: '0.5px solid #E4E4E7' }}>
                  <div style={{ background: couleurPrincipale, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ width: '20px', height: '20px', borderRadius: '4px', background: couleurAccent }} />
                    <span style={{ fontSize: '13px', color: 'white', fontWeight: '500' }}>{nomEtablissement || 'Nom établissement'}</span>
                    <div style={{ marginLeft: 'auto', padding: '4px 10px', borderRadius: '6px', background: couleurAccent }}>
                      <span style={{ fontSize: '11px', color: 'white', fontWeight: '500' }}>+ Nouvelle fiche</span>
                    </div>
                  </div>
                  <div style={{ background: couleurFond, padding: '12px 16px' }}>
                    <span style={{ fontSize: '12px', color: '#71717A' }}>Aperçu de la navbar avec vos couleurs</span>
                  </div>
                </div>
              </div>

              {/* Modules */}
              <div style={{ background: 'white', borderRadius: '12px', border: '0.5px solid #E4E4E7', padding: '24px' }}>
                <div style={{ fontSize: '12px', fontWeight: '600', color: '#71717A', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '20px' }}>
                  Modules actifs
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: '10px' }}>
                  {MODULES_DISPONIBLES.map((mod) => {
                    const moduleActif = modulesActifs.includes(mod.id)
                    return (
                     <div key={mod.id} onClick={() => toggleModule(mod.id)} style={{
                    padding: '14px 12px', borderRadius: '10px', cursor: 'pointer',
                    border: moduleActif ? '1.5px solid #6366F1' : '0.5px solid #E4E4E7',
                    background: moduleActif ? '#EEF2FF' : 'white',
                    display: 'flex', alignItems: 'center', gap: '10px',
                    transition: 'all 0.15s'
                  }}>
                    <span style={{ fontSize: '20px' }}>{mod.emoji}</span>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: moduleActif ? '500' : '400', color: moduleActif ? '#4338CA' : '#18181B' }}>
                        {mod.label}
                      </div>
                    </div>
                    <div style={{ marginLeft: 'auto', width: '16px', height: '16px', borderRadius: '50%', background: moduleActif ? '#6366F1' : '#E4E4E7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {moduleActif && <span style={{ fontSize: '10px', color: 'white' }}>✓</span>}
                    </div>
                  </div>
                    )
                  })}
                </div>
              </div>

              {/* Seuils food cost */}
              <div style={{ background: 'white', borderRadius: '12px', border: '0.5px solid #E4E4E7', padding: '24px' }}>
                <div style={{ fontSize: '12px', fontWeight: '600', color: '#71717A', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '20px' }}>
                  Seuils food cost
                </div>
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
                        <input type="number" value={item.value} onChange={e => item.setter(e.target.value)}
                          min="0" max="100" step="1"
                          style={{ ...inputStyle, textAlign: 'center' }}
                        />
                        <span style={{ fontSize: '16px', color: '#71717A', flexShrink: 0 }}>%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', paddingBottom: '40px' }}>
                <button onClick={() => { setVue('liste'); resetForm() }} style={{
                  background: 'white', color: '#71717A',
                  border: '0.5px solid #E4E4E7', borderRadius: '8px',
                  padding: '12px 24px', fontSize: '14px', cursor: 'pointer'
                }}>Annuler</button>
                <button
                  onClick={vue === 'nouveau' ? creerClient : modifierClient}
                  disabled={saving}
                  style={{
                    background: saving ? '#A5B4FC' : '#6366F1', color: 'white',
                    border: 'none', borderRadius: '8px',
                    padding: '12px 28px', fontSize: '14px', fontWeight: '500',
                    cursor: saving ? 'not-allowed' : 'pointer'
                  }}
                >
                  {saving ? 'Enregistrement...' : vue === 'nouveau' ? 'Créer l\'établissement' : 'Sauvegarder'}
                </button>
              </div>
            </div>
          </>
        )}

        {/* ── ONGLET ACTIVITÉ RÉELLE ── */}
        {onglet === 'activite' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <div>
                <h1 style={{ fontSize: 'clamp(1.3rem, 4vw, 2rem)', fontWeight: '600', color: '#18181B', marginBottom: '4px' }}>Activité Réelle</h1>
                <p style={{ fontSize: '14px', color: '#71717A' }}>Journal d'audit & métriques des 7 derniers jours</p>
              </div>
              <button onClick={() => loadActivity(filterClient, filterUser, filterDevice)} style={{
                background: '#6366F1', color: 'white', border: 'none', borderRadius: '8px',
                padding: '8px 16px', fontSize: '13px', cursor: 'pointer', fontWeight: '500'
              }}>↻ Actualiser</button>
            </div>

            {activityLoading && (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}>
                <ChefLoader message="Chargement de l'activité..." />
              </div>
            )}

            {!activityLoading && activityData && (
              <>
                {/* KPI Cards */}
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: '12px', marginBottom: '20px' }}>
                  {[
                    { label: 'Utilisateurs actifs (24h)', value: activityData.kpis.activeUsers24h, icon: '👤', color: '#6366F1', bg: '#EEF2FF' },
                    { label: 'Modifications aujourd\'hui', value: activityData.kpis.modificationsToday, icon: '✏️', color: '#D97706', bg: '#FEF3C7' },
                    { label: 'Établissement le plus actif', value: activityData.kpis.topClient || '—', icon: '🏆', color: '#16A34A', bg: '#DCFCE7' },
                  ].map((kpi) => (
                    <div key={kpi.label} style={{ background: 'white', borderRadius: '12px', border: '0.5px solid #E4E4E7', padding: '20px 24px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                        <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: kpi.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>{kpi.icon}</div>
                        <span style={{ fontSize: '12px', color: '#71717A', fontWeight: '500' }}>{kpi.label}</span>
                      </div>
                      <div style={{ fontSize: typeof kpi.value === 'number' ? '32px' : '20px', fontWeight: '700', color: kpi.color, lineHeight: 1 }}>{kpi.value}</div>
                    </div>
                  ))}
                </div>

                {/* Filtres */}
                <div style={{ background: 'white', borderRadius: '12px', border: '0.5px solid #E4E4E7', padding: '16px 20px', marginBottom: '16px', display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                  <div style={{ flex: 1, minWidth: '160px' }}>
                    <div style={{ fontSize: '11px', color: '#71717A', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>Établissement</div>
                    <select value={filterClient} onChange={e => { setFilterClient(e.target.value); loadActivity(e.target.value, filterUser, filterDevice) }}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '0.5px solid #E4E4E7', fontSize: '13px', background: 'white', color: '#18181B', outline: 'none' }}>
                      <option value="">Tous les établissements</option>
                      {(activityData.clients || []).map(c => <option key={c.id} value={c.id}>{c.nom_etablissement}</option>)}
                    </select>
                  </div>
                  <div style={{ flex: 1, minWidth: '160px' }}>
                    <div style={{ fontSize: '11px', color: '#71717A', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>Utilisateur</div>
                    <select value={filterUser} onChange={e => { setFilterUser(e.target.value); loadActivity(filterClient, e.target.value, filterDevice) }}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '0.5px solid #E4E4E7', fontSize: '13px', background: 'white', color: '#18181B', outline: 'none' }}>
                      <option value="">Tous les utilisateurs</option>
                      {(activityData.users || []).map(u => <option key={u.user_id} value={u.user_id}>{u.user_nom}</option>)}
                    </select>
                  </div>
                  <div style={{ flex: 1, minWidth: '160px' }}>
                    <div style={{ fontSize: '11px', color: '#71717A', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>Appareil</div>
                    <select value={filterDevice} onChange={e => { setFilterDevice(e.target.value); loadActivity(filterClient, filterUser, e.target.value) }}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '0.5px solid #E4E4E7', fontSize: '13px', background: 'white', color: '#18181B', outline: 'none' }}>
                      <option value="">Tous les appareils</option>
                      {['iOS', 'Android', 'Windows', 'Mac', 'Linux', 'Autre'].map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                  {(filterClient || filterUser || filterDevice) && (
                    <button onClick={() => { setFilterClient(''); setFilterUser(''); setFilterDevice(''); loadActivity('', '', '') }}
                      style={{ padding: '8px 14px', borderRadius: '8px', border: '0.5px solid #E4E4E7', background: '#F4F4F5', color: '#71717A', fontSize: '13px', cursor: 'pointer' }}>
                      Réinitialiser
                    </button>
                  )}
                </div>

                {/* Line Chart 7 jours */}
                <div style={{ background: 'white', borderRadius: '12px', border: '0.5px solid #E4E4E7', padding: '20px 24px', marginBottom: '16px' }}>
                  <div style={{ fontSize: '13px', fontWeight: '600', color: '#18181B', marginBottom: '4px' }}>Volume d'actions — 7 derniers jours</div>
                  <div style={{ fontSize: '12px', color: '#71717A', marginBottom: '20px' }}>Toutes actions confondues</div>
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={activityData.chartData} margin={{ top: 4, right: 16, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#F4F4F5" />
                      <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#71717A' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: '#71717A' }} axisLine={false} tickLine={false} allowDecimals={false} />
                      <Tooltip contentStyle={{ borderRadius: '8px', border: '0.5px solid #E4E4E7', fontSize: '12px' }} />
                      <Line type="monotone" dataKey="actions" stroke="#6366F1" strokeWidth={2} dot={{ r: 3, fill: '#6366F1' }} activeDot={{ r: 5 }} name="Actions" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                {/* Journal d'audit */}
                <div style={{ background: 'white', borderRadius: '12px', border: '0.5px solid #E4E4E7', overflow: 'hidden' }}>
                  <div style={{ padding: '16px 20px', borderBottom: '0.5px solid #E4E4E7', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: '13px', fontWeight: '600', color: '#18181B' }}>Journal d'audit</div>
                    <span style={{ fontSize: '12px', color: '#71717A' }}>{activityData.recentLogs.length} dernières actions</span>
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: isMobile ? '600px' : 'auto' }}>
                      <thead>
                        <tr style={{ background: '#F4F4F5' }}>
                          {['Heure', 'Utilisateur', 'Action', 'Ressource', 'Appareil', 'Établissement'].map(h => (
                            <th key={h} style={{ padding: '10px 14px', fontSize: '11px', color: '#71717A', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {activityData.recentLogs.length === 0 && (
                          <tr><td colSpan={6} style={{ padding: '40px', textAlign: 'center', color: '#71717A', fontSize: '14px' }}>Aucune activité sur cette période</td></tr>
                        )}
                        {activityData.recentLogs.map((log, i) => {
                          const actionColors = {
                            CREATION: { bg: '#EAF3DE', color: '#3B6D11' },
                            MODIFICATION: { bg: '#FAEEDA', color: '#854F0B' },
                            SUPPRESSION: { bg: '#FCEBEB', color: '#A32D2D' },
                            IMPORT: { bg: '#EEEDFE', color: '#3C3489' },
                            CONNEXION: { bg: '#F0E8E0', color: '#2C1810' },
                          }
                          const deviceIcons = { iOS: '📱', Android: '🤖', Windows: '🖥', Mac: '🍎', Linux: '🐧', Inconnu: '❓', Autre: '💻' }
                          const ac = actionColors[log.action] || { bg: '#F4F4F5', color: '#71717A' }
                          const clientNom = (activityData.clients || []).find(c => c.id === log.client_id)?.nom_etablissement || log.client_id?.slice(0, 8) || '—'
                          const heure = new Date(log.created_at).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
                          return (
                            <tr key={log.id || i} style={{ borderBottom: '0.5px solid #F4F4F5' }}>
                              <td style={{ padding: '10px 14px', fontSize: '12px', color: '#71717A', whiteSpace: 'nowrap' }}>{heure}</td>
                              <td style={{ padding: '10px 14px', fontSize: '13px', color: '#18181B', fontWeight: '500' }}>{log.user_nom}</td>
                              <td style={{ padding: '10px 14px' }}>
                                <span style={{ fontSize: '11px', fontWeight: '600', padding: '3px 8px', borderRadius: '20px', background: ac.bg, color: ac.color }}>{log.action}</span>
                              </td>
                              <td style={{ padding: '10px 14px', fontSize: '12px', color: '#18181B', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {log.entite_nom || log.entite || '—'}
                              </td>
                              <td style={{ padding: '10px 14px', fontSize: '12px', color: '#71717A', whiteSpace: 'nowrap' }}>
                                {deviceIcons[log.device] || '💻'} {log.device} · {log.browser}
                              </td>
                              <td style={{ padding: '10px 14px', fontSize: '12px', color: '#71717A', whiteSpace: 'nowrap' }}>{clientNom}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}

            {!activityLoading && !activityData && (
              <div style={{ background: 'white', borderRadius: '12px', border: '0.5px solid #E4E4E7', padding: '60px', textAlign: 'center', color: '#71717A' }}>
                Cliquez sur "Actualiser" pour charger les données d'activité.
              </div>
            )}
          </div>
        )}

      </div>

      {/* Modale invitation Admin */}
      {showInviteModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 200,
          background: 'rgba(9,9,11,0.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '16px'
        }}>
          <div style={{
            width: '100%', maxWidth: '460px',
            background: 'white', borderRadius: '14px',
            border: '0.5px solid #E4E4E7', boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
            padding: '20px'
          }}>
            <div style={{ fontSize: '17px', fontWeight: '600', color: '#18181B', marginBottom: '6px' }}>
              Inviter Admin
            </div>
            <div style={{ fontSize: '13px', color: '#71717A', marginBottom: '16px' }}>
              Établissement: <strong style={{ color: '#18181B' }}>{inviteClient?.nom_etablissement}</strong>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={labelStyle}>Email *</label>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={e => setInviteEmail(e.target.value)}
                  placeholder="admin@etablissement.com"
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Nom complet *</label>
                <input
                  type="text"
                  value={inviteNomComplet}
                  onChange={e => setInviteNomComplet(e.target.value)}
                  placeholder="Prénom Nom"
                  style={inputStyle}
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '18px' }}>
              <button
                onClick={fermerInviteAdmin}
                disabled={inviteSending}
                style={{
                  background: 'white', color: '#71717A',
                  border: '0.5px solid #E4E4E7', borderRadius: '8px',
                  padding: '10px 14px', fontSize: '13px',
                  cursor: inviteSending ? 'not-allowed' : 'pointer',
                  opacity: inviteSending ? 0.6 : 1
                }}
              >
                Annuler
              </button>
              <button
                onClick={handleInviteAdmin}
                disabled={!inviteEmail.trim() || !inviteNomComplet.trim() || inviteSending}
                style={{
                  background: (!inviteEmail.trim() || !inviteNomComplet.trim() || inviteSending) ? '#A5B4FC' : '#6366F1',
                  color: 'white', border: 'none', borderRadius: '8px',
                  padding: '10px 14px', fontSize: '13px', fontWeight: '500',
                  cursor: (!inviteEmail.trim() || !inviteNomComplet.trim() || inviteSending) ? 'not-allowed' : 'pointer'
                }}
              >
                {inviteSending ? 'Envoi…' : 'Inviter'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
