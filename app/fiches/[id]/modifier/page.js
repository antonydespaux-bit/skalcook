'use client'
import { useState, useEffect } from 'react'
import { supabase, getParametres } from '../../../../lib/supabase'
import { useRouter, useParams } from 'next/navigation'
import { theme, Logo } from '../../../../lib/theme.jsx'
import { useIsMobile } from '../../../../lib/useIsMobile'
import { useTheme } from '../../../../lib/useTheme'
import { useAutosave } from '../../../../lib/useAutosave'
import { log } from '../../../../lib/useLog'
import { ALLERGENES } from '../../../../lib/allergenes'
import IngredientSearch from '../../../../components/IngredientSearch'

const isIngredientPossible = (cat) => cat === 'Sous-fiche' || cat === 'Accompagnements'

export default function ModifierFiche() {
  const [nom, setNom] = useState('')
  const [categorie, setCategorie] = useState('Plats')
  const [nbPortions, setNbPortions] = useState('')
  const [prixTTC, setPrixTTC] = useState('')
  const [description, setDescription] = useState('')
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
  const categories = [...theme.categories, 'Sous-fiche']
  const isMobile = useIsMobile()
  const isSousFiche = categorie === 'Sous-fiche'

  const autosaveData = { nom, categorie, nbPortions, prixTTC, description, saison, allergenes, ingredients }
  const { hasDraft, lastSaved, getDraft, clearDraft } = useAutosave(`modifier-fiche-${params_route.id}`, autosaveData, 60000)

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
    const { data: ficheData } = await supabase.from('fiches').select('*').eq('id', params_route.id).single()
    if (!ficheData) { router.push('/fiches'); return }

    setNom(ficheData.nom)
    setCategorie(ficheData.categorie || 'Plats')
    setNbPortions(ficheData.nb_portions || '')
    setPrixTTC(ficheData.prix_ttc || '')
    setDescription(ficheData.description || '')
    setSaison(ficheData.saison || 'Printemps 2026')
    setAllergenes(ficheData.allergenes || [])
    if (ficheData.photo_url) { setPhotoExistante(ficheData.photo_url); setPhotoPreview(ficheData.photo_url) }

    // RÉCUPÉRATION DES INGRÉDIENTS AVEC LEURS UNITÉS
    const { data: ingsData } = await supabase
      .from('fiche_ingredients')
      .select(`quantite, unite, ingredients (id, nom, prix_kg, unite)`) // On récupère l'unité de la liaison ET de l'ingrédient
      .eq('fiche_id', params_route.id)

    setIngredients((ingsData || []).map(i => ({
      ingredient_id: i.ingredients?.id || '',
      nom: i.ingredients?.nom || '',
      quantite: i.quantite,
      // CRUCIAL : Si l'unité n'est pas stockée dans la liaison, on prend celle de l'ingrédient, sinon 'kg'
      unite: i.unite || i.ingredients?.unite || 'kg' 
    })))

    const { data: liste } = await supabase.from('ingredients').select('*').order('nom').limit(5000)
    setListeIngredients(liste || [])
    setLoading(false)
  }
  
    const { data: liste } = await supabase.from('ingredients').select('*').order('nom').limit(5000)
    setListeIngredients(liste || [])
    setLoading(false)
  }

  const restaurerBrouillon = () => {
    const draft = getDraft()
    if (!draft) return
    setNom(draft.nom || '')
    setCategorie(draft.categorie || 'Plats')
    setNbPortions(draft.nbPortions || '')
    setPrixTTC(draft.prixTTC || '')
    setDescription(draft.description || '')
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
      await supabase.from('fiches').update({ photo_url: null }).eq('id', params_route.id)
    }
    setPhoto(null); setPhotoPreview(null); setPhotoExistante(null)
  }

  const ajouterIngredient = () => {
    setIngredients([...ingredients, { ingredient_id: '', nom: '', quantite: '', unite: 'kg' }])
  }

  const supprimerIngredient = (index) => {
    setIngredients(ingredients.filter((_, i) => i !== index))
  }

  const modifierIngredient = (index, champ, valeur) => {
    const nouveaux = [...ingredients]
    nouveaux[index][champ] = valeur
    if (champ === 'ingredient_id') {
      const ing = listeIngredients.find(i => i.id === valeur)
      if (ing) { nouveaux[index].nom = ing.nom; nouveaux[index].unite = ing.unite || 'kg' }
    }
    setIngredients(nouveaux)
  }

