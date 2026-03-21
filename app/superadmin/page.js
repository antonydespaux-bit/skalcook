'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useRouter } from 'next/navigation'
import { useTheme } from '../../lib/useTheme'
import { useIsMobile } from '../../lib/useIsMobile'

const MODULES_DISPONIBLES = [
  { id: 'fiches', label: 'Fiches techniques', emoji: '📝' },
  { id: 'sous-fiches', label: 'Sous-fiches', emoji: '🔗' },
  { id: 'menus', label: 'Menus', emoji: '📋' },
  { id: 'bar', label: 'Module Bar', emoji: '🍸' },
  { id: 'avis', label: 'Avis clients', emoji: '⭐' },
  { id: 'recap', label: 'Récap food cost', emoji: '📊' },
  { id: 'ingredients', label: 'Ingrédients', emoji: '🥦' },
  { id: 'ardoise', label: 'Ardoise', emoji: '🖊️' },
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

  useEffect(() => {
    checkAuth()
  }, [])

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.push('/'); return }

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

    const { error: errUpdate } = await supabase
      .from('clients')
      .update({
        nom, nom_etablissement: nomEtablissement,
        slug: slug.toLowerCase().replace(/\s+/g, '-'),
        adresse, actif, logo_url: logoUrl,
        couleur_principale: couleurPrincipale,
        couleur_accent: couleurAccent,
        couleur_fond: couleurFond,
        modules_actifs: modulesActifs,
        seuil_vert_cuisine: parseFloat(seuilVertCuisine),
        seuil_orange_cuisine: parseFloat(seuilOrangeCuisine),
        seuil_vert_boissons: parseFloat(seuilVertBoissons),
        seuil_orange_boissons: parseFloat(seuilOrangeBoissons),
      })
      .eq('id', clientSelectionne.id)

    if (errUpdate) { setError('Erreur : ' + errUpdate.message); setSaving(false); return }

    setSuccess(`✓ Établissement "${nomEtablissement}" mis à jour !`)
    await loadClients()
    setSaving(false)
  }

  const toggleActifClient = async (clientId, actifActuel) => {
    await supabase.from('clients').update({ actif: !actifActuel }).eq('id', clientId)
    await loadClients()
  }

  if (!authorized || loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F4F4F5' }}>
      <div style={{ fontSize: '14px', color: '#71717A' }}>Vérification des accès...</div>
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
            <span style={{ fontSize: '11px', color: '#A5B4FC', fontWeight: '500' }}>FT Manager</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {vue !== 'liste' && (
            <button onClick={() => { setVue('liste'); resetForm() }} style={{
              background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)',
              border: '0.5px solid rgba(255,255,255,0.1)',
              borderRadius: '8px', padding: '7px 12px', fontSize: '13px', cursor: 'pointer'
            }}>← Retour</button>
          )}
          <button onClick={() => router.push('/dashboard')} style={{
            background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)',
            border: '0.5px solid rgba(255,255,255,0.1)',
            borderRadius: '8px', padding: '7px 12px', fontSize: '13px', cursor: 'pointer'
          }}>App →</button>
        </div>
      </div>

      <div style={{ padding: isMobile ? '16px' : '32px', maxWidth: '1000px', margin: '0 auto' }}>

        {/* ── VUE LISTE ── */}
        {vue === 'liste' && (
          <>
            {success && (
              <div style={{ background: '#DCFCE7', color: '#166534', borderRadius: '10px', padding: '14px 16px', marginBottom: '20px', fontSize: '14px', border: '0.5px solid #BBF7D0' }}>
                {success}
              </div>
            )}

            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <div>
                <h1 style={{ fontSize: '22px', fontWeight: '600', color: '#18181B', marginBottom: '4px' }}>
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
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
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
                        padding: '7px 12px', fontSize: '12px', cursor: 'pointer', fontWeight: '500'
                      }}
                    >{client.actif ? 'Désactiver' : 'Activer'}</button>
                    <button
                      onClick={() => ouvrirModifier(client)}
                      style={{
                        background: '#18181B', color: 'white',
                        border: 'none', borderRadius: '8px',
                        padding: '7px 14px', fontSize: '13px', cursor: 'pointer', fontWeight: '500'
                      }}
                    >Modifier</button>
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

        {/* ── VUE FORMULAIRE (Nouveau / Modifier) ── */}
        {(vue === 'nouveau' || vue === 'modifier') && (
          <>
            <h1 style={{ fontSize: '22px', fontWeight: '600', color: '#18181B', marginBottom: '8px' }}>
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
                      URL : <code style={{ background: '#F4F4F5', padding: '1px 6px', borderRadius: '4px' }}>{slug || 'votre-slug'}.ftmanager.fr</code>
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
                        border: actif ? '1.5px solid #6366F1' : '0.5px solid #E4E4E7',
                        background: actif ? '#EEF2FF' : 'white',
                        display: 'flex', alignItems: 'center', gap: '10px',
                        transition: 'all 0.15s'
                      }}>
                        <span style={{ fontSize: '20px' }}>{mod.emoji}</span>
                        <div>
                          <div style={{ fontSize: '13px', fontWeight: actif ? '500' : '400', color: actif ? '#4338CA' : '#18181B' }}>
                            {mod.label}
                          </div>
                        </div>
                        <div style={{ marginLeft: 'auto', width: '16px', height: '16px', borderRadius: '50%', background: actif ? '#6366F1' : '#E4E4E7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {actif && <span style={{ fontSize: '10px', color: 'white' }}>✓</span>}
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
      </div>
    </div>
  )
}
