'use client'
import { useState, useEffect } from 'react'
import { supabase, getParametres, getClientId } from '../../../../../lib/supabase'
import { useRouter, useParams } from 'next/navigation'
import { theme, Logo } from '../../../../../lib/theme.jsx'
import { useIsMobile } from '../../../../../lib/useIsMobile'
import { useTheme } from '../../../../../lib/useTheme'
import { useAutosave } from '../../../../../lib/useAutosave'
import { log } from '../../../../../lib/useLog'
import { ALLERGENES } from '../../../../../lib/allergenes'
import IngredientSearch from '../../../../../components/IngredientSearch'

const CATEGORIES_BAR = ['Cocktails', 'Vins', 'Bières', 'Softs', 'Champagnes', 'Spiritueux', 'Sans alcool', 'Mocktails', 'Eaux', 'Caféterie', 'Sous-fiche']
const CATEGORIES_ALCOOL = ['Cocktails', 'Vins', 'Champagnes', 'Bières', 'Spiritueux']

export default function ModifierBarFiche() {
  const [nom, setNom] = useState('')
  const [categorie, setCategorie] = useState('Cocktails')
  const [nbPortions, setNbPortions] = useState('')
  const [prixTTC, setPrixTTC] = useState('')
  const [perte, setPerte] = useState(0)
  const [description, setDescription] = useState('')
  const [instructions, setInstructions] = useState('')
  const [saison, setSaison] = useState('Printemps 2026')
  const [allergenes, setAllergenes] = useState([])
  const [photo, setPhoto] = useState(null)
  const [photoPreview, setPhotoPreview] = useState(null)
  const [photoExistante, setPhotoExistante] = useState(null)
  const [ingredients, setIngredients] = useState([])
  const [listeIngredients, setListeIngredients] = useState([])
  const [params, setParams] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [draftRestored, setDraftRestored] = useState(false)
  const router = useRouter()
  const params_route = useParams()
  const { c } = useTheme()
  const isMobile = useIsMobile()

  const autosaveData = { nom, categorie, nbPortions, prixTTC, perte, description, instructions, saison, allergenes, ingredients }
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
    const { data: ficheData } = await supabase
      .from('fiches_bar').select('*').eq('id', params_route.id).single()
    if (!ficheData) { router.push('/bar/fiches'); return }

    setNom(ficheData.nom)
    setCategorie(ficheData.categorie || 'Cocktails')
    setNbPortions(ficheData.nb_portions || '')
    setPrixTTC(ficheData.prix_ttc || '')
    setPerte(ficheData.perte || 0)
    setDescription(ficheData.description || '')
    setInstructions(ficheData.instructions || '')
    setSaison(ficheData.saison || 'Printemps 2026')
    setAllergenes(ficheData.allergenes || [])
    if (ficheData.photo_url) { setPhotoExistante(ficheData.photo_url); setPhotoPreview(ficheData.photo_url) }

    const { data: ingsData } = await supabase
      .from('fiche_bar_ingredients')
      .select(`quantite, unite, ingredients_bar (id, nom, prix_kg, unite)`)
      .eq('fiche_bar_id', params_route.id)

    setIngredients((ingsData || []).map(i => ({
      ingredient_id: i.ingredients_bar?.id || '',
      nom: i.ingredients_bar?.nom || '',
      quantite: i.quantite,
      unite: i.unite
    })))

    const { data: liste } = await supabase.from('ingredients_bar').select('*').order('nom').limit(5000)
    setListeIngredients(liste || [])
    setLoading(false)
  }

  const restaurerBrouillon = () => {
    const draft = getDraft()
    if (!draft) return
    setNom(draft.nom || '')
    setCategorie(draft.categorie || 'Cocktails')
    setNbPortions(draft.nbPortions || '')
    setPrixTTC(draft.prixTTC || '')
    setPerte(draft.perte || 0)
    setDescription(draft.description || '')
    setInstructions(draft.instructions || '')
    setSaison(draft.saison || 'Printemps 2026')
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

  const supprimerPhoto = async () => {
    if (photoExistante) {
      const path = photoExistante.split('/').pop()
      await supabase.storage.from('fiches-photos').remove([path])
      await supabase.from('fiches_bar').update({ photo_url: null }).eq('id', params_route.id)
    }
    setPhoto(null); setPhotoPreview(null); setPhotoExistante(null)
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

  const TVA_BAR = () => CATEGORIES_ALCOOL.includes(categorie) ? 20 : 10

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
    if (!nom) { setError('Le nom est obligatoire'); return }
    setSaving(true)
    setError('')

    const clientId = await getClientId()
    if (!clientId) { setError('Erreur : session expirée'); setSaving(false); return }

    const cout = calculerCoutAvecPerte()
    const coutPortion = nbPortions ? (cout / parseFloat(nbPortions)) : null
    let photoUrl = photoExistante

    if (photo) {
      const ext = photo.name.split('.').pop()
      const path = `${clientId}/bar-${params_route.id}.${ext}`
      const { error: errPhoto } = await supabase.storage.from('fiches-photos').upload(path, photo, { upsert: true })
      if (!errPhoto) {
        const { data: urlData } = supabase.storage.from('fiches-photos').getPublicUrl(path)
        photoUrl = urlData.publicUrl
      }
    }

    await supabase.from('fiches_bar').update({
      nom, categorie,
      nb_portions: nbPortions ? parseInt(nbPortions) : null,
      prix_ttc: prixTTC ? parseFloat(prixTTC) : null,
      description,
      instructions: instructions || null,
      saison, allergenes, photo_url: photoUrl,
      cout_portion: coutPortion,
      perte: perte ? parseFloat(perte) : 0,
      updated_at: new Date().toISOString()
    }).eq('id', params_route.id)

    await supabase.from('fiche_bar_ingredients').delete().eq('fiche_bar_id', params_route.id)

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
      details: `Catégorie: ${categorie}, Saison: ${saison}${perte > 0 ? `, Perte: ${perte}%` : ''}`
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
      <div style={{ fontSize: '14px', color: c.texteMuted }}>Chargement...</div>
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
          <Logo height={28} couleur="white" onClick={() => router.push('/bar/dashboard')} />
          <button onClick={() => router.push(`/bar/fiches/${params_route.id}`)} style={{
            background: 'transparent', border: '0.5px solid rgba(255,255,255,0.2)',
            borderRadius: '8px', padding: '6px 10px', fontSize: '13px', cursor: 'pointer', color: 'rgba(255,255,255,0.7)'
          }}>← Retour</button>
          {!isMobile && <span style={{ fontSize: '14px', fontWeight: '500', color: 'white' }}>Modifier — {nom}</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {lastSaved && <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>{!isMobile && `Sauvegardé à ${lastSaved.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`}{isMobile && '✓'}</span>}
          <button onClick={handleSubmit} disabled={saving} style={{
            background: saving ? '#666' : '#C4956A', color: '#3C3489', border: 'none',
            borderRadius: '8px', padding: '8px 16px', fontSize: '13px', fontWeight: '600', cursor: saving ? 'not-allowed' : 'pointer'
          }}>{saving ? '...' : 'Enregistrer'}</button>
        </div>
      </div>

      <div style={{ padding: isMobile ? '12px' : '24px', maxWidth: '800px', margin: '0 auto' }}>

        {hasDraft && !draftRestored && (
          <div style={{ background: '#FAEEDA', border: '0.5px solid #FAC775', borderRadius: '10px', padding: '14px 16px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
            <div>
              <div style={{ fontSize: '13px', fontWeight: '500', color: '#633806' }}>📋 Un brouillon a été trouvé</div>
              <div style={{ fontSize: '12px', color: '#854F0B', marginTop: '2px' }}>Voulez-vous restaurer vos modifications précédentes ?</div>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={restaurerBrouillon} style={{ padding: '8px 14px', background: '#854F0B', color: 'white', border: 'none', borderRadius: '8px', fontSize: '12px', cursor: 'pointer', fontWeight: '500' }}>Restaurer</button>
              <button onClick={() => clearDraft()} style={{ padding: '8px 14px', background: 'transparent', color: '#854F0B', border: '0.5px solid #FAC775', borderRadius: '8px', fontSize: '12px', cursor: 'pointer' }}>Ignorer</button>
            </div>
          </div>
        )}

        {error && <div style={{ background: '#FCEBEB', color: '#A32D2D', borderRadius: '8px', padding: '12px 16px', fontSize: '13px', marginBottom: '16px' }}>{error}</div>}

        <div style={{ background: CATEGORIES_ALCOOL.includes(categorie) ? '#FCEBEB' : '#EAF3DE', borderRadius: '8px', padding: '10px 14px', fontSize: '12px', marginBottom: '16px', border: `0.5px solid ${CATEGORIES_ALCOOL.includes(categorie) ? '#F09595' : '#4A7B6F40'}`, color: CATEGORIES_ALCOOL.includes(categorie) ? '#A32D2D' : '#3B6D11' }}>
          {CATEGORIES_ALCOOL.includes(categorie) ? '🍷 TVA Alcool : 20%' : '🥤 TVA Sans alcool : 10%'}
        </div>

        {/* Photo */}
        <div style={{ background: c.blanc, borderRadius: '12px', padding: isMobile ? '16px' : '24px', border: `0.5px solid ${c.bordure}`, marginBottom: '12px' }}>
          <div style={{ fontSize: '13px', fontWeight: '500', color: c.texteMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '14px' }}>Photo</div>
          <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
            {photoPreview ? (
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <img src={photoPreview} alt="Aperçu" style={{ width: isMobile ? '100px' : '160px', height: isMobile ? '80px' : '120px', objectFit: 'cover', borderRadius: '8px', border: `0.5px solid ${c.bordure}` }} />
                <button onClick={supprimerPhoto} style={{ position: 'absolute', top: '-8px', right: '-8px', background: '#A32D2D', color: 'white', border: 'none', borderRadius: '50%', width: '20px', height: '20px', fontSize: '12px', cursor: 'pointer' }}>×</button>
              </div>
            ) : (
              <div style={{ width: isMobile ? '100px' : '160px', height: isMobile ? '80px' : '120px', borderRadius: '8px', border: `1px dashed ${c.bordure}`, display: 'flex', alignItems: 'center', justifyContent: 'center', background: c.fond, flexDirection: 'column', gap: '4px', flexShrink: 0 }}>
                <span style={{ fontSize: '20px' }}>📷</span>
                <span style={{ fontSize: '10px', color: c.texteMuted }}>Aucune photo</span>
              </div>
            )}
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: '12px', color: c.texteMuted, fontWeight: '500', display: 'block', marginBottom: '8px' }}>{photoPreview ? 'Changer la photo' : 'Ajouter une photo'}</label>
              <input type="file" accept="image/*" onChange={handlePhoto}
                style={{ width: '100%', padding: '10px 12px', border: '0.5px solid #7F77DD', borderRadius: '8px', fontSize: '13px', background: '#EEEDFE', cursor: 'pointer', color: c.texte }}
              />
              <div style={{ fontSize: '11px', color: c.texteMuted, marginTop: '6px' }}>JPG, PNG, WEBP — Max 5MB</div>
            </div>
          </div>
        </div>

        {/* Infos générales */}
        <div style={{ background: c.blanc, borderRadius: '12px', padding: isMobile ? '16px' : '24px', border: `0.5px solid ${c.bordure}`, marginBottom: '12px' }}>
          <div style={{ fontSize: '13px', fontWeight: '500', color: c.texteMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '14px' }}>Informations générales</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <label style={{ fontSize: '12px', color: c.texteMuted, fontWeight: '500', display: 'block', marginBottom: '6px' }}>Nom *</label>
              <input type="text" value={nom} onChange={e => setNom(e.target.value)}
                style={{ width: '100%', padding: '12px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, fontSize: '14px', outline: 'none', color: c.texte, background: c.blanc }}
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '12px', color: c.texteMuted, fontWeight: '500', display: 'block', marginBottom: '6px' }}>Catégorie</label>
                <select value={categorie} onChange={e => setCategorie(e.target.value)} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, fontSize: '14px', background: c.blanc, outline: 'none', color: c.texte }}>
                  {CATEGORIES_BAR.map(cat => <option key={cat}>{cat}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: '12px', color: c.texteMuted, fontWeight: '500', display: 'block', marginBottom: '6px' }}>Saison</label>
                <select value={saison} onChange={e => setSaison(e.target.value)} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, fontSize: '14px', background: c.blanc, outline: 'none', color: c.texte }}>
                  {theme.saisons.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '12px', color: c.texteMuted, fontWeight: '500', display: 'block', marginBottom: '6px' }}>Nombre de portions</label>
                <input type="number" value={nbPortions} onChange={e => setNbPortions(e.target.value)}
                  style={{ width: '100%', padding: '12px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, fontSize: '14px', outline: 'none', color: c.texte, background: c.blanc }}
                />
              </div>
              <div>
                <label style={{ fontSize: '12px', color: c.texteMuted, fontWeight: '500', display: 'block', marginBottom: '6px' }}>Prix TTC (€)</label>
                <input type="number" value={prixTTC} onChange={e => setPrixTTC(e.target.value)} step="0.01"
                  style={{ width: '100%', padding: '12px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, fontSize: '14px', outline: 'none', color: c.texte, background: c.blanc }}
                />
                {prixIndic && <div style={{ fontSize: '11px', color: '#3B6D11', marginTop: '4px' }}>Indicatif ({seuilVert}%) TVA {TVA_BAR()}% : <strong>{prixIndic} €</strong></div>}
              </div>
            </div>

            <div>
              <label style={{ fontSize: '12px', color: c.texteMuted, fontWeight: '500', display: 'block', marginBottom: '6px' }}>% de perte — évaporation, décantation...</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input type="number" value={perte} onChange={e => setPerte(e.target.value)}
                  placeholder="0" min="0" max="99" step="0.5"
                  style={{ width: '100%', padding: '12px', borderRadius: '8px', border: `0.5px solid ${parseFloat(perte) > 0 ? '#FAC775' : c.bordure}`, fontSize: '14px', outline: 'none', color: c.texte, background: parseFloat(perte) > 0 ? '#FFFBF0' : c.blanc }}
                />
                <span style={{ fontSize: '16px', color: c.texteMuted, flexShrink: 0, fontWeight: '500' }}>%</span>
              </div>
              {parseFloat(perte) > 0 && (
                <div style={{ fontSize: '11px', color: '#854F0B', marginTop: '6px', padding: '6px 10px', background: '#FAEEDA', borderRadius: '6px', border: '0.5px solid #FAC775' }}>
                  ⚠️ Avec {perte}% de perte : coût brut {coutBrut.toFixed(2)} € → coût réel <strong>{coutAvecPerte.toFixed(2)} €</strong>
                </div>
              )}
            </div>

            <div>
              <label style={{ fontSize: '12px', color: c.texteMuted, fontWeight: '500', display: 'block', marginBottom: '6px' }}>Description courte</label>
              <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2}
                placeholder="Description affichée en haut de la fiche..."
                style={{ width: '100%', padding: '12px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, fontSize: '14px', outline: 'none', resize: 'vertical', fontFamily: 'inherit', color: c.texte, background: c.blanc }}
              />
            </div>
          </div>
        </div>

        {/* Ingrédients */}
        <div style={{ background: c.blanc, borderRadius: '12px', padding: isMobile ? '16px' : '24px', border: `0.5px solid ${c.bordure}`, marginBottom: '12px' }}>
          <div style={{ fontSize: '13px', fontWeight: '500', color: c.texteMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '14px' }}>Ingrédients</div>
          {isMobile ? (
            <>
              {ingredients.map((ing, index) => (
                <div key={index} style={{ background: c.fond, borderRadius: '8px', padding: '12px', marginBottom: '8px', border: `0.5px solid ${c.bordure}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span style={{ fontSize: '12px', color: c.texteMuted, fontWeight: '500' }}>Ingrédient {index + 1}</span>
                    <button onClick={() => supprimerIngredient(index)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#aaa', fontSize: '16px' }}>×</button>
                  </div>
                  <div style={{ marginBottom: '8px' }}>
                    <IngredientSearch ingredients={listeIngredients} value={ing.ingredient_id} onChange={val => modifierIngredient(index, 'ingredient_id', val)} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <input type="number" value={ing.quantite} step="0.01" onChange={e => modifierIngredient(index, 'quantite', e.target.value)} placeholder="Quantité"
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
                {['Ingrédient', 'Quantité', 'Unité', 'Coût', ''].map((h, i) => (
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
            + Ajouter un ingrédient
          </button>
        </div>

        {/* ── INSTRUCTIONS BAR — bloc dédié après ingrédients ── */}
        <div style={{ background: c.blanc, borderRadius: '12px', padding: isMobile ? '16px' : '24px', border: `0.5px solid ${c.bordure}`, marginBottom: '12px' }}>
          <div style={{ fontSize: '13px', fontWeight: '500', color: c.texteMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '6px' }}>
            📋 Instructions de préparation
          </div>
          <div style={{ fontSize: '12px', color: c.texteMuted, marginBottom: '12px' }}>
            Les sauts de ligne seront respectés à l'écran et à l'impression.
          </div>
          <textarea
            value={instructions}
            onChange={e => setInstructions(e.target.value)}
            rows={8}
            placeholder={`1. Verser le rhum dans le shaker...\n2. Ajouter le jus de citron vert...\n3. Shaker vigoureusement 10 secondes...\n\nDressage :\n- Verser dans un verre à cocktail glacé...\n- Garnir d'une tranche de citron...`}
            style={{
              width: '100%', padding: '12px', borderRadius: '8px',
              border: '0.5px solid #AFA9EC', fontSize: '14px',
              outline: 'none', resize: 'vertical', fontFamily: 'inherit',
              color: c.texte, background: c.blanc, lineHeight: '1.7',
              minHeight: '180px'
            }}
          />
          {instructions && (
            <div style={{ marginTop: '8px', fontSize: '12px', color: c.texteMuted }}>
              {instructions.split('\n').length} ligne{instructions.split('\n').length > 1 ? 's' : ''} — {instructions.length} caractères
            </div>
          )}
        </div>

        {/* Allergènes */}
        <div style={{ background: c.blanc, borderRadius: '12px', padding: isMobile ? '16px' : '24px', border: `0.5px solid ${c.bordure}`, marginBottom: '12px' }}>
          <div style={{ fontSize: '13px', fontWeight: '500', color: c.texteMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '14px' }}>Allergènes</div>
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
              {allergenes.length} allergène{allergenes.length > 1 ? 's' : ''} : {allergenes.map(id => ALLERGENES.find(a => a.id === id)?.label).join(', ')}
            </div>
          )}
        </div>

        {/* Récapitulatif */}
        <div style={{ background: c.blanc, borderRadius: '12px', padding: isMobile ? '16px' : '20px', border: `0.5px solid ${c.bordure}`, display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px' }}>
          <div style={{ background: c.fond, borderRadius: '8px', padding: '12px' }}>
            <div style={{ fontSize: '10px', color: c.texteMuted, fontWeight: '500', textTransform: 'uppercase' }}>Coût brut</div>
            <div style={{ fontSize: '18px', fontWeight: '500', marginTop: '4px', color: c.texte }}>{coutBrut.toFixed(2)} €</div>
          </div>
          {parseFloat(perte) > 0 && (
            <div style={{ background: '#FAEEDA', borderRadius: '8px', padding: '12px', border: '0.5px solid #FAC775' }}>
              <div style={{ fontSize: '10px', color: '#854F0B', fontWeight: '500', textTransform: 'uppercase' }}>Perte {perte}% → Coût réel</div>
              <div style={{ fontSize: '18px', fontWeight: '500', marginTop: '4px', color: '#854F0B' }}>{coutAvecPerte.toFixed(2)} €</div>
            </div>
          )}
          {prixIndic && (
            <div style={{ background: '#EAF3DE', borderRadius: '8px', padding: '12px' }}>
              <div style={{ fontSize: '10px', color: '#3B6D11', fontWeight: '500', textTransform: 'uppercase' }}>Prix indicatif TTC</div>
              <div style={{ fontSize: '18px', fontWeight: '500', marginTop: '4px', color: '#3B6D11' }}>{prixIndic} €</div>
              <div style={{ fontSize: '10px', color: '#3B6D11', opacity: 0.8, marginTop: '2px' }}>TVA {TVA_BAR()}% — seuil {seuilVert}%</div>
            </div>
          )}
          {fc && (
            <div style={{ background: fc < seuilVert ? '#EAF3DE' : fc < seuilOrange ? '#FAEEDA' : '#FCEBEB', borderRadius: '8px', padding: '12px' }}>
              <div style={{ fontSize: '10px', fontWeight: '500', textTransform: 'uppercase', color: fc < seuilVert ? '#3B6D11' : fc < seuilOrange ? '#854F0B' : '#A32D2D' }}>Food cost</div>
              <div style={{ fontSize: '18px', fontWeight: '500', marginTop: '4px', color: fc < seuilVert ? '#3B6D11' : fc < seuilOrange ? '#854F0B' : '#A32D2D' }}>{fc} %</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
