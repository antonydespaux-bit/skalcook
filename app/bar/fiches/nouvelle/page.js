'use client'
import { useState, useEffect } from 'react'
import { supabase, getParametres } from '../../../../lib/supabase'
import { useRouter } from 'next/navigation'
import { theme, Logo } from '../../../../lib/theme.jsx'
import { useIsMobile } from '../../../../lib/useIsMobile'
import { useTheme } from '../../../../lib/useTheme'
import { useRole } from '../../../../lib/useRole'
import { useAutosave } from '../../../../lib/useAutosave'
import { log } from '../../../../lib/useLog'
import { ALLERGENES } from '../../../../lib/allergenes'
import IngredientSearch from '../../../../components/IngredientSearch'

const CATEGORIES_BAR = ['Cocktails', 'Vins', 'Bières', 'Softs', 'Champagnes', 'Spiritueux', 'Sans alcool', 'Mocktails', 'Eaux', 'Caféterie', 'Sous-fiche']
const CATEGORIES_ALCOOL = ['Cocktails', 'Vins', 'Champagnes', 'Bières', 'Spiritueux']

export default function NouvelleBarFiche() {
  const [nom, setNom] = useState('')
  const [categorie, setCategorie] = useState('Cocktails')
  const [nbPortions, setNbPortions] = useState('')
  const [prixTTC, setPrixTTC] = useState('')
  const [description, setDescription] = useState('')
  const [saison, setSaison] = useState('Printemps 2026')
  const [allergenes, setAllergenes] = useState([])
  const [photo, setPhoto] = useState(null)
  const [photoPreview, setPhotoPreview] = useState(null)
  const [ingredients, setIngredients] = useState([
    { ingredient_id: '', nom: '', quantite: '', unite: 'cl', is_sf: false }
  ])
  const [listeIngredients, setListeIngredients] = useState([])
  const [listeSousFiches, setListeSousFiches] = useState([])
  const [params, setParams] = useState({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [draftRestored, setDraftRestored] = useState(false)
  const router = useRouter()
  const { c } = useTheme()
  const { role } = useRole()
  const isMobile = useIsMobile()

  // Fusionner les ingrédients classiques et les sous-fiches pour la recherche
  const optionsRecherche = [
    ...listeIngredients.map(i => ({ ...i, type: 'ing' })),
    ...listeSousFiches.map(sf => ({ 
      id: sf.id, 
      nom: `(SF) ${sf.nom}`, 
      prix_kg: sf.cout_portion, 
      unite: sf.unite_production || 'L',
      type: 'sf' 
    }))
  ]

  const autosaveData = { nom, categorie, nbPortions, prixTTC, description, saison, allergenes, ingredients }
  const { hasDraft, lastSaved, getDraft, clearDraft } = useAutosave('nouvelle-fiche-bar-draft', autosaveData, 60000)

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
    const { data: ings } = await supabase.from('ingredients_bar').select('*').order('nom')
    setListeIngredients(ings || [])
    
    const { data: sfs } = await supabase.from('fiches_bar').select('id, nom, cout_portion, unite_production').order('nom')
    setListeSousFiches(sfs || [])
  }

  const restaurerBrouillon = () => {
    const draft = getDraft()
    if (!draft) return
    setNom(draft.nom || '')
    setCategorie(draft.categorie || 'Cocktails')
    setNbPortions(draft.nbPortions || '')
    setPrixTTC(draft.prixTTC || '')
    setDescription(draft.description || '')
    setSaison(draft.saison || 'Printemps 2026')
    setAllergenes(draft.allergenes || [])
    setIngredients(draft.ingredients || [{ ingredient_id: '', nom: '', quantite: '', unite: 'cl', is_sf: false }])
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
    setIngredients([...ingredients, { ingredient_id: '', nom: '', quantite: '', unite: 'cl', is_sf: false }])
  }

  const supprimerIngredient = (index) => {
    setIngredients(ingredients.filter((_, i) => i !== index))
  }

  const modifierIngredient = (index, champ, valeur) => {
    const nouveaux = [...ingredients]
    nouveaux[index][champ] = valeur
    if (champ === 'ingredient_id') {
      const selection = optionsRecherche.find(i => i.id === valeur)
      if (selection) {
        nouveaux[index].nom = selection.nom
        nouveaux[index].unite = selection.unite || 'cl'
        nouveaux[index].is_sf = selection.type === 'sf'
      }
    }
    setIngredients(nouveaux)
  }

  const calculerCout = () => {
    return ingredients.reduce((total, ing) => {
      const selection = optionsRecherche.find(i => i.id === ing.ingredient_id)
      if (selection?.prix_kg && ing.quantite) return total + (selection.prix_kg * parseFloat(ing.quantite))
      return total
    }, 0)
  }

  const calculerCoutPortion = () => {
    const cout = calculerCout()
    if (!cout || !nbPortions) return null
    return (cout / parseFloat(nbPortions)).toFixed(4)
  }

  const TVA_BAR = () => CATEGORIES_ALCOOL.includes(categorie) ? 20 : 10

  const foodCost = () => {
    const cout = calculerCout()
    if (!prixTTC || !cout || !nbPortions) return null
    const tva = 1 + TVA_BAR() / 100
    return (cout / parseFloat(nbPortions) / (parseFloat(prixTTC) / tva) * 100).toFixed(1)
  }

  const prixIndicatif = () => {
    const coutPortion = calculerCoutPortion()
    if (!coutPortion) return null
    const seuil = parseFloat(params['seuil_vert_boissons'] || 22) / 100
    const tva = 1 + TVA_BAR() / 100
    return (parseFloat(coutPortion) / seuil * tva).toFixed(2)
  }

  const handleSubmit = async () => {
    if (!nom) { setError('Le nom est obligatoire'); return }
    if (!nbPortions) { setError('Le nombre de portions est obligatoire'); return }
    setLoading(true)
    setError('')

    const coutPortion = calculerCoutPortion()
    // Si c'est une sous-fiche, on définit l'unité de production sur 'L' ou 'kg'
    const uniteProduction = categorie === 'Sous-fiche' ? (ingredients[0]?.unite === 'g' || ingredients[0]?.unite === 'kg' ? 'kg' : 'L') : 'portion'

    const { data: fiche, error: errFiche } = await supabase
      .from('fiches_bar')
      .insert([{
        nom, categorie,
        nb_portions: parseInt(nbPortions),
        prix_ttc: prixTTC ? parseFloat(prixTTC) : null,
        description, saison, allergenes,
        cout_portion: coutPortion ? parseFloat(coutPortion) : null,
        unite_production: uniteProduction
      }])
      .select().single()

    if (errFiche) { setError('Erreur : ' + errFiche.message); setLoading(false); return }

    if (photo) {
      const ext = photo.name.split('.').pop()
      const path = `bar-${fiche.id}.${ext}`
      const { error: errPhoto } = await supabase.storage.from('fiches-photos').upload(path, photo, { upsert: true })
      if (!errPhoto) {
        const { data: urlData } = supabase.storage.from('fiches-photos').getPublicUrl(path)
        await supabase.from('fiches_bar').update({ photo_url: urlData.publicUrl }).eq('id', fiche.id)
      }
    }

    // Préparation des ingrédients et sous-fiches pour l'insertion
    const linesToInsert = ingredients
      .filter(i => i.ingredient_id && i.quantite)
      .map(i => ({
        fiche_bar_id: fiche.id,
        ingredient_id: i.is_sf ? null : i.ingredient_id,
        sous_fiche_id: i.is_sf ? i.ingredient_id : null,
        quantite: parseFloat(i.quantite),
        unite: i.unite
      }))

    if (linesToInsert.length > 0) {
      await supabase.from('fiche_bar_ingredients').insert(linesToInsert)
    }

    await log({
      action: 'CREATION', entite: 'fiche_bar', entite_id: fiche.id,
      entite_nom: nom, section: 'bar',
      details: `Catégorie: ${categorie}`
    })

    clearDraft()
    router.push('/bar/fiches')
  }

  const fc = foodCost()
  const prixIndic = prixIndicatif()
  const seuilVert = parseFloat(params['seuil_vert_boissons'] || 22)
  const seuilOrange = parseFloat(params['seuil_orange_boissons'] || 28)

  return (
    <div style={{ minHeight: '100vh', background: c.fond }}>
      {/* HEADER */}
      <div style={{
        background: '#3C3489', borderBottom: '0.5px solid #7F77DD40',
        padding: '0 16px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', height: '56px',
        position: 'sticky', top: 0, zIndex: 100
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Logo height={28} couleur="white" onClick={() => router.push('/bar/dashboard')} />
          <button onClick={() => router.push('/bar/fiches')} style={{
            background: 'transparent', border: '0.5px solid rgba(255,255,255,0.2)',
            borderRadius: '8px', padding: '6px 10px', fontSize: '13px', cursor: 'pointer', color: 'rgba(255,255,255,0.7)'
          }}>← Retour</button>
        </div>
        <button onClick={handleSubmit} disabled={loading} style={{
          background: loading ? '#666' : '#C4956A', color: '#3C3489', border: 'none',
          borderRadius: '8px', padding: '8px 16px', fontSize: '13px', fontWeight: '600', cursor: loading ? 'not-allowed' : 'pointer'
        }}>
          {loading ? '...' : 'Enregistrer'}
        </button>
      </div>

      <div style={{ padding: isMobile ? '12px' : '24px', maxWidth: '800px', margin: '0 auto' }}>
        
        {/* BROUILLON & ERREUR */}
        {hasDraft && !draftRestored && (
          <div style={{ background: '#FAEEDA', border: '0.5px solid #FAC775', borderRadius: '10px', padding: '14px 16px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', color: '#633806' }}>📋 Brouillon détecté</span>
            <button onClick={restaurerBrouillon} style={{ padding: '6px 12px', background: '#854F0B', color: 'white', border: 'none', borderRadius: '6px', fontSize: '12px', cursor: 'pointer' }}>Restaurer</button>
          </div>
        )}
        {error && <div style={{ background: '#FCEBEB', color: '#A32D2D', borderRadius: '8px', padding: '12px', marginBottom: '16px' }}>{error}</div>}

        {/* FORMULAIRE PHOTO & INFOS */}
        <div style={{ background: c.blanc, borderRadius: '12px', padding: '20px', border: `0.5px solid ${c.bordure}`, marginBottom: '12px' }}>
          <div style={{ marginBottom: '20px' }}>
             <label style={{ fontSize: '12px', color: c.texteMuted, fontWeight: '500', display: 'block', marginBottom: '6px' }}>Nom de la fiche *</label>
             <input type="text" value={nom} onChange={e => setNom(e.target.value)} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, fontSize: '14px' }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
             <div>
                <label style={{ fontSize: '12px', color: c.texteMuted, display: 'block', marginBottom: '6px' }}>Catégorie</label>
                <select value={categorie} onChange={e => setCategorie(e.target.value)} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, background: 'white' }}>
                  {CATEGORIES_BAR.map(cat => <option key={cat}>{cat}</option>)}
                </select>
             </div>
             <div>
                <label style={{ fontSize: '12px', color: c.texteMuted, display: 'block', marginBottom: '6px' }}>Nombre de portions (ou L/kg) *</label>
                <input type="number" value={nbPortions} onChange={e => setNbPortions(e.target.value)} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: `0.5px solid ${c.bordure}` }} />
             </div>
          </div>
          <div style={{ marginBottom: '20px' }}>
                <label style={{ fontSize: '12px', color: c.texteMuted, display: 'block', marginBottom: '6px' }}>Prix de vente TTC (€)</label>
                <input type="number" value={prixTTC} onChange={e => setPrixTTC(e.target.value)} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: `0.5px solid ${c.bordure}` }} />
          </div>
        </div>

        {/* INGRÉDIENTS (Le cœur du système) */}
        <div style={{ background: c.blanc, borderRadius: '12px', padding: '20px', border: `0.5px solid ${c.bordure}`, marginBottom: '12px' }}>
          <div style={{ fontSize: '13px', fontWeight: '500', color: c.texteMuted, textTransform: 'uppercase', marginBottom: '14px' }}>Ingrédients & Préparations</div>
          {ingredients.map((ing, index) => (
            <div key={index} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 40px', gap: '8px', marginBottom: '8px' }}>
              <IngredientSearch 
                ingredients={optionsRecherche} 
                value={ing.ingredient_id} 
                onChange={val => modifierIngredient(index, 'ingredient_id', val)} 
              />
              <input type="number" value={ing.quantite} onChange={e => modifierIngredient(index, 'quantite', e.target.value)} placeholder="Qté" style={{ padding: '8px', borderRadius: '8px', border: `0.5px solid ${c.bordure}` }} />
              <select value={ing.unite} onChange={e => modifierIngredient(index, 'unite', e.target.value)} style={{ padding: '8px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, background: 'white' }}>
                {['cl', 'ml', 'L', 'g', 'kg', 'u', 'trait', 'pièce'].map(u => <option key={u}>{u}</option>)}
              </select>
              <button onClick={() => supprimerIngredient(index)} style={{ background: 'none', border: 'none', color: '#ff4d4d', cursor: 'pointer', fontSize: '18px' }}>×</button>
            </div>
          ))}
          <button onClick={ajouterIngredient} style={{ marginTop: '10px', background: '#EEEDFE', color: '#3C3489', border: 'none', padding: '10px 16px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px' }}>+ Ajouter</button>
        </div>

        {/* RÉCAPITULATIF FINANCIER */}
        <div style={{ background: c.blanc, borderRadius: '12px', padding: '20px', border: `0.5px solid ${c.bordure}`, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <div style={{ background: c.fond, padding: '12px', borderRadius: '8px' }}>
            <div style={{ fontSize: '10px', color: c.texteMuted }}>COÛT TOTAL</div>
            <div style={{ fontSize: '18px', fontWeight: '600' }}>{calculerCout().toFixed(2)} €</div>
          </div>
          <div style={{ background: fc < seuilVert ? '#EAF3DE' : '#FCEBEB', padding: '12px', borderRadius: '8px' }}>
            <div style={{ fontSize: '10px', color: fc < seuilVert ? '#3B6D11' : '#A32D2D' }}>FOOD COST</div>
            <div style={{ fontSize: '18px', fontWeight: '600', color: fc < seuilVert ? '#3B6D11' : '#A32D2D' }}>{fc || '—'} %</div>
          </div>
        </div>
      </div>
    </div>
  )
}
