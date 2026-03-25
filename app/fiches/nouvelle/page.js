'use client'
import { useState, useEffect } from 'react'
import { supabase, getParametres, getClientId } from '../../../lib/supabase'
import { useRouter } from 'next/navigation'
import { theme, Logo } from '../../../lib/theme.jsx'
import { useIsMobile } from '../../../lib/useIsMobile'
import { useTheme } from '../../../lib/useTheme'
import { useAutosave } from '../../../lib/useAutosave'
import { log } from '../../../lib/useLog'
import { ALLERGENES } from '../../../lib/allergenes'
import IngredientSearch from '../../../components/IngredientSearch'

const isIngredientPossible = (cat) => cat === 'Sous-fiche' || cat === 'Accompagnements'

export default function NouvelleFiche() {
  const [nom, setNom] = useState('')
  const [categoriePlat, setCategoriePlat] = useState('')
  const [lieuId, setLieuId] = useState('')
  const [nbPortions, setNbPortions] = useState('')
  const [unitePortions, setUnitePortions] = useState('portions')
  const [prixTTC, setPrixTTC] = useState('')
  const [perte, setPerte] = useState(0)
  const [description, setDescription] = useState('')
  const [saison, setSaison] = useState('Printemps 2026')
  const [allergenes, setAllergenes] = useState([])
  const [photo, setPhoto] = useState(null)
  const [photoPreview, setPhotoPreview] = useState(null)
  const [ingredients, setIngredients] = useState([
    { ingredient_id: '', nom: '', quantite: '', unite: 'kg' }
  ])
  const [listeIngredients, setListeIngredients] = useState([])
  const [lieux, setLieux] = useState([])
  const [categoriesDyn, setCategoriesDyn] = useState([])
  const [params, setParams] = useState({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [draftRestored, setDraftRestored] = useState(false)
  const router = useRouter()
  const { c, nomEtablissement } = useTheme()
  const saisons = theme.saisons
  const isMobile = useIsMobile()

  // Pour la rétrocompatibilité : isSousFiche basé sur la catégorie sélectionnée
  const catSelectionnee = categoriesDyn.find(cat => cat.id === categoriePlat)
  const isSousFiche = catSelectionnee?.nom === 'Sous-fiches' || catSelectionnee?.nom === 'Sous-fiche'

  const autosaveData = { nom, categoriePlat, lieuId, nbPortions, unitePortions, prixTTC, perte, description, saison, allergenes, ingredients }
  const { hasDraft, lastSaved, getDraft, clearDraft } = useAutosave('nouvelle-fiche-draft', autosaveData, 60000)

  useEffect(() => {
    checkUser()
    loadIngredients()
    loadParams()
    loadDynamique()
  }, [])

  const checkUser = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) router.push('/')
  }

  const loadParams = async () => {
    const p = await getParametres()
    setParams(p)
  }

  const loadIngredients = async () => {
    const clientId = await getClientId()
    if (!clientId) return
    const { data } = await supabase.from('ingredients').select('*').eq('client_id', clientId).order('nom').limit(5000)
    setListeIngredients(data || [])
  }

  const loadDynamique = async () => {
    const clientId = await getClientId()
    if (!clientId) return
    const [{ data: lieuxData }, { data: catsData }] = await Promise.all([
      supabase.from('lieux').select('*').eq('client_id', clientId).eq('section', 'cuisine').order('ordre'),
      supabase.from('categories_plats').select('*').eq('client_id', clientId).eq('section', 'cuisine').order('ordre')
    ])
    setLieux(lieuxData || [])
    setCategoriesDyn(catsData || [])
    if (catsData?.length > 0) setCategoriePlat(catsData[0].id)
  }

  const restaurerBrouillon = () => {
    const draft = getDraft()
    if (!draft) return
    setNom(draft.nom || '')
    setCategoriePlat(draft.categoriePlat || '')
    setLieuId(draft.lieuId || '')
    setNbPortions(draft.nbPortions || '')
    setUnitePortions(draft.unitePortions || 'portions')
    setPrixTTC(draft.prixTTC || '')
    setPerte(draft.perte || 0)
    setDescription(draft.description || '')
    setSaison(draft.saison || 'Printemps 2026')
    setAllergenes(draft.allergenes || [])
    setIngredients(draft.ingredients || [{ ingredient_id: '', nom: '', quantite: '', unite: 'kg' }])
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
      if (ingData?.prix_kg && ing.quantite) return total + (ingData.prix_kg * parseFloat(ing.quantite))
      return total
    }, 0)
  }

  const calculerCoutAvecPerte = () => {
    const cout = calculerCout()
    if (!cout || !perte || parseFloat(perte) <= 0) return cout
    return cout / (1 - parseFloat(perte) / 100)
  }

  const calculerCoutPortion = () => {
    const cout = calculerCoutAvecPerte()
    if (!cout || !nbPortions) return null
    return (cout / parseFloat(nbPortions)).toFixed(4)
  }

  const foodCost = () => {
    const cout = calculerCoutAvecPerte()
    if (!prixTTC || !cout || !nbPortions) return null
    return (cout / parseFloat(nbPortions) / (parseFloat(prixTTC) / 1.10) * 100).toFixed(1)
  }

  const prixIndicatif = () => {
    const coutPortion = calculerCoutPortion()
    if (!coutPortion) return null
    const seuil = parseFloat(params['seuil_vert_cuisine'] || 28) / 100
    const tva = 1 + parseFloat(params['tva_restauration'] || 10) / 100
    return (parseFloat(coutPortion) / seuil * tva).toFixed(2)
  }

  const handleSubmit = async () => {
    if (!nom) { setError('Le nom de la fiche est obligatoire'); return }
    if (!nbPortions) { setError('Le nombre de portions est obligatoire'); return }
    setLoading(true)
    setError('')

    const clientId = await getClientId()
    if (!clientId) { setError('Erreur : session expirée'); setLoading(false); return }

    const coutPortion = calculerCoutPortion()

    const { data: fiche, error: errFiche } = await supabase
      .from('fiches')
      .insert([{
        nom,
        categorie: catSelectionnee?.nom || '',
        categorie_plat_id: categoriePlat || null,
        lieu_id: lieuId || null,
        nb_portions: parseInt(nbPortions),
        prix_ttc: isSousFiche ? null : (prixTTC ? parseFloat(prixTTC) : null),
        description, saison, allergenes,
        cout_portion: coutPortion ? parseFloat(coutPortion) : null,
        perte: perte ? parseFloat(perte) : 0,
        client_id: clientId
      }])
      .select().single()

    if (errFiche) { setError('Erreur : ' + errFiche.message); setLoading(false); return }

    if (photo) {
      const ext = photo.name.split('.').pop()
      const path = `${clientId}/${fiche.id}.${ext}`
      const { error: errPhoto } = await supabase.storage
        .from('fiches-photos').upload(path, photo, { upsert: true })
      if (!errPhoto) {
        const { data: urlData } = supabase.storage.from('fiches-photos').getPublicUrl(path)
        await supabase.from('fiches').update({ photo_url: urlData.publicUrl }).eq('id', fiche.id)
      }
    }

    const ingredientsAInserer = ingredients
      .filter(i => i.ingredient_id && i.quantite)
      .map(i => ({
        fiche_id: fiche.id,
        ingredient_id: i.ingredient_id,
        quantite: parseFloat(i.quantite),
        unite: i.unite,
        client_id: clientId
      }))

    if (ingredientsAInserer.length > 0) {
      await supabase.from('fiche_ingredients').insert(ingredientsAInserer)
    }

    if (isIngredientPossible(catSelectionnee?.nom || '') && coutPortion) {
      await supabase.from('ingredients').insert([{
        nom: fiche.nom,
        prix_kg: parseFloat(coutPortion),
        unite: isSousFiche ? unitePortions : 'portions',
        est_sous_fiche: true,
        fiche_id: fiche.id,
        client_id: clientId
      }])
    }

    await log({
      action: 'CREATION', entite: 'fiche', entite_id: fiche.id,
      entite_nom: nom, section: 'cuisine',
      details: `Catégorie: ${catSelectionnee?.nom || ''}, Saison: ${saison}${perte > 0 ? `, Perte: ${perte}%` : ''}`
    })

    clearDraft()
    router.push(isSousFiche ? '/sous-fiches' : '/fiches')
  }

  const fc = foodCost()
  const coutPortion = calculerCoutPortion()
  const prixIndic = prixIndicatif()
  const seuilVert = parseFloat(params['seuil_vert_cuisine'] || 28)
  const coutBrut = calculerCout()
  const coutAvecPerte = calculerCoutAvecPerte()

  return (
    <div style={{ minHeight: '100vh', background: c.fond }}>

      <div style={{
        background: c.principal, borderBottom: `0.5px solid ${c.accent}40`,
        padding: '0 16px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', height: '56px',
        position: 'sticky', top: 0, zIndex: 100
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Logo height={28} couleur="white" nom={nomEtablissement} onClick={() => router.push("/dashboard")} />
          {!isMobile && <span style={{ color: 'rgba(255,255,255,0.3)' }}>|</span>}
          <button onClick={() => router.push('/dashboard')} style={{
            background: 'transparent', border: '0.5px solid rgba(255,255,255,0.2)',
            borderRadius: '8px', padding: '6px 10px', fontSize: '13px', cursor: 'pointer', color: 'rgba(255,255,255,0.7)'
          }}>← Retour</button>
          {!isMobile && <span style={{ fontSize: '14px', fontWeight: '500', color: 'white' }}>{isSousFiche ? 'Nouvelle sous-fiche' : 'Nouvelle fiche technique'}</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {lastSaved && <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>{!isMobile && `Sauvegardé à ${lastSaved.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`}{isMobile && '✓'}</span>}
          <button onClick={handleSubmit} disabled={loading} style={{
            background: loading ? c.texteMuted : c.accent, color: c.principal, border: 'none',
            borderRadius: '8px', padding: '8px 16px', fontSize: '13px', fontWeight: '600', cursor: loading ? 'not-allowed' : 'pointer'
          }}>
            {loading ? '...' : 'Enregistrer'}
          </button>
        </div>
      </div>

      <div style={{ padding: isMobile ? '12px' : '24px', maxWidth: '800px', margin: '0 auto' }}>

        {hasDraft && !draftRestored && (
          <div style={{ background: '#FAEEDA', border: '0.5px solid #FAC775', borderRadius: '10px', padding: '14px 16px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
            <div>
              <div style={{ fontSize: '13px', fontWeight: '500', color: '#633806' }}>📋 Un brouillon a été trouvé</div>
              <div style={{ fontSize: '12px', color: '#854F0B', marginTop: '2px' }}>Voulez-vous restaurer votre travail précédent ?</div>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={restaurerBrouillon} style={{ padding: '8px 14px', background: '#854F0B', color: 'white', border: 'none', borderRadius: '8px', fontSize: '12px', cursor: 'pointer', fontWeight: '500' }}>Restaurer</button>
              <button onClick={() => clearDraft()} style={{ padding: '8px 14px', background: 'transparent', color: '#854F0B', border: '0.5px solid #FAC775', borderRadius: '8px', fontSize: '12px', cursor: 'pointer' }}>Ignorer</button>
            </div>
          </div>
        )}

        {draftRestored && (
          <div style={{ background: '#E8F2EF', border: `0.5px solid #4A7B6F40`, borderRadius: '10px', padding: '12px 16px', marginBottom: '16px', fontSize: '13px', color: '#4A7B6F' }}>
            ✓ Brouillon restauré avec succès !
          </div>
        )}

        {error && <div style={{ background: '#FCEBEB', color: '#A32D2D', borderRadius: '8px', padding: '12px 16px', fontSize: '13px', marginBottom: '16px' }}>{error}</div>}

        {isSousFiche && (
          <div style={{ background: c.violetClair, color: '#3C3489', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px', border: '0.5px solid #AFA9EC' }}>
            <span style={{ background: c.violet, color: 'white', borderRadius: '6px', padding: '2px 8px', fontSize: '11px', fontWeight: '500' }}>SF</span>
            Cette fiche sera disponible comme ingrédient dans les fiches principales
          </div>
        )}

        {/* Photo */}
        <div style={{ background: c.blanc, borderRadius: '12px', padding: isMobile ? '16px' : '24px', border: `0.5px solid ${c.bordure}`, marginBottom: '12px' }}>
          <div style={{ fontSize: '13px', fontWeight: '500', color: c.texteMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '14px' }}>Photo du plat</div>
          <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
            {photoPreview ? (
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <img src={photoPreview} alt="Aperçu" style={{ width: isMobile ? '100px' : '160px', height: isMobile ? '80px' : '120px', objectFit: 'cover', borderRadius: '8px', border: `0.5px solid ${c.bordure}` }} />
                <button onClick={() => { setPhoto(null); setPhotoPreview(null) }} style={{ position: 'absolute', top: '-8px', right: '-8px', background: '#A32D2D', color: 'white', border: 'none', borderRadius: '50%', width: '20px', height: '20px', fontSize: '12px', cursor: 'pointer' }}>×</button>
              </div>
            ) : (
              <div style={{ width: isMobile ? '100px' : '160px', height: isMobile ? '80px' : '120px', borderRadius: '8px', border: `1px dashed ${c.bordure}`, display: 'flex', alignItems: 'center', justifyContent: 'center', background: c.fond, flexDirection: 'column', gap: '4px', flexShrink: 0 }}>
                <span style={{ fontSize: '20px' }}>📷</span>
                <span style={{ fontSize: '10px', color: c.texteMuted }}>Aucune photo</span>
              </div>
            )}
            <div style={{ flex: 1 }}>
              <input type="file" accept="image/*" onChange={handlePhoto}
                style={{ width: '100%', padding: '10px 12px', border: `0.5px solid ${c.accent}`, borderRadius: '8px', fontSize: '13px', background: c.accentClair, cursor: 'pointer', color: c.texte }}
              />
              <div style={{ fontSize: '11px', color: c.texteMuted, marginTop: '6px' }}>JPG, PNG, WEBP — Max 5MB</div>
            </div>
          </div>
        </div>

        {/* Informations générales */}
        <div style={{ background: c.blanc, borderRadius: '12px', padding: isMobile ? '16px' : '24px', border: `0.5px solid ${isSousFiche ? '#AFA9EC' : c.bordure}`, marginBottom: '12px' }}>
          <div style={{ fontSize: '13px', fontWeight: '500', color: c.texteMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '14px' }}>Informations générales</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <label style={{ fontSize: '12px', color: c.texteMuted, fontWeight: '500', display: 'block', marginBottom: '6px' }}>Nom *</label>
              <input type="text" value={nom} onChange={e => setNom(e.target.value)}
                placeholder={isSousFiche ? 'Ex : Sauce béarnaise' : 'Ex : Blanquette de veau'}
                style={{ width: '100%', padding: '12px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, fontSize: '14px', outline: 'none', color: c.texte, background: c.blanc }}
              />
            </div>

            {/* Catégorie + Lieu dynamiques */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '12px', color: c.texteMuted, fontWeight: '500', display: 'block', marginBottom: '6px' }}>Catégorie</label>
                <select value={categoriePlat} onChange={e => setCategoriePlat(e.target.value)}
                  style={{ width: '100%', padding: '12px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, fontSize: '14px', background: c.blanc, outline: 'none', color: c.texte }}>
                  <option value="">Sans catégorie</option>
                  {categoriesDyn.map(cat => <option key={cat.id} value={cat.id}>{cat.emoji} {cat.nom}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: '12px', color: c.texteMuted, fontWeight: '500', display: 'block', marginBottom: '6px' }}>Lieu de service</label>
                <select value={lieuId} onChange={e => setLieuId(e.target.value)}
                  style={{ width: '100%', padding: '12px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, fontSize: '14px', background: c.blanc, outline: 'none', color: c.texte }}>
                  <option value="">Sans lieu</option>
                  {lieux.map(l => <option key={l.id} value={l.id}>{l.emoji} {l.nom}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label style={{ fontSize: '12px', color: c.texteMuted, fontWeight: '500', display: 'block', marginBottom: '6px' }}>Saison</label>
              <select value={saison} onChange={e => setSaison(e.target.value)} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, fontSize: '14px', background: c.blanc, outline: 'none', color: c.texte }}>
                {saisons.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '12px', color: c.texteMuted, fontWeight: '500', display: 'block', marginBottom: '6px' }}>{isSousFiche ? 'Quantité produite *' : 'Nombre de portions *'}</label>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <input type="number" value={nbPortions} onChange={e => setNbPortions(e.target.value)} placeholder="Ex : 10"
                    style={{ flex: 1, padding: '12px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, fontSize: '14px', outline: 'none', color: c.texte, background: c.blanc }}
                  />
                  {isSousFiche && (
                    <select value={unitePortions} onChange={e => setUnitePortions(e.target.value)} style={{ padding: '12px 8px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, fontSize: '13px', background: c.blanc, outline: 'none', color: c.texte }}>
                      {['portions', 'kg', 'L', 'cl', 'ml', 'u'].map(u => <option key={u}>{u}</option>)}
                    </select>
                  )}
                </div>
              </div>
              {!isSousFiche && (
                <div>
                  <label style={{ fontSize: '12px', color: c.texteMuted, fontWeight: '500', display: 'block', marginBottom: '6px' }}>Prix TTC (€)</label>
                  <input type="number" value={prixTTC} onChange={e => setPrixTTC(e.target.value)} placeholder="Ex : 18.50" step="0.01"
                    style={{ width: '100%', padding: '12px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, fontSize: '14px', outline: 'none', color: c.texte, background: c.blanc }}
                  />
                  {prixIndic && <div style={{ fontSize: '11px', color: c.vert, marginTop: '4px' }}>Indicatif ({seuilVert}%) : <strong>{prixIndic} €</strong></div>}
                </div>
              )}
            </div>

            {!isSousFiche && (
              <div>
                <label style={{ fontSize: '12px', color: c.texteMuted, fontWeight: '500', display: 'block', marginBottom: '6px' }}>
                  % de perte — parures, épluchage, désossage...
                </label>
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
            )}

            <div>
              <label style={{ fontSize: '12px', color: c.texteMuted, fontWeight: '500', display: 'block', marginBottom: '6px' }}>Description</label>
              <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Notes de présentation, dressage..." rows={3}
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
                  <input type="number" value={ing.quantite} step="0.01" onChange={e => modifierIngredient(index, 'quantite', e.target.value)} placeholder="0"
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
                      return <span style={{ fontSize: '11px', fontWeight: '500', color: cout ? c.texte : c.texteMuted, whiteSpace: 'nowrap' }}>{cout ? `${cout} €` : '—'}</span>
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
        <div style={{ background: c.blanc, borderRadius: '12px', padding: isMobile ? '16px' : '20px', border: `0.5px solid ${c.bordure}`, display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px' }}>
          <div style={{ background: c.fond, borderRadius: '8px', padding: '12px' }}>
            <div style={{ fontSize: '10px', color: c.texteMuted, fontWeight: '500', textTransform: 'uppercase' }}>Coût brut</div>
            <div style={{ fontSize: '20px', fontWeight: '500', marginTop: '4px', color: c.texte }}>{coutBrut.toFixed(2)} €</div>
          </div>
          {parseFloat(perte) > 0 && (
            <div style={{ background: '#FAEEDA', borderRadius: '8px', padding: '12px', border: '0.5px solid #FAC775' }}>
              <div style={{ fontSize: '10px', color: '#854F0B', fontWeight: '500', textTransform: 'uppercase' }}>Perte {perte}% → Coût réel</div>
              <div style={{ fontSize: '20px', fontWeight: '500', marginTop: '4px', color: '#854F0B' }}>{coutAvecPerte.toFixed(2)} €</div>
            </div>
          )}
          {coutPortion && !isSousFiche && (
            <div style={{ background: c.fond, borderRadius: '8px', padding: '12px' }}>
              <div style={{ fontSize: '10px', color: c.texteMuted, fontWeight: '500', textTransform: 'uppercase' }}>Coût / portion</div>
              <div style={{ fontSize: '20px', fontWeight: '500', marginTop: '4px', color: c.texte }}>{parseFloat(coutPortion).toFixed(2)} €</div>
            </div>
          )}
          {prixIndic && !isSousFiche && (
            <div style={{ background: c.vertClair, borderRadius: '8px', padding: '12px' }}>
              <div style={{ fontSize: '10px', color: c.vert, fontWeight: '500', textTransform: 'uppercase' }}>Prix indicatif TTC</div>
              <div style={{ fontSize: '20px', fontWeight: '500', marginTop: '4px', color: c.vert }}>{prixIndic} €</div>
            </div>
          )}
          {fc && !isSousFiche && (
            <div style={{ background: fc < seuilVert ? '#EAF3DE' : fc < parseFloat(params['seuil_orange_cuisine'] || 35) ? '#FAEEDA' : '#FCEBEB', borderRadius: '8px', padding: '12px' }}>
              <div style={{ fontSize: '10px', fontWeight: '500', textTransform: 'uppercase', color: fc < seuilVert ? '#3B6D11' : fc < parseFloat(params['seuil_orange_cuisine'] || 35) ? '#854F0B' : '#A32D2D' }}>Food cost</div>
              <div style={{ fontSize: '20px', fontWeight: '500', marginTop: '4px', color: fc < seuilVert ? '#3B6D11' : fc < parseFloat(params['seuil_orange_cuisine'] || 35) ? '#854F0B' : '#A32D2D' }}>{fc} %</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
