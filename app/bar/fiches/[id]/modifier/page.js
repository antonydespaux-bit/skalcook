'use client'
import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase, getParametres, getClientId } from '../../../../../lib/supabase'
import { useRouter, useParams } from 'next/navigation'
import { theme, Logo } from '../../../../../lib/theme.jsx'
import { useIsMobile } from '../../../../../lib/useIsMobile'
import { useTheme } from '../../../../../lib/useTheme'
import { useAutosave } from '../../../../../lib/useAutosave'
import { log } from '../../../../../lib/useLog'
import { ALLERGENES } from '../../../../../lib/allergenes'
import { SAISONS, getYearsRange, parseSaison } from '../../../../../lib/saison'
import IngredientSearch from '../../../../../components/IngredientSearch'
import ChefLoader from '../../../../../components/ChefLoader'
import BackButton from '../../../../../components/BackButton'
import { uploadFichePhoto } from '../../../../../lib/uploadPhoto'
import { Alert, Card } from '../../../../../components/ui'

const CATEGORIES_ALCOOL = ['Cocktails', 'Vins', 'Champagnes', 'Bières', 'Spiritueux']

export default function ModifierBarFiche() {
  const [nom, setNom] = useState('')
  const [categoriePlat, setCategoriePlat] = useState('')
  const [lieuId, setLieuId] = useState('')
  const [nbPortions, setNbPortions] = useState('')
  const [prixTTC, setPrixTTC] = useState('')
  const [perte, setPerte] = useState(0)
  const [description, setDescription] = useState('')
  const [instructions, setInstructions] = useState('')
  const [saison, setSaison] = useState('')
  const [annee, setAnnee] = useState(new Date().getFullYear())
  const [allergenes, setAllergenes] = useState([])
  const [photo, setPhoto] = useState(null)
  const [photoPreview, setPhotoPreview] = useState(null)
  const [existingPhotoUrl, setExistingPhotoUrl] = useState(null)
  const [ingredients, setIngredients] = useState([])
  const [listeIngredients, setListeIngredients] = useState([])
  const [lieux, setLieux] = useState([])
  const [categoriesDyn, setCategoriesDyn] = useState([])
  const [params, setParams] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [draftRestored, setDraftRestored] = useState(false)
  const router = useRouter()
  const params_route = useParams()
  const { t, i18n } = useTranslation()
  const { c, logoUrl, nomEtablissement } = useTheme()
  const isMobile = useIsMobile()

  const catSelectionnee = categoriesDyn.find(cat => cat.id === categoriePlat)
  const isSousFiche = catSelectionnee?.nom === 'Sous-fiche' || catSelectionnee?.nom === 'Sous-fiches'
  const nomCat = catSelectionnee?.nom || ''
  const isAlcool = CATEGORIES_ALCOOL.includes(nomCat)

  const autosaveData = { nom, categoriePlat, lieuId, nbPortions, prixTTC, perte, description, instructions, saison, annee, allergenes, ingredients }
  const annees = getYearsRange()
  const { hasDraft, lastSaved, getDraft, clearDraft } = useAutosave(`modifier-fiche-bar-${params_route.id}`, autosaveData, 60000)

  useEffect(() => {
    checkUser()
    loadData()
    loadParams()
  }, [])

  const checkUser = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) router.push('/')
  }

  const loadParams = async () => {
    const p = await getParametres()
    setParams(p)
  }

  const loadData = async () => {
    try {
      const clientId = await getClientId()
      if (!clientId) { router.push('/'); return }

      const [
        { data: ficheData },
        { data: lieuxData },
        { data: catsData },
        { data: liste }
      ] = await Promise.all([
        supabase.from('fiches_bar').select('*').eq('id', params_route.id).eq('client_id', clientId).single(),
        supabase.from('lieux').select('*').eq('client_id', clientId).eq('section', 'bar').order('ordre'),
        supabase.from('categories_plats').select('*').eq('client_id', clientId).eq('section', 'bar').order('ordre'),
        supabase.from('ingredients_bar').select('*').eq('client_id', clientId).order('nom').limit(5000)
      ])

      if (!ficheData) { router.push('/bar/fiches'); return }

      setLieux(lieuxData || [])
      setCategoriesDyn(catsData || [])
      setListeIngredients(liste || [])

      setNom(ficheData.nom)
      setCategoriePlat(ficheData.categorie_plat_id || '')
      setLieuId(ficheData.lieu_id || '')
      setNbPortions(ficheData.nb_portions || '')
      setPrixTTC(ficheData.prix_ttc || '')
      setPerte(ficheData.perte || 0)
      setDescription(ficheData.description || '')
      setInstructions(ficheData.instructions || '')
      if (ficheData.annee || (ficheData.saison && SAISONS.includes(ficheData.saison))) {
        setSaison(ficheData.saison || '')
        setAnnee(ficheData.annee || null)
      } else {
        const parsed = parseSaison(ficheData.saison)
        setSaison(parsed.saison)
        setAnnee(parsed.annee)
      }
      setAllergenes(ficheData.allergenes || [])

      if (ficheData.photo_url) {
        const url = ficheData.photo_url.startsWith('http')
          ? ficheData.photo_url
          : supabase.storage.from('fiches-photos').getPublicUrl(ficheData.photo_url).data?.publicUrl
        setExistingPhotoUrl(url || null)
      }

      // Requête ingrédients en deux temps
      const { data: liens } = await supabase
        .from('fiche_bar_ingredients')
        .select('quantite, unite, ingredient_id, sous_fiche_id')
        .eq('fiche_bar_id', params_route.id)
        .eq('client_id', clientId)

      if (liens && liens.length > 0) {
        const ingIds = liens.filter(l => l.ingredient_id && !l.sous_fiche_id).map(l => l.ingredient_id)
        const sfIds = liens.filter(l => l.sous_fiche_id).map(l => l.sous_fiche_id)

        const [{ data: ingsData }, { data: sfsData }] = await Promise.all([
          ingIds.length > 0
            ? supabase.from('ingredients_bar').select('id, nom, prix_kg, unite').eq('client_id', clientId).in('id', ingIds)
            : Promise.resolve({ data: [] }),
          sfIds.length > 0
            ? supabase.from('fiches_bar').select('id, nom, cout_portion, unite_production').eq('client_id', clientId).in('id', sfIds)
            : Promise.resolve({ data: [] })
        ])

        const ingsMap = Object.fromEntries((ingsData || []).map(i => [i.id, i]))
        const sfsMap = Object.fromEntries((sfsData || []).map(s => [s.id, s]))

        setIngredients(liens.map(l => ({
          ingredient_id: l.ingredient_id || '',
          sous_fiche_id: l.sous_fiche_id || '',
          nom: l.ingredient_id ? (ingsMap[l.ingredient_id]?.nom || '') : (sfsMap[l.sous_fiche_id]?.nom || ''),
          quantite: l.quantite,
          unite: l.unite
        })))
      } else {
        setIngredients([])
      }
    } catch (err) {
      console.error('Load data error:', err)
    } finally {
      setLoading(false)
    }
  }

  const restaurerBrouillon = () => {
    const draft = getDraft()
    if (!draft) return
    setNom(draft.nom || '')
    setCategoriePlat(draft.categoriePlat || '')
    setLieuId(draft.lieuId || '')
    setNbPortions(draft.nbPortions || '')
    setPrixTTC(draft.prixTTC || '')
    setPerte(draft.perte || 0)
    setDescription(draft.description || '')
    setInstructions(draft.instructions || '')
    setSaison(draft.saison || '')
    setAnnee(draft.annee || new Date().getFullYear())
    setAllergenes(draft.allergenes || [])
    setIngredients(draft.ingredients || [])
    setDraftRestored(true)
  }

  const toggleAllergene = (id) => {
    setAllergenes(prev => prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id])
  }

  const handlePhoto = (e) => {
    const file = e.target.files[0]
    if (!file) return
    setPhoto(file)
    setPhotoPreview(URL.createObjectURL(file))
  }

  const ajouterIngredient = () => {
    setIngredients([...ingredients, { ingredient_id: '', nom: '', quantite: '', unite: 'cl' }])
  }

  const supprimerIngredient = (index) => {
    setIngredients(ingredients.filter((_, i) => i !== index))
  }

  const modifierIngredient = (index, champ, valeur) => {
    const nouveaux = [...ingredients]
    nouveaux[index][champ] = valeur
    if (champ === 'ingredient_id') {
      const ing = listeIngredients.find(i => i.id === valeur)
      if (ing) { nouveaux[index].nom = ing.nom; nouveaux[index].unite = ing.unite || 'cl' }
    }
    setIngredients(nouveaux)
  }

  const calculerCout = () => {
    return ingredients.reduce((total, ing) => {
      const ingData = listeIngredients.find(i => i.id === ing.ingredient_id)
      if (ingData?.prix_kg && ing.quantite) return total + (ingData.prix_kg * parseFloat(ing.quantite))
      return total
    }, 0)
  }

  const calculerCoutAvecPerte = () => {
    const cout = calculerCout()
    if (!cout || !perte || parseFloat(perte) <= 0) return cout
    return cout / (1 - parseFloat(perte) / 100)
  }

  const TVA_BAR = () => isAlcool ? 20 : 10

  const foodCost = () => {
    const cout = calculerCoutAvecPerte()
    if (!prixTTC || !cout || !nbPortions) return null
    const tva = 1 + TVA_BAR() / 100
    return (cout / parseFloat(nbPortions) / (parseFloat(prixTTC) / tva) * 100).toFixed(1)
  }

  const prixIndicatif = () => {
    const cout = calculerCoutAvecPerte()
    if (!cout || !nbPortions) return null
    const coutPortion = cout / parseFloat(nbPortions)
    const seuil = parseFloat(params['seuil_vert_boissons'] || 22) / 100
    const tva = 1 + TVA_BAR() / 100
    return (coutPortion / seuil * tva).toFixed(2)
  }

  const handleSubmit = async () => {
    if (!nom) { setError(t('bar.common.nameRequired')); return }
    setSaving(true)
    setError('')

    const clientId = await getClientId()
    if (!clientId) { setError(t('bar.common.sessionExpired')); setSaving(false); return }

    const cout = calculerCoutAvecPerte()
    const coutPortion = nbPortions ? (cout / parseFloat(nbPortions)) : null
    await supabase.from('fiches_bar').update({
      nom,
      categorie: nomCat,
      categorie_plat_id: categoriePlat || null,
      lieu_id: lieuId || null,
      nb_portions: nbPortions ? parseInt(nbPortions) : null,
      prix_ttc: prixTTC ? parseFloat(prixTTC) : null,
      description,
      instructions: instructions || null,
      saison: saison || null, annee: annee || null, allergenes,
      cout_portion: coutPortion,
      perte: perte ? parseFloat(perte) : 0,
      updated_at: new Date().toISOString()
    }).eq('id', params_route.id).eq('client_id', clientId)

    if (photo) {
      try {
        const photoUrl = await uploadFichePhoto(supabase, { clientId, ficheId: params_route.id, file: photo, isBar: true })
        await supabase.from('fiches_bar').update({ photo_url: photoUrl }).eq('id', params_route.id).eq('client_id', clientId)
      } catch (err) {
        setError(t('bar.form.errorPhotoUpload') + err.message); setSaving(false); return
      }
    }

    await supabase.from('fiche_bar_ingredients').delete().eq('fiche_bar_id', params_route.id).eq('client_id', clientId)

    const ingredientsAInserer = ingredients
      .filter(i => i.ingredient_id && i.quantite)
      .map(i => ({
        fiche_bar_id: params_route.id,
        ingredient_id: i.ingredient_id,
        quantite: parseFloat(i.quantite),
        unite: i.unite,
        client_id: clientId
      }))

    if (ingredientsAInserer.length > 0) {
      await supabase.from('fiche_bar_ingredients').insert(ingredientsAInserer)
    }

    await log({
      action: 'MODIFICATION', entite: 'fiche_bar', entite_id: params_route.id,
      entite_nom: nom, section: 'bar',
      details: `Catégorie: ${nomCat}, Saison: ${[saison, annee].filter(Boolean).join(' ')}${perte > 0 ? `, Perte: ${perte}%` : ''}`
    })

    clearDraft()
    router.push(`/bar/fiches/${params_route.id}`)
  }

  const fc = foodCost()
  const prixIndic = prixIndicatif()
  const seuilVert = parseFloat(params['seuil_vert_boissons'] || 22)
  const seuilOrange = parseFloat(params['seuil_orange_boissons'] || 28)
  const coutBrut = calculerCout()
  const coutAvecPerte = calculerCoutAvecPerte()

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: c.fond }}>
      <ChefLoader />
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: c.fond }}>
      <div style={{
        background: '#3C3489', borderBottom: '0.5px solid #7F77DD40',
        padding: '0 16px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', height: '56px',
        position: 'sticky', top: 0, zIndex: 100
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Logo height={28} couleur="white" nom={nomEtablissement} logoUrl={logoUrl} onClick={() => router.push("/bar/dashboard")} />
          <BackButton fallback={`/bar/fiches/${params_route.id}`} />
          {!isMobile && <span style={{ fontSize: '14px', fontWeight: '500', color: 'white' }}>{t('bar.form.edit', { nom })}</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {lastSaved && <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>{!isMobile && t('bar.common.savedAt', { time: lastSaved.toLocaleTimeString(i18n.language || 'fr', { hour: '2-digit', minute: '2-digit' }) })}{isMobile && '✓'}</span>}
          <button onClick={handleSubmit} disabled={saving} style={{
            background: saving ? '#666' : '#C4956A', color: '#3C3489', border: 'none',
            borderRadius: '8px', padding: '8px 16px', fontSize: '13px', fontWeight: '600', cursor: saving ? 'not-allowed' : 'pointer'
          }}>{saving ? t('bar.common.saving') : t('bar.common.save')}</button>
        </div>
      </div>

      <div style={{ padding: isMobile ? '12px' : '24px', maxWidth: '800px', margin: '0 auto' }}>

        {hasDraft && !draftRestored && (
          <div style={{ background: '#FAEEDA', border: '0.5px solid #FAC775', borderRadius: '10px', padding: '14px 16px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
            <div>
              <div style={{ fontSize: '13px', fontWeight: '500', color: '#633806' }}>{t('bar.common.draftFound')}</div>
              <div style={{ fontSize: '12px', color: '#854F0B', marginTop: '2px' }}>{t('bar.form.restoreEditsPrompt')}</div>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={restaurerBrouillon} style={{ padding: '8px 14px', background: '#854F0B', color: 'white', border: 'none', borderRadius: '8px', fontSize: '12px', cursor: 'pointer', fontWeight: '500' }}>{t('bar.common.restore')}</button>
              <button onClick={() => clearDraft()} style={{ padding: '8px 14px', background: 'transparent', color: '#854F0B', border: '0.5px solid #FAC775', borderRadius: '8px', fontSize: '12px', cursor: 'pointer' }}>{t('bar.common.ignore')}</button>
            </div>
          </div>
        )}

        {error && <Alert variant="error" style={{ marginBottom: '16px' }}>{error}</Alert>}

        <div style={{ background: isAlcool ? '#FCEBEB' : '#EAF3DE', borderRadius: '8px', padding: '10px 14px', fontSize: '12px', marginBottom: '16px', border: `0.5px solid ${isAlcool ? '#F09595' : '#4A7B6F40'}`, color: isAlcool ? '#A32D2D' : '#3B6D11' }}>
          {isAlcool ? t('bar.common.vatAlcool') : t('bar.common.vatSansAlcool')}
        </div>

        {/* Photo */}
        <Card c={c} style={{ marginBottom: '12px' }}>
          <div className="sk-label-muted" style={{ fontSize: '13px', color: c.texteMuted, marginBottom: '14px' }}>{t('bar.common.photoTitle')}</div>
          <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
            {photoPreview || existingPhotoUrl ? (
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <img src={photoPreview || existingPhotoUrl} alt={t('bar.common.preview')} style={{ width: isMobile ? '100px' : '160px', height: isMobile ? '80px' : '120px', objectFit: 'cover', borderRadius: '8px', border: `0.5px solid ${c.bordure}` }} />
                {photoPreview && (
                  <button onClick={() => { setPhoto(null); setPhotoPreview(null) }} style={{ position: 'absolute', top: '-8px', right: '-8px', background: '#A32D2D', color: 'white', border: 'none', borderRadius: '50%', width: '20px', height: '20px', fontSize: '12px', cursor: 'pointer' }}>×</button>
                )}
              </div>
            ) : (
              <div style={{ width: isMobile ? '100px' : '160px', height: isMobile ? '80px' : '120px', borderRadius: '8px', border: `1px dashed ${c.bordure}`, display: 'flex', alignItems: 'center', justifyContent: 'center', background: c.fond, flexDirection: 'column', gap: '4px', flexShrink: 0 }}>
                <span style={{ fontSize: '20px' }}>📷</span>
                <span style={{ fontSize: '10px', color: c.texteMuted }}>{t('bar.common.noPhoto')}</span>
              </div>
            )}
            <div style={{ flex: 1 }}>
              <input type="file" accept="image/*" onChange={handlePhoto}
                style={{ width: '100%', padding: '10px 12px', border: `0.5px solid ${c.accent}`, borderRadius: '8px', fontSize: '13px', background: c.accentClair, cursor: 'pointer', color: c.texte }}
              />
              <div style={{ fontSize: '11px', color: c.texteMuted, marginTop: '6px' }}>
                {existingPhotoUrl && !photoPreview ? t('bar.form.replacePhotoHint') : t('bar.common.photoFormats')}
              </div>
            </div>
          </div>
        </Card>

        {/* Infos générales */}
        <Card c={c} style={{ marginBottom: '12px' }}>
          <div className="sk-label-muted" style={{ fontSize: '13px', color: c.texteMuted, marginBottom: '14px' }}>{t('bar.common.generalInfo')}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <label style={{ fontSize: '12px', color: c.texteMuted, fontWeight: '500', display: 'block', marginBottom: '6px' }}>{t('bar.common.name')}</label>
              <input type="text" value={nom} onChange={e => setNom(e.target.value)}
                style={{ width: '100%', padding: '12px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, fontSize: '14px', outline: 'none', color: c.texte, background: c.blanc }}
              />
            </div>

            {/* Catégorie + Lieu dynamiques bar */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '12px', color: c.texteMuted, fontWeight: '500', display: 'block', marginBottom: '6px' }}>{t('bar.common.category')}</label>
                <select value={categoriePlat} onChange={e => setCategoriePlat(e.target.value)}
                  style={{ width: '100%', padding: '12px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, fontSize: '14px', background: c.blanc, outline: 'none', color: c.texte }}>
                  <option value="">{t('bar.common.noCategory')}</option>
                  {categoriesDyn.map(cat => <option key={cat.id} value={cat.id}>{cat.emoji} {cat.nom}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: '12px', color: c.texteMuted, fontWeight: '500', display: 'block', marginBottom: '6px' }}>{t('bar.common.serviceLocation')}</label>
                <select value={lieuId} onChange={e => setLieuId(e.target.value)}
                  style={{ width: '100%', padding: '12px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, fontSize: '14px', background: c.blanc, outline: 'none', color: c.texte }}>
                  <option value="">{t('bar.common.noLocation')}</option>
                  {lieux.map(l => <option key={l.id} value={l.id}>{l.emoji} {l.nom}</option>)}
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '12px', color: c.texteMuted, fontWeight: '500', display: 'block', marginBottom: '6px' }}>{t('bar.common.season')}</label>
                <select value={saison} onChange={e => setSaison(e.target.value)} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, fontSize: '14px', background: c.blanc, outline: 'none', color: c.texte }}>
                  <option value="">{t('bar.common.none')}</option>
                  {SAISONS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: '12px', color: c.texteMuted, fontWeight: '500', display: 'block', marginBottom: '6px' }}>{t('bar.common.year')}</label>
                <select value={annee || ''} onChange={e => setAnnee(e.target.value ? parseInt(e.target.value, 10) : null)} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, fontSize: '14px', background: c.blanc, outline: 'none', color: c.texte }}>
                  <option value="">{t('bar.common.none')}</option>
                  {annees.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '12px', color: c.texteMuted, fontWeight: '500', display: 'block', marginBottom: '6px' }}>{t('bar.form.nbPortionsEdit')}</label>
                <input type="number" value={nbPortions} onChange={e => setNbPortions(e.target.value)}
                  style={{ width: '100%', padding: '12px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, fontSize: '14px', outline: 'none', color: c.texte, background: c.blanc }}
                />
              </div>
              <div>
                <label style={{ fontSize: '12px', color: c.texteMuted, fontWeight: '500', display: 'block', marginBottom: '6px' }}>{t('bar.common.priceTTC')}</label>
                <input type="number" value={prixTTC} onChange={e => setPrixTTC(e.target.value)} step="0.01"
                  style={{ width: '100%', padding: '12px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, fontSize: '14px', outline: 'none', color: c.texte, background: c.blanc }}
                />
                {prixIndic && <div style={{ fontSize: '11px', color: '#3B6D11', marginTop: '4px' }}>{t('bar.common.indicative', { seuil: seuilVert, tva: TVA_BAR(), prix: prixIndic })}</div>}
              </div>
            </div>
            <div>
              <label style={{ fontSize: '12px', color: c.texteMuted, fontWeight: '500', display: 'block', marginBottom: '6px' }}>{t('bar.common.lossLabel')}</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input type="number" value={perte} onChange={e => setPerte(e.target.value)}
                  placeholder="0" min="0" max="99" step="0.5"
                  style={{ width: '100%', padding: '12px', borderRadius: '8px', border: `0.5px solid ${parseFloat(perte) > 0 ? '#FAC775' : c.bordure}`, fontSize: '14px', outline: 'none', color: c.texte, background: parseFloat(perte) > 0 ? '#FFFBF0' : c.blanc }}
                />
                <span style={{ fontSize: '16px', color: c.texteMuted, flexShrink: 0, fontWeight: '500' }}>%</span>
              </div>
              {parseFloat(perte) > 0 && (
                <div style={{ fontSize: '11px', color: '#854F0B', marginTop: '6px', padding: '6px 10px', background: '#FAEEDA', borderRadius: '6px', border: '0.5px solid #FAC775' }}>
                  {t('bar.common.lossWarning', { perte, coutBrut: coutBrut.toFixed(2), coutReel: coutAvecPerte.toFixed(2) })}
                </div>
              )}
            </div>
            <div>
              <label style={{ fontSize: '12px', color: c.texteMuted, fontWeight: '500', display: 'block', marginBottom: '6px' }}>{t('bar.form.descriptionShort')}</label>
              <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2}
                placeholder={t('bar.form.descriptionShortPlaceholder')}
                style={{ width: '100%', padding: '12px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, fontSize: '14px', outline: 'none', resize: 'vertical', fontFamily: 'inherit', color: c.texte, background: c.blanc }}
              />
            </div>
          </div>
        </Card>

        {/* Ingrédients */}
        <Card c={c} style={{ marginBottom: '12px' }}>
          <div className="sk-label-muted" style={{ fontSize: '13px', color: c.texteMuted, marginBottom: '14px' }}>{t('bar.common.ingredients')}</div>
          {isMobile ? (
            <>
              {ingredients.map((ing, index) => (
                <div key={index} style={{ background: c.fond, borderRadius: '8px', padding: '12px', marginBottom: '8px', border: `0.5px solid ${c.bordure}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span style={{ fontSize: '12px', color: c.texteMuted, fontWeight: '500' }}>{t('bar.common.ingredientN', { n: index + 1 })}</span>
                    <button onClick={() => supprimerIngredient(index)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#aaa', fontSize: '16px' }}>×</button>
                  </div>
                  <div style={{ marginBottom: '8px' }}>
                    <IngredientSearch ingredients={listeIngredients} value={ing.ingredient_id} onChange={val => modifierIngredient(index, 'ingredient_id', val)} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <input type="number" value={ing.quantite} step="0.01" onChange={e => modifierIngredient(index, 'quantite', e.target.value)} placeholder={t('bar.common.quantityPlaceholder')}
                      style={{ padding: '10px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, fontSize: '14px', outline: 'none', color: c.texte, background: c.blanc }}
                    />
                    <select value={ing.unite} onChange={e => modifierIngredient(index, 'unite', e.target.value)}
                      style={{ padding: '10px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, fontSize: '14px', background: c.blanc, outline: 'none', color: c.texte }}>
                      {['cl', 'ml', 'L', 'g', 'kg', 'u', 'trait', 'pièce', 'botte'].map(u => <option key={u}>{u}</option>)}
                    </select>
                  </div>
                </div>
              ))}
            </>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr) minmax(0, 80px) auto', gap: '8px', marginBottom: '8px' }}>
                {[t('bar.common.colIngredient'), t('bar.common.colQuantity'), t('bar.common.colUnit'), t('bar.common.colCost'), ''].map((h, i) => (
                  <div key={i} style={{ fontSize: '11px', color: c.texteMuted, fontWeight: '500', textTransform: 'uppercase' }}>{h}</div>
                ))}
              </div>
              {ingredients.map((ing, index) => (
                <div key={index} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr) minmax(0, 80px) auto', gap: '8px', marginBottom: '8px' }}>
                  <IngredientSearch ingredients={listeIngredients} value={ing.ingredient_id} onChange={val => modifierIngredient(index, 'ingredient_id', val)} />
                  <input type="number" value={ing.quantite} step="0.01" onChange={e => modifierIngredient(index, 'quantite', e.target.value)}
                    style={{ padding: '8px 10px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, fontSize: '13px', outline: 'none', color: c.texte, background: c.blanc, width: '100%', minWidth: 0 }}
                  />
                  <select value={ing.unite} onChange={e => modifierIngredient(index, 'unite', e.target.value)}
                    style={{ padding: '8px 10px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, fontSize: '13px', background: c.blanc, outline: 'none', color: c.texte, width: '100%', minWidth: 0 }}>
                    {['cl', 'ml', 'L', 'g', 'kg', 'u', 'trait', 'pièce', 'botte'].map(u => <option key={u}>{u}</option>)}
                  </select>
                  <div style={{ padding: '8px 6px', borderRadius: '8px', background: c.fond, border: `0.5px solid ${c.bordure}`, display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 0 }}>
                    {(() => {
                      const ingData = listeIngredients.find(i => i.id === ing.ingredient_id)
                      const cout = ingData?.prix_kg && ing.quantite ? (ingData.prix_kg * parseFloat(ing.quantite)).toFixed(2) : null
                      return <span style={{ fontSize: '11px', fontWeight: '500', color: cout ? c.texte : c.texteMuted, whiteSpace: 'nowrap' }}>{cout ? `${cout} €` : '—'}</span>
                    })()}
                  </div>
                  <button onClick={() => supprimerIngredient(index)} style={{ background: 'transparent', border: `0.5px solid ${c.bordure}`, borderRadius: '8px', width: '36px', height: '36px', cursor: 'pointer', color: '#aaa', fontSize: '16px', flexShrink: 0 }}>×</button>
                </div>
              ))}
            </>
          )}
          <button onClick={ajouterIngredient} style={{ background: '#EEEDFE', color: '#3C3489', border: '0.5px solid #AFA9EC', borderRadius: '8px', padding: '10px 16px', fontSize: '13px', cursor: 'pointer', marginTop: '8px', width: isMobile ? '100%' : 'auto' }}>
            {t('bar.common.addIngredient')}
          </button>
        </Card>

        {/* Instructions */}
        <Card c={c} style={{ marginBottom: '12px' }}>
          <div className="sk-label-muted" style={{ fontSize: '13px', color: c.texteMuted, marginBottom: '6px' }}>{t('bar.common.instructionsTitle')}</div>
          <div style={{ fontSize: '12px', color: c.texteMuted, marginBottom: '12px' }}>{t('bar.common.lineBreaksHint')}</div>
          <textarea value={instructions} onChange={e => setInstructions(e.target.value)} rows={8}
            placeholder={t('bar.form.instructionsPlaceholderEdit')}
            style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '0.5px solid #AFA9EC', fontSize: '14px', outline: 'none', resize: 'vertical', fontFamily: 'inherit', color: c.texte, background: c.blanc, lineHeight: '1.7', minHeight: '180px' }}
          />
          {instructions && (
            <div style={{ marginTop: '8px', fontSize: '12px', color: c.texteMuted }}>
              {t('bar.common.linesChars', { count: instructions.split('\n').length, lines: instructions.split('\n').length, chars: instructions.length })}
            </div>
          )}
        </Card>

        {/* Allergènes */}
        <Card c={c} style={{ marginBottom: '12px' }}>
          <div className="sk-label-muted" style={{ fontSize: '13px', color: c.texteMuted, marginBottom: '14px' }}>{t('bar.common.allergenes')}</div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(auto-fill, minmax(200px, 1fr))', gap: '8px' }}>
            {ALLERGENES.map(a => (
              <div key={a.id} onClick={() => toggleAllergene(a.id)}
                style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px', borderRadius: '8px', cursor: 'pointer', border: `0.5px solid ${allergenes.includes(a.id) ? '#E24B4A' : c.bordure}`, background: allergenes.includes(a.id) ? '#FCEBEB' : c.blanc }}>
                <span style={{ fontSize: '16px' }}>{a.emoji}</span>
                <span style={{ fontSize: isMobile ? '12px' : '13px', fontWeight: allergenes.includes(a.id) ? '500' : '400', color: allergenes.includes(a.id) ? '#A32D2D' : c.texte }}>{a.label}</span>
              </div>
            ))}
          </div>
          {allergenes.length > 0 && (
            <div style={{ marginTop: '12px', padding: '10px 14px', background: '#FCEBEB', borderRadius: '8px', fontSize: '12px', color: '#A32D2D', border: '0.5px solid #F09595' }}>
              {t('bar.common.allergenesSelected', { count: allergenes.length, list: allergenes.map(id => ALLERGENES.find(a => a.id === id)?.label).join(', ') })}
            </div>
          )}
        </Card>

        {/* Récapitulatif */}
        <div style={{ background: c.blanc, borderRadius: '12px', padding: isMobile ? '16px' : '20px', border: `0.5px solid ${c.bordure}`, display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px' }}>
          <div style={{ background: c.fond, borderRadius: '8px', padding: '12px' }}>
            <div style={{ fontSize: '10px', color: c.texteMuted, fontWeight: '500', textTransform: 'uppercase' }}>{t('bar.common.coutBrut')}</div>
            <div style={{ fontSize: '18px', fontWeight: '500', marginTop: '4px', color: c.texte }}>{coutBrut.toFixed(2)} €</div>
          </div>
          {parseFloat(perte) > 0 && (
            <div style={{ background: '#FAEEDA', borderRadius: '8px', padding: '12px', border: '0.5px solid #FAC775' }}>
              <div style={{ fontSize: '10px', color: '#854F0B', fontWeight: '500', textTransform: 'uppercase' }}>{t('bar.common.coutReel', { perte })}</div>
              <div style={{ fontSize: '18px', fontWeight: '500', marginTop: '4px', color: '#854F0B' }}>{coutAvecPerte.toFixed(2)} €</div>
            </div>
          )}
          {prixIndic && (
            <div style={{ background: '#EAF3DE', borderRadius: '8px', padding: '12px' }}>
              <div style={{ fontSize: '10px', color: '#3B6D11', fontWeight: '500', textTransform: 'uppercase' }}>{t('bar.common.prixIndicatifTTC')}</div>
              <div style={{ fontSize: '18px', fontWeight: '500', marginTop: '4px', color: '#3B6D11' }}>{prixIndic} €</div>
              <div style={{ fontSize: '10px', color: '#3B6D11', opacity: 0.8, marginTop: '2px' }}>{t('bar.common.vatSeuil', { tva: TVA_BAR(), seuil: seuilVert })}</div>
            </div>
          )}
          {fc && (
            <div style={{ background: fc < seuilVert ? '#EAF3DE' : fc < seuilOrange ? '#FAEEDA' : '#FCEBEB', borderRadius: '8px', padding: '12px' }}>
              <div style={{ fontSize: '10px', fontWeight: '500', textTransform: 'uppercase', color: fc < seuilVert ? '#3B6D11' : fc < seuilOrange ? '#854F0B' : '#A32D2D' }}>{t('bar.common.bevCost')}</div>
              <div style={{ fontSize: '18px', fontWeight: '500', marginTop: '4px', color: fc < seuilVert ? '#3B6D11' : fc < seuilOrange ? '#854F0B' : '#A32D2D' }}>{fc} %</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
