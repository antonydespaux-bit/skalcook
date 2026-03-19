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
  const [uniteProduction, setUniteProduction] = useState('u')
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

  const autosaveData = { nom, categorie, nbPortions, prixTTC, description, saison, allergenes, ingredients, uniteProduction }
  const { hasDraft, lastSaved, getDraft, clearDraft } = useAutosave(`modifier-fiche-${params_route.id}`, autosaveData, 60000)

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/'); return }
      
      const p = await getParametres()
      setParams(p)
      await loadData()
    }
    init()
  }, [])

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

    // Charger l'unité actuelle de la sous-fiche
    const { data: ingLie } = await supabase.from('ingredients').select('unite').eq('fiche_id', params_route.id).single()
    if (ingLie) setUniteProduction(ingLie.unite || 'u')

    const { data: ingsData } = await supabase
      .from('fiche_ingredients')
      .select(`quantite, unite, ingredients (id, nom, prix_kg, unite)`)
      .eq('fiche_id', params_route.id)

    setIngredients((ingsData || []).map(i => ({
      ingredient_id: i.ingredients?.id || '',
      nom: i.ingredients?.nom || '',
      quantite: i.quantite,
      unite: i.unite || i.ingredients?.unite || 'kg'
    })))

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
    setUniteProduction(draft.uniteProduction || 'u')
    setPrixTTC(draft.prixTTC || '')
    setDescription(draft.description || '')
    setSaison(draft.saison || 'Printemps 2026')
    setAllergenes(draft.allergenes || [])
    setIngredients(draft.ingredients || [])
    setDraftRestored(true)
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
      let q = parseFloat(ing.quantite)
      let coef = (ing.unite === 'g' || ing.unite === 'ml') ? 0.001 : (ing.unite === 'cl' ? 0.01 : 1)
      return total + (ingData.prix_kg * q * coef)
    }, 0)
  }

  const handleSubmit = async () => {
    if (!nom) { setError('Le nom est obligatoire'); return }
    setSaving(true)
    setError('')

    try {
      const cout = calculerCout()
      const valNbPortions = parseFloat(nbPortions) || 0
      const coutPortion = valNbPortions > 0 ? (cout / valNbPortions) : null
      let photoUrl = photoExistante

      if (photo) {
        const ext = photo.name.split('.').pop()
        const path = `${params_route.id}.${ext}`
        await supabase.storage.from('fiches-photos').upload(path, photo, { upsert: true })
        const { data: urlData } = supabase.storage.from('fiches-photos').getPublicUrl(path)
        photoUrl = urlData.publicUrl
      }

      // 1. Update Fiche
      await supabase.from('fiches').update({
        nom, categorie,
        nb_portions: valNbPortions,
        prix_ttc: isSousFiche ? null : (parseFloat(prixTTC) || null),
        description, saison, allergenes, photo_url: photoUrl,
        cout_portion: coutPortion, updated_at: new Date().toISOString()
      }).eq('id', params_route.id)

      // 2. Update Ingrédients de la fiche
      await supabase.from('fiche_ingredients').delete().eq('fiche_id', params_route.id)
      const toInsert = ingredients
        .filter(i => i.ingredient_id && i.quantite)
        .map(i => ({ fiche_id: params_route.id, ingredient_id: i.ingredient_id, quantite: parseFloat(i.quantite), unite: i.unite }))
      
      if (toInsert.length > 0) await supabase.from('fiche_ingredients').insert(toInsert)

      // 3. Update Table Ingrédients (Dictionnaire) pour que la sous-fiche soit utilisable
      if (isIngredientPossible(categorie)) {
        const { data: ingExistant } = await supabase.from('ingredients').select('id').eq('fiche_id', params_route.id).single()
        const payload = {
          nom, prix_kg: coutPortion || 0,
          unite: isSousFiche ? uniteProduction : 'portions',
          est_sous_fiche: true, fiche_id: params_route.id
        }
        if (ingExistant) await supabase.from('ingredients').update(payload).eq('fiche_id', params_route.id)
        else await supabase.from('ingredients').insert([payload])
      }

      await log({ action: 'MODIFICATION', entite: 'fiche', entite_id: params_route.id, entite_nom: nom })
      clearDraft()
      router.push(`/fiches/${params_route.id}`)
    } catch (err) {
      setError("Erreur lors de l'enregistrement")
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: c.fond }}>Chargement...</div>

  return (
    <div style={{ minHeight: '100vh', background: c.fond }}>
      {/* Header */}
      <div style={{ background: c.principal, padding: '0 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '56px', position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Logo height={28} couleur="white" onClick={() => router.push('/dashboard')} />
          <button onClick={() => router.push(`/fiches/${params_route.id}`)} style={{ background: 'transparent', border: '0.5px solid rgba(255,255,255,0.2)', borderRadius: '8px', padding: '6px 10px', color: 'white', cursor: 'pointer' }}>← Retour</button>
        </div>
        <button onClick={handleSubmit} disabled={saving} style={{ background: c.accent, color: c.principal, border: 'none', borderRadius: '8px', padding: '8px 16px', fontWeight: '600', cursor: 'pointer' }}>
          {saving ? '...' : 'Enregistrer'}
        </button>
      </div>

      <div style={{ padding: isMobile ? '12px' : '24px', maxWidth: '800px', margin: '0 auto' }}>
        {/* Photo Section - RETOUR DESIGN ORIGINAL */}
        <div style={{ background: c.blanc, borderRadius: '12px', padding: isMobile ? '16px' : '24px', border: `0.5px solid ${c.bordure}`, marginBottom: '12px' }}>
          <div style={{ fontSize: '13px', fontWeight: '500', color: c.texteMuted, textTransform: 'uppercase', marginBottom: '14px' }}>Photo du plat</div>
          <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
            {photoPreview ? (
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <img src={photoPreview} alt="Aperçu" style={{ width: isMobile ? '100px' : '160px', height: isMobile ? '80px' : '120px', objectFit: 'cover', borderRadius: '8px', border: `0.5px solid ${c.bordure}` }} />
                <button onClick={supprimerPhoto} style={{ position: 'absolute', top: '-8px', right: '-8px', background: '#A32D2D', color: 'white', border: 'none', borderRadius: '50%', width: '20px', height: '20px', cursor: 'pointer' }}>×</button>
              </div>
            ) : (
              <div style={{ width: isMobile ? '100px' : '160px', height: isMobile ? '80px' : '120px', borderRadius: '8px', border: `1px dashed ${c.bordure}`, display: 'flex', alignItems: 'center', justifyContent: 'center', background: c.fond, flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '20px' }}>📷</span>
                <span style={{ fontSize: '10px', color: c.texteMuted }}>Aucune photo</span>
              </div>
            )}
            <div style={{ flex: 1 }}>
              <input type="file" accept="image/*" onChange={handlePhoto} style={{ width: '100%', padding: '10px', border: `0.5px solid ${c.accent}`, borderRadius: '8px', fontSize: '13px', background: c.accentClair }} />
            </div>
          </div>
        </div>

        {/* Infos Section */}
        <div style={{ background: c.blanc, borderRadius: '12px', padding: '24px', border: `0.5px solid ${c.bordure}`, marginBottom: '12px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <label style={{ fontSize: '12px', color: c.texteMuted }}>Nom *</label>
            <input type="text" value={nom} onChange={e => setNom(e.target.value)} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: `0.5px solid ${c.bordure}` }} />
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <select value={categorie} onChange={e => setCategorie(e.target.value)} style={{ padding: '12px', borderRadius: '8px', border: `0.5px solid ${c.bordure}` }}>
                {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
              </select>
              <select value={saison} onChange={e => setSaison(e.target.value)} style={{ padding: '12px', borderRadius: '8px', border: `0.5px solid ${c.bordure}` }}>
                {theme.saisons.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '12px', color: c.texteMuted }}>{isSousFiche ? 'Rendement total' : 'Portions'}</label>
                <div style={{ display: 'flex', gap: '4px' }}>
                  <input type="number" value={nbPortions} onChange={e => setNbPortions(e.target.value)} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: `0.5px solid ${c.bordure}` }} />
                  {isSousFiche && (
                    <select value={uniteProduction} onChange={e => setUniteProduction(e.target.value)} style={{ padding: '10px', borderRadius: '8px', border: `0.5px solid ${c.bordure}` }}>
                      <option value="kg">kg</option>
                      <option value="L">L</option>
                      <option value="u">u</option>
                    </select>
                  )}
                </div>
              </div>
              {!isSousFiche && (
                <div>
                  <label style={{ fontSize: '12px', color: c.texteMuted }}>Prix TTC (€)</label>
                  <input type="number" step="0.01" value={prixTTC} onChange={e => setPrixTTC(e.target.value)} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: `0.5px solid ${c.bordure}` }} />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Ingrédients Section */}
        <div style={{ background: c.blanc, borderRadius: '12px', padding: '24px', border: `0.5px solid ${c.bordure}`, marginBottom: '12px' }}>
          <div style={{ fontSize: '13px', fontWeight: '500', color: c.texteMuted, textTransform: 'uppercase', marginBottom: '14px' }}>Ingrédients</div>
          {ingredients.map((ing, index) => (
            <div key={index} style={{ display: 'flex', gap: '8px', marginBottom: '8px', alignItems: 'center' }}>
              <div style={{ flex: 2 }}><IngredientSearch ingredients={listeIngredients} value={ing.ingredient_id} onChange={val => modifierIngredient(index, 'ingredient_id', val)} /></div>
              <input type="number" step="0.01" value={ing.quantite} placeholder="Qté" onChange={e => modifierIngredient(index, 'quantite', e.target.value)} style={{ width: '80px', padding: '10px', borderRadius: '8px', border: `0.5px solid ${c.bordure}` }} />
              <select value={ing.unite} onChange={e => modifierIngredient(index, 'unite', e.target.value)} style={{ padding: '10px', borderRadius: '8px', border: `0.5px solid ${c.bordure}` }}>
                {['kg', 'g', 'L', 'cl', 'ml', 'u', 'botte', 'portions'].map(u => <option key={u} value={u}>{u}</option>)}
              </select>
              <button onClick={() => setIngredients(ingredients.filter((_, i) => i !== index))} style={{ color: '#ff4444', background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer' }}>×</button>
            </div>
          ))}
          <button onClick={() => setIngredients([...ingredients, { ingredient_id: '', nom: '', quantite: '', unite: 'kg' }])} style={{ width: '100%', padding: '12px', background: c.vertClair, color: c.vert, border: 'none', borderRadius: '8px', cursor: 'pointer', marginTop: '10px' }}>+ Ajouter un ingrédient</button>
        </div>

        {/* Récapitulatif */}
        <div style={{ background: c.blanc, borderRadius: '12px', padding: '20px', border: `0.5px solid ${c.bordure}`, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <div style={{ background: c.fond, padding: '12px', borderRadius: '8px' }}>
            <div style={{ fontSize: '10px', color: c.texteMuted }}>COÛT TOTAL</div>
            <div style={{ fontSize: '18px', fontWeight: 'bold' }}>{calculerCout().toFixed(2)} €</div>
          </div>
        </div>
      </div>
    </div>
  )
}