const calculerCout = () => {
  return ingredients.reduce((total, ing) => {
    const ingData = listeIngredients.find(i => i.id === ing.ingredient_id)
    if (!ingData?.prix_kg || !ing.quantite) return total

    let quantiteNumerique = parseFloat(ing.quantite)
    
    // LOGIQUE DE CONVERSION AUTOMATIQUE
    // Si l'unité choisie est 'g' ou 'ml', on divise par 1000 pour 
    // ramener la quantité au prix par Kg ou par Litre stocké en base.
    const unitesSousMultiples = ['g', 'ml', 'cl']
    let coefficient = 1
    
    if (ing.unite === 'g' || ing.unite === 'ml') {
      coefficient = 0.001 // Division par 1000
    } else if (ing.unite === 'cl') {
      coefficient = 0.01  // Division par 100 (100cl = 1L)
    }

    return total + (ingData.prix_kg * quantiteNumerique * coefficient)
  }, 0)
}

  const foodCost = () => {
    const cout = calculerCout()
    if (!prixTTC || !cout || !nbPortions) return null
    return (cout / parseFloat(nbPortions) / (parseFloat(prixTTC) / 1.10) * 100).toFixed(1)
  }

  const prixIndicatif = () => {
    const cout = calculerCout()
    if (!cout || !nbPortions) return null
    const coutPortion = cout / parseFloat(nbPortions)
    const seuil = parseFloat(params['seuil_vert_cuisine'] || 28) / 100
    const tva = 1 + parseFloat(params['tva_restauration'] || 10) / 100
    return (coutPortion / seuil * tva).toFixed(2)
  }

  const handleSubmit = async () => {
    if (!nom) { setError('Le nom est obligatoire'); return }
    setSaving(true)
    setError('')

    const cout = calculerCout()
    const coutPortion = nbPortions ? (cout / parseFloat(nbPortions)) : null
    let photoUrl = photoExistante

    if (photo) {
      const ext = photo.name.split('.').pop()
      const path = `${params_route.id}.${ext}`
      const { error: errPhoto } = await supabase.storage.from('fiches-photos').upload(path, photo, { upsert: true })
      if (!errPhoto) {
        const { data: urlData } = supabase.storage.from('fiches-photos').getPublicUrl(path)
        photoUrl = urlData.publicUrl
      }
    }

    await supabase.from('fiches').update({
      nom, categorie,
      nb_portions: nbPortions ? parseInt(nbPortions) : null,
      prix_ttc: isSousFiche ? null : (prixTTC ? parseFloat(prixTTC) : null),
      description, saison, allergenes, photo_url: photoUrl,
      cout_portion: coutPortion, updated_at: new Date().toISOString()
    }).eq('id', params_route.id)

    await supabase.from('fiche_ingredients').delete().eq('fiche_id', params_route.id)

    const ingredientsAInserer = ingredients
      .filter(i => i.ingredient_id && i.quantite)
      .map(i => ({ fiche_id: params_route.id, ingredient_id: i.ingredient_id, quantite: parseFloat(i.quantite), unite: i.unite }))

    if (ingredientsAInserer.length > 0) {
      await supabase.from('fiche_ingredients').insert(ingredientsAInserer)
    }

// --- CORRECTION UNITÉ DYNAMIQUE ---
if (isIngredientPossible(categorie) && coutPortion) {
  const { data: ingExistant } = await supabase
    .from('ingredients').select('id').eq('fiche_id', params_route.id).single()

  // On définit l'unité de production : 
  // Si c'est une sous-fiche, on regarde si le Chef a défini une unité spécifique.
  // Sinon, on utilise 'portions' ou 'u' par défaut.
  let uniteProduction = 'portions'
  if (isSousFiche) {
    // Ici, on pourrait même ajouter un sélecteur d'unité global pour la fiche.
    // Pour l'instant, on harmonise : kg pour les accompagnements, u pour le reste.
    uniteProduction = categorie === 'Accompagnements' ? 'portions' : 'u'
  }

  const payloadIngredient = {
    nom, 
    prix_kg: parseFloat(coutPortion),
    unite: uniteProduction, // L'unité choisie est maintenant sauvegardée
    est_sous_fiche: true, 
    fiche_id: params_route.id
  }

  if (ingExistant) {
    await supabase.from('ingredients').update(payloadIngredient).eq('fiche_id', params_route.id)
  } else {
    await supabase.from('ingredients').insert([payloadIngredient])
  }
}
    await log({
      action: 'MODIFICATION', entite: 'fiche', entite_id: params_route.id,
      entite_nom: nom, section: 'cuisine',
      details: `Catégorie: ${categorie}, Saison: ${saison}`
    })

    clearDraft()
    router.push(`/fiches/${params_route.id}`)
  }

  const fc = foodCost()
  const prixIndic = prixIndicatif()
  const seuilVert = parseFloat(params['seuil_vert_cuisine'] || 28)
  const seuilOrange = parseFloat(params['seuil_orange_cuisine'] || 35)

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: c.fond }}>
      <div style={{ fontSize: '14px', color: c.texteMuted }}>Chargement...</div>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: c.fond }}>

      <div style={{
        background: c.principal, borderBottom: `0.5px solid ${c.accent}40`,
        padding: '0 16px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', height: '56px',
        position: 'sticky', top: 0, zIndex: 100
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Logo height={28} couleur="white" onClick={() => router.push('/dashboard')} />
          <button onClick={() => router.push(`/fiches/${params_route.id}`)} style={{
            background: 'transparent', border: '0.5px solid rgba(255,255,255,0.2)',
            borderRadius: '8px', padding: '6px 10px', fontSize: '13px', cursor: 'pointer', color: 'rgba(255,255,255,0.7)'
          }}>← Retour</button>
          {!isMobile && <span style={{ fontSize: '14px', fontWeight: '500', color: 'white' }}>Modifier — {nom}</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {lastSaved && <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>{!isMobile && `Sauvegardé à ${lastSaved.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`}{isMobile && '✓'}</span>}
          <button onClick={handleSubmit} disabled={saving} style={{
            background: saving ? c.texteMuted : c.accent, color: c.principal, border: 'none',
            borderRadius: '8px', padding: '8px 16px', fontSize: '13px', fontWeight: '600', cursor: saving ? 'not-allowed' : 'pointer'
          }}>
            {saving ? '...' : 'Enregistrer'}
          </button>
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

        {categorie === 'Accompagnements' && (
          <div style={{ background: c.vertClair, color: c.vert, borderRadius: '8px', padding: '10px 14px', fontSize: '13px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px', border: `0.5px solid ${c.vert}40` }}>
            <span style={{ background: c.vert, color: 'white', borderRadius: '6px', padding: '2px 8px', fontSize: '11px', fontWeight: '500' }}>AC</span>
            Cette fiche sera disponible comme ingrédient et aura un prix de vente
          </div>
        )}

        {/* Photo */}
        <div style={{ background: c.blanc, borderRadius: '12px', padding: isMobile ? '16px' : '24px', border: `0.5px solid ${c.bordure}`, marginBottom: '12px' }}>
          <div style={{ fontSize: '13px', fontWeight: '500', color: c.texteMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '14px' }}>Photo du plat</div>
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
                style={{ width: '100%', padding: '10px 12px', border: `0.5px solid ${c.accent}`, borderRadius: '8px', fontSize: '13px', background: c.accentClair, cursor: 'pointer', color: c.texte }}
              />
              <div style={{ fontSize: '11px', color: c.texteMuted, marginTop: '6px' }}>JPG, PNG, WEBP — Max 5MB</div>
            </div>
          </div>
        </div>

        {/* Informations générales */}
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
                  {categories.map(cat => <option key={cat}>{cat}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: '12px', color: c.texteMuted, fontWeight: '500', display: 'block', marginBottom: '6px' }}>Saison</label>
                <select value={saison} onChange={e => setSaison(e.target.value)} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, fontSize: '14px', background: c.blanc, outline: 'none', color: c.texte }}>
                  {theme.saisons.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '12px', color: c.texteMuted, fontWeight: '500', display: 'block', marginBottom: '6px' }}>Nombre de portions</label>
                <input type="number" value={nbPortions} onChange={e => setNbPortions(e.target.value)}
                  style={{ width: '100%', padding: '12px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, fontSize: '14px', outline: 'none', color: c.texte, background: c.blanc }}
                />
              </div>
              {!isSousFiche && (
                <div>
                  <label style={{ fontSize: '12px', color: c.texteMuted, fontWeight: '500', display: 'block', marginBottom: '6px' }}>Prix TTC (€)</label>
                  <input type="number" value={prixTTC} onChange={e => setPrixTTC(e.target.value)} step="0.01"
                    style={{ width: '100%', padding: '12px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, fontSize: '14px', outline: 'none', color: c.texte, background: c.blanc }}
                  />
                  {prixIndic && <div style={{ fontSize: '11px', color: c.vert, marginTop: '4px' }}>Indicatif ({seuilVert}%) : <strong>{prixIndic} €</strong></div>}
                </div>
              )}
            </div>
            <div>
              <label style={{ fontSize: '12px', color: c.texteMuted, fontWeight: '500', display: 'block', marginBottom: '6px' }}>Description</label>
              <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3}
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
                      {['kg', 'g', 'L', 'cl', 'ml', 'u', 'botte', 'pièce', 'portions'].map(u => <option key={u}>{u}</option>)}
                    </select>
                  </div>
                  {(() => {
                    const ingData = listeIngredients.find(i => i.id === ing.ingredient_id)
                    const cout = ingData?.prix_kg && ing.quantite ? (ingData.prix_kg * parseFloat(ing.quantite)).toFixed(2) : null
                    return cout ? (
                      <div style={{ marginTop: '6px', padding: '6px 10px', background: c.fond, borderRadius: '6px', fontSize: '12px', color: c.texte, fontWeight: '500', textAlign: 'right', border: `0.5px solid ${c.bordure}` }}>
                        Coût : <strong>{cout} €</strong>
                      </div>
                    ) : null
                  })()}
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
                    {['kg', 'g', 'L', 'cl', 'ml', 'u', 'botte', 'pièce', 'portions'].map(u => <option key={u}>{u}</option>)}
                  </select>
                  <div style={{ padding: '8px 6px', borderRadius: '8px', background: c.fond, border: `0.5px solid ${c.bordure}`, display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 0 }}>
                    {(() => {
                      const ingData = listeIngredients.find(i => i.id === ing.ingredient_id)
                      const cout = ingData?.prix_kg && ing.quantite ? (ingData.prix_kg * parseFloat(ing.quantite)).toFixed(2) : null
                      return (
                        <span style={{ fontSize: '11px', fontWeight: '500', color: cout ? c.texte : c.texteMuted, whiteSpace: 'nowrap' }}>
                          {cout ? `${cout} €` : '—'}
                        </span>
                      )
                    })()}
                  </div>
                  <button onClick={() => supprimerIngredient(index)} style={{ background: 'transparent', border: `0.5px solid ${c.bordure}`, borderRadius: '8px', width: '36px', height: '36px', cursor: 'pointer', color: '#aaa', fontSize: '16px', flexShrink: 0 }}>×</button>
                </div>
              ))}
            </>
          )}
          <button onClick={ajouterIngredient} style={{ background: c.vertClair, color: c.vert, border: `0.5px solid ${c.vert}40`, borderRadius: '8px', padding: '10px 16px', fontSize: '13px', cursor: 'pointer', marginTop: '8px', width: isMobile ? '100%' : 'auto' }}>
            + Ajouter un ingrédient
          </button>
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
            <div style={{ fontSize: '10px', color: c.texteMuted, fontWeight: '500', textTransform: 'uppercase' }}>Coût total</div>
            <div style={{ fontSize: '18px', fontWeight: '500', marginTop: '4px', color: c.texte }}>{calculerCout().toFixed(2)} €</div>
          </div>
          {prixIndic && !isSousFiche && (
            <div style={{ background: c.vertClair, borderRadius: '8px', padding: '12px' }}>
              <div style={{ fontSize: '10px', color: c.vert, fontWeight: '500', textTransform: 'uppercase' }}>Prix indicatif TTC</div>
              <div style={{ fontSize: '18px', fontWeight: '500', marginTop: '4px', color: c.vert }}>{prixIndic} €</div>
              <div style={{ fontSize: '10px', color: c.vert, opacity: 0.8, marginTop: '2px' }}>Basé sur {seuilVert}%</div>
            </div>
          )}
          {fc && !isSousFiche && (
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
