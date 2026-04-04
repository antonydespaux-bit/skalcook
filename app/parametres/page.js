'use client'
export const dynamic = 'force-dynamic'
import { useState, useEffect } from 'react'
import { supabase, getClientId } from '../../lib/supabase'
import { useRouter } from 'next/navigation'
import { useTheme } from '../../lib/useTheme'
import { useRole } from '../../lib/useRole'
import { useIsMobile } from '../../lib/useIsMobile'
import { INVENTAIRE_FREQUENCES, JOURS_SEMAINE } from '../../lib/constants'
import Navbar from '../../components/Navbar'

const EMOJIS_LIEUX = ['🍽', '🌅', '🍷', '🛎', '🏨', '🌿', '🎭', '☕', '🍸', '🌊', '🏔', '🌃']
const EMOJIS_CATS = ['🥗', '🍖', '🍮', '🥪', '⚙️', '🍹', '🍷', '🍺', '🥤', '🥃', '🍾', '🧃', '🥩', '🐟', '🧀', '🍰', '🫕', '🥘']

export default function SettingsPage() {
  const [onglet, setOnglet] = useState('lieux')
  const [lieux, setLieux] = useState([])
  const [categoriesCuisine, setCategoriesCuisine] = useState([])
  const [categoriesBar, setCategoriesBar] = useState([])
  const [params, setParams] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState('success')

  // Formulaires ajout
  const [newLieuNom, setNewLieuNom] = useState('')
  const [newLieuEmoji, setNewLieuEmoji] = useState('🍽')
  const [newLieuSection, setNewLieuSection] = useState('cuisine')
  const [newCatNom, setNewCatNom] = useState('')
  const [newCatEmoji, setNewCatEmoji] = useState('🍽')
  const [newCatSection, setNewCatSection] = useState('cuisine')

  // Edition inline
  const [editingLieu, setEditingLieu] = useState(null)
  const [editingCat, setEditingCat] = useState(null)

  const { c } = useTheme()
  const { role } = useRole()
  const isMobile = useIsMobile()
  const router = useRouter()

  useEffect(() => {
    checkAuth()
    loadAll()
  }, [])

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.push('/'); return }
    if (role && role !== 'admin') { router.push('/dashboard'); return }
  }

  const loadAll = async () => {
    try {
      setLoading(true)
      const clientId = await getClientId()
      if (!clientId) return

      const [
        { data: lieuxData },
        { data: catsData },
        { data: clientData }
      ] = await Promise.all([
        supabase.from('lieux').select('*').eq('client_id', clientId).order('ordre'),
        supabase.from('categories_plats').select('*').eq('client_id', clientId).order('ordre'),
        supabase.from('clients').select('*').eq('id', clientId).single()
      ])

      setLieux(lieuxData || [])
      setCategoriesCuisine((catsData || []).filter(c => c.section === 'cuisine'))
      setCategoriesBar((catsData || []).filter(c => c.section === 'bar'))

      if (clientData) {
        setParams({
          seuil_vert_cuisine: clientData.seuil_vert_cuisine || 28,
          seuil_orange_cuisine: clientData.seuil_orange_cuisine || 35,
          seuil_vert_boissons: clientData.seuil_vert_boissons || 22,
          seuil_orange_boissons: clientData.seuil_orange_boissons || 28,
          tva_restauration: clientData.tva_restauration || 10,
          inventaire_tournant_actif: clientData.inventaire_tournant_actif ?? true,
          inventaire_tournant_frequence: clientData.inventaire_tournant_frequence || 'weekly',
          inventaire_tournant_jour_semaine: clientData.inventaire_tournant_jour_semaine ?? 1,
          inventaire_tournant_heure: clientData.inventaire_tournant_heure ?? 8,
          inventaire_tournant_dernier: clientData.inventaire_tournant_dernier || null,
        })
      }
    } catch (err) {
      console.error('Load error:', err)
    } finally {
      setLoading(false)
    }
  }

  const showMessage = (msg, type = 'success') => {
    setMessage(msg)
    setMessageType(type)
    setTimeout(() => setMessage(''), 3000)
  }

  // ── LIEUX ──────────────────────────────────────────────────────────────────

  const ajouterLieu = async () => {
    if (!newLieuNom.trim()) return
    setSaving(true)
    try {
      const clientId = await getClientId()
      const ordre = lieux.filter(l => l.section === newLieuSection).length + 1
      const { error } = await supabase.from('lieux').insert([{
        client_id: clientId,
        nom: newLieuNom.trim(),
        emoji: newLieuEmoji,
        section: newLieuSection,
        ordre
      }])
      if (error) throw error
      setNewLieuNom('')
      setNewLieuEmoji('🍽')
      await loadAll()
      showMessage('Lieu ajouté !')
    } catch (err) {
      showMessage('Erreur lors de l\'ajout', 'error')
    } finally { setSaving(false) }
  }

  const modifierLieu = async (lieu) => {
    try {
      const clientId = await getClientId()
      const { error } = await supabase.from('lieux').update({
        nom: lieu.nom, emoji: lieu.emoji
      }).eq('id', lieu.id).eq('client_id', clientId)
      if (error) throw error
      setEditingLieu(null)
      await loadAll()
      showMessage('Lieu mis à jour !')
    } catch (err) {
      showMessage('Erreur', 'error')
    }
  }

  const supprimerLieu = async (id) => {
    if (!confirm('Supprimer ce lieu ? Les fiches associées perdront leur lieu.')) return
    try {
      const clientId = await getClientId()
      const { error } = await supabase.from('lieux').delete().eq('id', id).eq('client_id', clientId)
      if (error) throw error
      await loadAll()
      showMessage('Lieu supprimé')
    } catch (err) {
      showMessage('Erreur', 'error')
    }
  }

  // ── CATÉGORIES ─────────────────────────────────────────────────────────────

  const ajouterCategorie = async () => {
    if (!newCatNom.trim()) return
    setSaving(true)
    try {
      const clientId = await getClientId()
      const liste = newCatSection === 'cuisine' ? categoriesCuisine : categoriesBar
      const { error } = await supabase.from('categories_plats').insert([{
        client_id: clientId,
        nom: newCatNom.trim(),
        emoji: newCatEmoji,
        section: newCatSection,
        ordre: liste.length + 1
      }])
      if (error) throw error
      setNewCatNom('')
      setNewCatEmoji('🍽')
      await loadAll()
      showMessage('Catégorie ajoutée !')
    } catch (err) {
      showMessage('Erreur lors de l\'ajout', 'error')
    } finally { setSaving(false) }
  }

  const modifierCategorie = async (cat) => {
    try {
      const clientId = await getClientId()
      const { error } = await supabase.from('categories_plats').update({
        nom: cat.nom, emoji: cat.emoji
      }).eq('id', cat.id).eq('client_id', clientId)
      if (error) throw error
      setEditingCat(null)
      await loadAll()
      showMessage('Catégorie mise à jour !')
    } catch (err) {
      showMessage('Erreur', 'error')
    }
  }

  const supprimerCategorie = async (id) => {
    if (!confirm('Supprimer cette catégorie ? Les fiches associées perdront leur catégorie.')) return
    try {
      const clientId = await getClientId()
      const { error } = await supabase.from('categories_plats').delete().eq('id', id).eq('client_id', clientId)
      if (error) throw error
      await loadAll()
      showMessage('Catégorie supprimée')
    } catch (err) {
      showMessage('Erreur', 'error')
    }
  }

  // ── PARAMÈTRES ─────────────────────────────────────────────────────────────

  const sauvegarderParams = async () => {
    setSaving(true)
    try {
      const clientId = await getClientId()
      const { error } = await supabase.from('clients').update({
        seuil_vert_cuisine: parseFloat(params.seuil_vert_cuisine),
        seuil_orange_cuisine: parseFloat(params.seuil_orange_cuisine),
        seuil_vert_boissons: parseFloat(params.seuil_vert_boissons),
        seuil_orange_boissons: parseFloat(params.seuil_orange_boissons),
        tva_restauration: parseFloat(params.tva_restauration),
        inventaire_tournant_actif: !!params.inventaire_tournant_actif,
        inventaire_tournant_frequence: params.inventaire_tournant_frequence,
        inventaire_tournant_jour_semaine: parseInt(params.inventaire_tournant_jour_semaine),
        inventaire_tournant_heure: parseInt(params.inventaire_tournant_heure),
      }).eq('id', clientId)
      if (error) throw error
      showMessage('Paramètres sauvegardés !')
    } catch (err) {
      showMessage('Erreur lors de la sauvegarde', 'error')
    } finally { setSaving(false) }
  }

  // ── RENDER ─────────────────────────────────────────────────────────────────

  const LieuItem = ({ lieu }) => {
    const isEditing = editingLieu?.id === lieu.id
    const [localLieu, setLocalLieu] = useState({ ...lieu })

    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: '12px',
        padding: '12px 16px', background: c.blanc,
        border: `0.5px solid ${c.bordure}`, borderRadius: '10px'
      }}>
        {isEditing ? (
          <>
            <select value={localLieu.emoji} onChange={e => setLocalLieu({ ...localLieu, emoji: e.target.value })}
              style={{ padding: '6px', borderRadius: '6px', border: `0.5px solid ${c.bordure}`, fontSize: '18px', background: c.blanc }}>
              {EMOJIS_LIEUX.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
            <input value={localLieu.nom} onChange={e => setLocalLieu({ ...localLieu, nom: e.target.value })}
              style={{ flex: 1, padding: '8px 10px', borderRadius: '8px', border: `0.5px solid ${c.accent}`, fontSize: '14px', outline: 'none', color: c.texte, background: c.blanc }}
            />
            <button onClick={() => modifierLieu(localLieu)} style={{ background: c.accent, color: 'white', border: 'none', borderRadius: '6px', padding: '7px 12px', fontSize: '12px', cursor: 'pointer', fontWeight: '500' }}>✓</button>
            <button onClick={() => setEditingLieu(null)} style={{ background: c.fond, color: c.texteMuted, border: `0.5px solid ${c.bordure}`, borderRadius: '6px', padding: '7px 10px', fontSize: '12px', cursor: 'pointer' }}>✕</button>
          </>
        ) : (
          <>
            <span style={{ fontSize: '20px' }}>{lieu.emoji}</span>
            <span style={{ flex: 1, fontSize: '14px', fontWeight: '500', color: c.texte }}>{lieu.nom}</span>
            <span style={{ fontSize: '11px', background: lieu.section === 'cuisine' ? c.accentClair : '#EDE9FE', color: lieu.section === 'cuisine' ? c.accent : '#7C3AED', borderRadius: '20px', padding: '2px 10px' }}>
              {lieu.section === 'cuisine' ? 'Cuisine' : 'Bar'}
            </span>
            <button onClick={() => { setEditingLieu(lieu); }} style={{ background: 'transparent', border: `0.5px solid ${c.bordure}`, borderRadius: '6px', padding: '6px 10px', fontSize: '12px', cursor: 'pointer', color: c.texteMuted }}>✏️</button>
            <button onClick={() => supprimerLieu(lieu.id)} style={{ background: 'transparent', border: '0.5px solid #FECACA', borderRadius: '6px', padding: '6px 10px', fontSize: '12px', cursor: 'pointer', color: '#DC2626' }}>🗑</button>
          </>
        )}
      </div>
    )
  }

  const CatItem = ({ cat }) => {
    const isEditing = editingCat?.id === cat.id
    const [localCat, setLocalCat] = useState({ ...cat })

    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: '12px',
        padding: '12px 16px', background: c.blanc,
        border: `0.5px solid ${c.bordure}`, borderRadius: '10px'
      }}>
        {isEditing ? (
          <>
            <select value={localCat.emoji} onChange={e => setLocalCat({ ...localCat, emoji: e.target.value })}
              style={{ padding: '6px', borderRadius: '6px', border: `0.5px solid ${c.bordure}`, fontSize: '18px', background: c.blanc }}>
              {EMOJIS_CATS.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
            <input value={localCat.nom} onChange={e => setLocalCat({ ...localCat, nom: e.target.value })}
              style={{ flex: 1, padding: '8px 10px', borderRadius: '8px', border: `0.5px solid ${c.accent}`, fontSize: '14px', outline: 'none', color: c.texte, background: c.blanc }}
            />
            <button onClick={() => modifierCategorie(localCat)} style={{ background: c.accent, color: 'white', border: 'none', borderRadius: '6px', padding: '7px 12px', fontSize: '12px', cursor: 'pointer', fontWeight: '500' }}>✓</button>
            <button onClick={() => setEditingCat(null)} style={{ background: c.fond, color: c.texteMuted, border: `0.5px solid ${c.bordure}`, borderRadius: '6px', padding: '7px 10px', fontSize: '12px', cursor: 'pointer' }}>✕</button>
          </>
        ) : (
          <>
            <span style={{ fontSize: '20px' }}>{cat.emoji}</span>
            <span style={{ flex: 1, fontSize: '14px', fontWeight: '500', color: c.texte }}>{cat.nom}</span>
            <button onClick={() => setEditingCat(cat)} style={{ background: 'transparent', border: `0.5px solid ${c.bordure}`, borderRadius: '6px', padding: '6px 10px', fontSize: '12px', cursor: 'pointer', color: c.texteMuted }}>✏️</button>
            <button onClick={() => supprimerCategorie(cat.id)} style={{ background: 'transparent', border: '0.5px solid #FECACA', borderRadius: '6px', padding: '6px 10px', fontSize: '12px', cursor: 'pointer', color: '#DC2626' }}>🗑</button>
          </>
        )}
      </div>
    )
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', background: c.fond }}>
      <Navbar section="cuisine" />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px', color: c.texteMuted }}>Chargement...</div>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: c.fond }}>
      <Navbar section="cuisine" />

      <div style={{ padding: '24px', maxWidth: '900px', margin: '0 auto' }}>

        {/* Message */}
        {message && (
          <div style={{
            padding: '12px 16px', borderRadius: '10px', marginBottom: '16px', fontSize: '13px', fontWeight: '500',
            background: messageType === 'success' ? '#DCFCE7' : '#FEE2E2',
            color: messageType === 'success' ? '#16A34A' : '#DC2626',
            border: `0.5px solid ${messageType === 'success' ? '#86EFAC' : '#FECACA'}`
          }}>
            {message}
          </div>
        )}

        {/* Onglets */}
        <div style={{ display: 'flex', gap: '6px', marginBottom: '24px', background: c.blanc, padding: '4px', borderRadius: '10px', border: `0.5px solid ${c.bordure}`, width: 'fit-content' }}>
          {[
            { id: 'lieux', label: '🏠 Lieux de service' },
            { id: 'categories', label: '🍽 Catégories' },
            { id: 'params', label: '⚙️ Paramètres' },
          ].map(tab => (
            <button key={tab.id} onClick={() => setOnglet(tab.id)} style={{
              padding: '8px 16px', borderRadius: '7px', fontSize: '13px', border: 'none',
              cursor: 'pointer', fontWeight: onglet === tab.id ? '500' : '400',
              background: onglet === tab.id ? c.accent : 'transparent',
              color: onglet === tab.id ? 'white' : c.texteMuted,
              transition: 'all 0.15s'
            }}>{tab.label}</button>
          ))}
        </div>

        {/* ── ONGLET LIEUX ── */}
        {onglet === 'lieux' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

            {/* Formulaire ajout */}
            <div style={{ background: c.blanc, borderRadius: '12px', padding: '20px', border: `0.5px solid ${c.bordure}` }}>
              <div style={{ fontSize: '13px', fontWeight: '500', color: c.texteMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '14px' }}>Nouveau lieu de service</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'flex-end' }}>
                <div style={{ width: isMobile ? '64px' : '80px', flexShrink: 0 }}>
                  <label style={{ fontSize: '12px', color: c.texteMuted, display: 'block', marginBottom: '6px' }}>Emoji</label>
                  <select value={newLieuEmoji} onChange={e => setNewLieuEmoji(e.target.value)}
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, fontSize: '20px', background: c.blanc, textAlign: 'center' }}>
                    {EMOJIS_LIEUX.map(e => <option key={e} value={e}>{e}</option>)}
                  </select>
                </div>
                <div style={{ flex: '1 1 160px' }}>
                  <label style={{ fontSize: '12px', color: c.texteMuted, display: 'block', marginBottom: '6px' }}>Nom *</label>
                  <input type="text" value={newLieuNom} onChange={e => setNewLieuNom(e.target.value)}
                    placeholder="Ex : Terrasse, Banquet, Spa..."
                    onKeyDown={e => e.key === 'Enter' && ajouterLieu()}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, fontSize: '14px', outline: 'none', color: c.texte, background: c.blanc }}
                  />
                </div>
                <div style={{ flex: '1 1 120px' }}>
                  <label style={{ fontSize: '12px', color: c.texteMuted, display: 'block', marginBottom: '6px' }}>Section</label>
                  <select value={newLieuSection} onChange={e => setNewLieuSection(e.target.value)}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, fontSize: '13px', background: c.blanc, outline: 'none', color: c.texte }}>
                    <option value="cuisine">Cuisine</option>
                    <option value="bar">Bar</option>
                  </select>
                </div>
                <button onClick={ajouterLieu} disabled={saving || !newLieuNom.trim()} style={{
                  padding: '10px 16px', background: saving || !newLieuNom.trim() ? c.texteMuted : c.accent,
                  color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px',
                  fontWeight: '500', cursor: saving || !newLieuNom.trim() ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
                }}>+ Ajouter</button>
              </div>
            </div>

            {/* Liste cuisine */}
            <div style={{ background: c.blanc, borderRadius: '12px', padding: '20px', border: `0.5px solid ${c.bordure}` }}>
              <div style={{ fontSize: '13px', fontWeight: '500', color: c.texteMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '14px' }}>
                Lieux cuisine — {lieux.filter(l => l.section === 'cuisine').length}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {lieux.filter(l => l.section === 'cuisine').map(lieu => (
                  <LieuItem key={lieu.id} lieu={lieu} />
                ))}
                {lieux.filter(l => l.section === 'cuisine').length === 0 && (
                  <div style={{ fontSize: '13px', color: c.texteMuted, fontStyle: 'italic', padding: '8px' }}>Aucun lieu cuisine — ajoutez-en un ci-dessus</div>
                )}
              </div>
            </div>

            {/* Liste bar */}
            <div style={{ background: c.blanc, borderRadius: '12px', padding: '20px', border: `0.5px solid ${c.bordure}` }}>
              <div style={{ fontSize: '13px', fontWeight: '500', color: c.texteMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '14px' }}>
                Lieux bar — {lieux.filter(l => l.section === 'bar').length}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {lieux.filter(l => l.section === 'bar').map(lieu => (
                  <LieuItem key={lieu.id} lieu={lieu} />
                ))}
                {lieux.filter(l => l.section === 'bar').length === 0 && (
                  <div style={{ fontSize: '13px', color: c.texteMuted, fontStyle: 'italic', padding: '8px' }}>Aucun lieu bar</div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── ONGLET CATÉGORIES ── */}
        {onglet === 'categories' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

            {/* Formulaire ajout */}
            <div style={{ background: c.blanc, borderRadius: '12px', padding: '20px', border: `0.5px solid ${c.bordure}` }}>
              <div style={{ fontSize: '13px', fontWeight: '500', color: c.texteMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '14px' }}>Nouvelle catégorie</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'flex-end' }}>
                <div style={{ width: isMobile ? '64px' : '80px', flexShrink: 0 }}>
                  <label style={{ fontSize: '12px', color: c.texteMuted, display: 'block', marginBottom: '6px' }}>Emoji</label>
                  <select value={newCatEmoji} onChange={e => setNewCatEmoji(e.target.value)}
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, fontSize: '20px', background: c.blanc, textAlign: 'center' }}>
                    {EMOJIS_CATS.map(e => <option key={e} value={e}>{e}</option>)}
                  </select>
                </div>
                <div style={{ flex: '1 1 160px' }}>
                  <label style={{ fontSize: '12px', color: c.texteMuted, display: 'block', marginBottom: '6px' }}>Nom *</label>
                  <input type="text" value={newCatNom} onChange={e => setNewCatNom(e.target.value)}
                    placeholder="Ex : Amuse-bouches, Mignardises..."
                    onKeyDown={e => e.key === 'Enter' && ajouterCategorie()}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, fontSize: '14px', outline: 'none', color: c.texte, background: c.blanc }}
                  />
                </div>
                <div style={{ flex: '1 1 120px' }}>
                  <label style={{ fontSize: '12px', color: c.texteMuted, display: 'block', marginBottom: '6px' }}>Section</label>
                  <select value={newCatSection} onChange={e => setNewCatSection(e.target.value)}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, fontSize: '13px', background: c.blanc, outline: 'none', color: c.texte }}>
                    <option value="cuisine">Cuisine</option>
                    <option value="bar">Bar</option>
                  </select>
                </div>
                <button onClick={ajouterCategorie} disabled={saving || !newCatNom.trim()} style={{
                  padding: '10px 16px', background: saving || !newCatNom.trim() ? c.texteMuted : c.accent,
                  color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px',
                  fontWeight: '500', cursor: saving || !newCatNom.trim() ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
                }}>+ Ajouter</button>
              </div>
            </div>

            {/* Catégories cuisine */}
            <div style={{ background: c.blanc, borderRadius: '12px', padding: '20px', border: `0.5px solid ${c.bordure}` }}>
              <div style={{ fontSize: '13px', fontWeight: '500', color: c.texteMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '14px' }}>
                Catégories cuisine — {categoriesCuisine.length}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {categoriesCuisine.map(cat => <CatItem key={cat.id} cat={cat} />)}
                {categoriesCuisine.length === 0 && (
                  <div style={{ fontSize: '13px', color: c.texteMuted, fontStyle: 'italic', padding: '8px' }}>Aucune catégorie cuisine</div>
                )}
              </div>
            </div>

            {/* Catégories bar */}
            <div style={{ background: c.blanc, borderRadius: '12px', padding: '20px', border: `0.5px solid ${c.bordure}` }}>
              <div style={{ fontSize: '13px', fontWeight: '500', color: c.texteMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '14px' }}>
                Catégories bar — {categoriesBar.length}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {categoriesBar.map(cat => <CatItem key={cat.id} cat={cat} />)}
                {categoriesBar.length === 0 && (
                  <div style={{ fontSize: '13px', color: c.texteMuted, fontStyle: 'italic', padding: '8px' }}>Aucune catégorie bar</div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── ONGLET PARAMÈTRES ── */}
        {onglet === 'params' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

            {/* Seuils cuisine */}
            <div style={{ background: c.blanc, borderRadius: '12px', padding: '20px', border: `0.5px solid ${c.bordure}` }}>
              <div style={{ fontSize: '13px', fontWeight: '500', color: c.texteMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '16px' }}>🍽 Seuils food cost cuisine</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ fontSize: '12px', color: '#16A34A', fontWeight: '500', display: 'block', marginBottom: '6px' }}>Seuil vert (excellent) %</label>
                  <input type="number" value={params.seuil_vert_cuisine || ''} onChange={e => setParams({ ...params, seuil_vert_cuisine: e.target.value })}
                    style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '0.5px solid #86EFAC', fontSize: '14px', outline: 'none', color: c.texte, background: '#F0FDF4' }}
                  />
                  <div style={{ fontSize: '11px', color: '#16A34A', marginTop: '4px' }}>En dessous de ce seuil = excellent</div>
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: '#D97706', fontWeight: '500', display: 'block', marginBottom: '6px' }}>Seuil orange (attention) %</label>
                  <input type="number" value={params.seuil_orange_cuisine || ''} onChange={e => setParams({ ...params, seuil_orange_cuisine: e.target.value })}
                    style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '0.5px solid #FDE68A', fontSize: '14px', outline: 'none', color: c.texte, background: '#FFFBEB' }}
                  />
                  <div style={{ fontSize: '11px', color: '#D97706', marginTop: '4px' }}>Au-dessus = rouge critique</div>
                </div>
              </div>
            </div>

            {/* Seuils bar */}
            <div style={{ background: c.blanc, borderRadius: '12px', padding: '20px', border: `0.5px solid ${c.bordure}` }}>
              <div style={{ fontSize: '13px', fontWeight: '500', color: c.texteMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '16px' }}>🍷 Seuils food cost bar</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ fontSize: '12px', color: '#16A34A', fontWeight: '500', display: 'block', marginBottom: '6px' }}>Seuil vert (excellent) %</label>
                  <input type="number" value={params.seuil_vert_boissons || ''} onChange={e => setParams({ ...params, seuil_vert_boissons: e.target.value })}
                    style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '0.5px solid #86EFAC', fontSize: '14px', outline: 'none', color: c.texte, background: '#F0FDF4' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: '#D97706', fontWeight: '500', display: 'block', marginBottom: '6px' }}>Seuil orange (attention) %</label>
                  <input type="number" value={params.seuil_orange_boissons || ''} onChange={e => setParams({ ...params, seuil_orange_boissons: e.target.value })}
                    style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '0.5px solid #FDE68A', fontSize: '14px', outline: 'none', color: c.texte, background: '#FFFBEB' }}
                  />
                </div>
              </div>
            </div>

            {/* TVA */}
            <div style={{ background: c.blanc, borderRadius: '12px', padding: '20px', border: `0.5px solid ${c.bordure}` }}>
              <div style={{ fontSize: '13px', fontWeight: '500', color: c.texteMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '16px' }}>💶 TVA restauration</div>
              <div style={{ maxWidth: '200px' }}>
                <label style={{ fontSize: '12px', color: c.texteMuted, fontWeight: '500', display: 'block', marginBottom: '6px' }}>TVA par défaut %</label>
                <input type="number" value={params.tva_restauration || ''} onChange={e => setParams({ ...params, tva_restauration: e.target.value })}
                  style={{ width: '100%', padding: '12px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, fontSize: '14px', outline: 'none', color: c.texte, background: c.blanc }}
                />
                <div style={{ fontSize: '11px', color: c.texteMuted, marginTop: '4px' }}>Note : alcool toujours à 20%</div>
              </div>
            </div>

            {/* Inventaire tournant */}
            <div style={{ background: c.blanc, borderRadius: '12px', padding: '20px', border: `0.5px solid ${c.bordure}` }}>
              <div style={{ fontSize: '13px', fontWeight: '500', color: c.texteMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '16px' }}>📋 Inventaire tournant (Flash)</div>

              {/* Toggle actif */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                <button
                  onClick={() => setParams({ ...params, inventaire_tournant_actif: !params.inventaire_tournant_actif })}
                  style={{
                    width: '44px', height: '24px', borderRadius: '12px', border: 'none', cursor: 'pointer',
                    background: params.inventaire_tournant_actif ? '#16A34A' : '#D1D5DB',
                    position: 'relative', transition: 'background 0.2s'
                  }}
                >
                  <span style={{
                    position: 'absolute', top: '2px',
                    left: params.inventaire_tournant_actif ? '22px' : '2px',
                    width: '20px', height: '20px', borderRadius: '50%',
                    background: 'white', transition: 'left 0.2s',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
                  }} />
                </button>
                <span style={{ fontSize: '14px', color: c.texte }}>
                  {params.inventaire_tournant_actif ? 'Notifications activées' : 'Notifications désactivées'}
                </span>
              </div>

              {params.inventaire_tournant_actif && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
                  <div>
                    <label style={{ fontSize: '12px', color: c.texteMuted, fontWeight: '500', display: 'block', marginBottom: '6px' }}>Fréquence</label>
                    <select
                      value={params.inventaire_tournant_frequence || 'weekly'}
                      onChange={e => setParams({ ...params, inventaire_tournant_frequence: e.target.value })}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, fontSize: '13px', background: c.blanc, outline: 'none', color: c.texte }}
                    >
                      {INVENTAIRE_FREQUENCES.map(f => (
                        <option key={f.value} value={f.value}>{f.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: '12px', color: c.texteMuted, fontWeight: '500', display: 'block', marginBottom: '6px' }}>Jour</label>
                    <select
                      value={params.inventaire_tournant_jour_semaine ?? 1}
                      onChange={e => setParams({ ...params, inventaire_tournant_jour_semaine: parseInt(e.target.value) })}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, fontSize: '13px', background: c.blanc, outline: 'none', color: c.texte }}
                    >
                      {JOURS_SEMAINE.map(j => (
                        <option key={j.value} value={j.value}>{j.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: '12px', color: c.texteMuted, fontWeight: '500', display: 'block', marginBottom: '6px' }}>Heure</label>
                    <select
                      value={params.inventaire_tournant_heure ?? 8}
                      onChange={e => setParams({ ...params, inventaire_tournant_heure: parseInt(e.target.value) })}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, fontSize: '13px', background: c.blanc, outline: 'none', color: c.texte }}
                    >
                      {Array.from({ length: 24 }, (_, i) => (
                        <option key={i} value={i}>{String(i).padStart(2, '0')}:00</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {params.inventaire_tournant_dernier && (
                <div style={{ fontSize: '12px', color: c.texteMuted, marginTop: '12px' }}>
                  Dernier inventaire tournant : {new Date(params.inventaire_tournant_dernier).toLocaleDateString('fr-FR')}
                </div>
              )}
            </div>

            <button onClick={sauvegarderParams} disabled={saving} style={{
              padding: '14px', background: saving ? c.texteMuted : c.accent, color: 'white',
              border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: '500',
              cursor: saving ? 'not-allowed' : 'pointer'
            }}>
              {saving ? 'Sauvegarde...' : '💾 Sauvegarder les paramètres'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
