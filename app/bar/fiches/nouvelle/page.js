'use client'
import { useState, useEffect } from 'react'
import { supabase, getParametres, getClientId } from '../../../../lib/supabase'
import { useRouter } from 'next/navigation'
import { theme, Logo } from '../../../../lib/theme.jsx'
import { useIsMobile } from '../../../../lib/useIsMobile'
import { useTheme } from '../../../../lib/useTheme'
import { useAutosave } from '../../../../lib/useAutosave'
import { log } from '../../../../lib/useLog'
import { ALLERGENES } from '../../../../lib/allergenes'
import IngredientSearch from '../../../../components/IngredientSearch'

const CATEGORIES_ALCOOL = ['Cocktails', 'Vins', 'Champagnes', 'Bières', 'Spiritueux']

export default function NouvelleBarFiche() {
  const [nom, setNom] = useState('')
  const [categoriePlat, setCategoriePlat] = useState('')
  const [lieuId, setLieuId] = useState('')
  const [nbPortions, setNbPortions] = useState('')
  const [prixTTC, setPrixTTC] = useState('')
  const [perte, setPerte] = useState(0)
  const [description, setDescription] = useState('')
  const [saison, setSaison] = useState('Printemps 2026')
  const [allergenes, setAllergenes] = useState([])
  const [ingredients, setIngredients] = useState([
    { ingredient_id: '', nom: '', quantite: '', unite: 'cl', is_sf: false }
  ])
  const [listeIngredients, setListeIngredients] = useState([])
  const [listeSousFiches, setListeSousFiches] = useState([])
  const [lieux, setLieux] = useState([])
  const [categoriesDyn, setCategoriesDyn] = useState([])
  const [params, setParams] = useState({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [draftRestored, setDraftRestored] = useState(false)
  const router = useRouter()
  const { c, nomEtablissement } = useTheme()
  const isMobile = useIsMobile()

  const catSelectionnee = categoriesDyn.find(cat => cat.id === categoriePlat)
  const isSousFiche = catSelectionnee?.nom === 'Sous-fiche' || catSelectionnee?.nom === 'Sous-fiches'
  const nomCat = catSelectionnee?.nom || ''
  const isAlcool = CATEGORIES_ALCOOL.includes(nomCat)

  const optionsRecherche = [
    ...listeIngredients.map(i => ({ ...i, type: 'ing' })),
    ...listeSousFiches.map(sf => ({
      id: sf.id, nom: sf.nom,
      prix_kg: sf.cout_portion, unite: sf.unite_production || 'cl', type: 'sf',
      est_sous_fiche: true
    }))
  ]

  const autosaveData = { nom, categoriePlat, lieuId, nbPortions, prixTTC, perte, description, saison, allergenes, ingredients }
  const { hasDraft, lastSaved, getDraft, clearDraft } = useAutosave('nouvelle-fiche-bar-draft', autosaveData, 60000)

  useEffect(() => {
    checkUser()
    loadData()
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

  const loadData = async () => {
    const clientId = await getClientId()
    if (!clientId) return
    const { data: ings } = await supabase
      .from('ingredients_bar')
      .select('*')
      .eq('client_id', clientId)
      .order('nom')
      .limit(5000)
    setListeIngredients(ings || [])
    const { data: sfs } = await supabase
      .from('fiches_bar')
      .select('id, nom, cout_portion, unite_production')
      .eq('client_id', clientId)
      .order('nom')
    setListeSousFiches(sfs || [])
  }

  const loadDynamique = async () => {
    const clientId = await getClientId()
    if (!clientId) return
    const [{ data: lieuxData }, { data: catsData }] = await Promise.all([
      supabase.from('lieux').select('*').eq('client_id', clientId).eq('section', 'bar').order('ordre'),
      supabase.from('categories_plats').select('*').eq('client_id', clientId).eq('section', 'bar').order('ordre')
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
    setPrixTTC(draft.prixTTC || '')
    setPerte(draft.perte || 0)
    setDescription(draft.description || '')
    setSaison(draft.saison || 'Printemps 2026')
    setAllergenes(draft.allergenes || [])
    setIngredients(draft.ingredients || [{ ingredient_id: '', nom: '', quantite: '', unite: 'cl', is_sf: false }])
    setDraftRestored(true)
  }

  const toggleAllergene = (id) => {
    setAllergenes(prev => prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id])
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
      const sel = optionsRecherche.find(i => i.id === valeur)
      if (sel) {
        nouveaux[index].nom = sel.nom
        nouveaux[index].unite = sel.unite || 'cl'
        nouveaux[index].is_sf = sel.type === 'sf'
      }
    }
    setIngredients(nouveaux)
  }

  const calculerCout = () => {
    return ingredients.reduce((total, ing) => {
      const sel = optionsRecherche.find(i => i.id === ing.ingredient_id)
      if (sel?.prix_kg && ing.quantite) return total + (sel.prix_kg * parseFloat(ing.quantite))
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

  const TVA_BAR = () => isAlcool ? 20 : 10

  const foodCost = () => {
    const cout = calculerCoutAvecPerte()
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

    const clientId = await getClientId()
    if (!clientId) { setError('Erreur : session expirée'); setLoading(false); return }

    const coutPortion = calculerCoutPortion()
    const uniteProduction = isSousFiche ? (ingredients[0]?.unite === 'g' || ingredients[0]?.unite === 'kg' ? 'kg' : 'L') : 'portion'

    const { data: fiche, error: errFiche } = await supabase
      .from('fiches_bar')
      .insert([{
        nom,
        categorie: nomCat,
        categorie_plat_id: categoriePlat || null,
        lieu_id: lieuId || null,
        nb_portions: parseInt(nbPortions),
        prix_ttc: isSousFiche ? null : (prixTTC ? parseFloat(prixTTC) : null),
        description, saison, allergenes,
        cout_portion: coutPortion ? parseFloat(coutPortion) : null,
        unite_production: uniteProduction,
        perte: perte ? parseFloat(perte) : 0,
        client_id: clientId
      }])
      .select().single()

    if (errFiche) { setError('Erreur : ' + errFiche.message); setLoading(false); return }

    const linesToInsert = ingredients
      .filter(i => i.ingredient_id && i.quantite)
      .map(i => ({
        fiche_bar_id: fiche.id,
        ingredient_id: i.is_sf ? null : i.ingredient_id,
        sous_fiche_id: i.is_sf ? i.ingredient_id : null,
        quantite: parseFloat(i.quantite),
        unite: i.unite,
        client_id: clientId
      }))

    if (linesToInsert.length > 0) {
      await supabase.from('fiche_bar_ingredients').insert(linesToInsert)
    }

    await log({
      action: 'CREATION', entite: 'fiche_bar', entite_id: fiche.id,
      entite_nom: nom, section: 'bar',
      details: `Catégorie: ${nomCat}, Saison: ${saison}${perte > 0 ? `, Perte: ${perte}%` : ''}`
    })

    clearDraft()
    router.push(isSousFiche ? '/bar/sous-fiches' : '/bar/fiches')
  }

  const fc = foodCost()
  const coutPortion = calculerCoutPortion()
  const prixIndic = prixIndicatif()
  const seuilVert = parseFloat(params['seuil_vert_boissons'] || 22)
  const seuilOrange = parseFloat(params['seuil_orange_boissons'] || 28)
  const coutBrut = calculerCout()
  const coutAvecPerte = calculerCoutAvecPerte()

  return (
    <div style={{ minHeight: '100vh', background: c.fond }}>
      <div style={{
        background: '#3C3489', borderBottom: '0.5px solid #7F77DD40',
        padding: '0 16px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', height: '56px',
        position: 'sticky', top: 0, zIndex: 100
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Logo height={28} couleur="white" nom={nomEtablissement} onClick={() => router.push("/bar/dashboard")} />
          <button onClick={() => router.push('/bar/dashboard')} style={{
            background: 'transparent', border: '0.5px solid rgba(255,255,255,0.2)',
            borderRadius: '8px', padding: '6px 10px', fontSize: '13px', cursor: 'pointer', color: 'rgba(255,255,255,0.7)'
          }}>← Retour</button>
          {!isMobile && <span style={{ fontSize: '14px', fontWeight: '500', color: 'white' }}>
            {isSousFiche ? 'Nouvelle sous-fiche bar' : 'Nouvelle fiche bar'}
          </span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {lastSaved && <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>
            {!isMobile && `Sauvegardé à ${lastSaved.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`}
            {isMobile && '✓'}
          </span>}
          <button onClick={handleSubmit} disabled={loading} style={{
            background: loading ? '#666' : '#C4956A', color: '#3C3489', border: 'none',
            borderRadius: '8px', padding: '8px 16px', fontSize: '13px', fontWeight: '600', cursor: loading ? 'not-allowed' : 'pointer'
          }}>{loading ? '...' : 'Enregistrer'}</button>
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

        {error && <div style={{ background: '#FCEBEB', color: '#A32D2D', borderRadius: '8px', padding: '12px 16px', fontSize: '13px', marginBottom: '16px' }}>{error}</div>}

        <div style={{ background: isAlcool ? '#FCEBEB' : '#EAF3DE', borderRadius: '8px', padding: '10px 14px', fontSize: '12px', marginBottom: '16px', border: `0.5px solid ${isAlcool ? '#F09595' : '#4A7B6F40'}`, color: isAlcool ? '#A32D2D' : '#3B6D11' }}>
          {isAlcool ? '🍷 TVA Alcool : 20%' : '🥤 TVA Sans alcool : 10%'}
        </div>

        {/* Informations générales */}
        <div style={{ background: c.blanc, borderRadius: '12px', padding: isMobile ? '16px' : '24px', border: `0.5px solid ${c.bordure}`, marginBottom: '12px' }}>
          <div style={{ fontSize: '13px', fontWeight: '500', color: c.texteMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '14px' }}>Informations générales</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <label style={{ fontSize: '12px', color: c.texteMuted, fontWeight: '500', display: 'block', marginBottom: '6px' }}>Nom *</label>
              <input type="text" value={nom} onChange={e => setNom(e.target.value)}
                placeholder="Ex : Mojito classique"
                style={{ width: '100%', padding: '12px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, fontSize: '14px', outline: 'none', color: c.texte, background: c.blanc }}
              />
            </div>

            {/* Catégorie + Lieu dynamiques bar */}
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
                {theme.saisons.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '12px', color: c.texteMuted, fontWeight: '500', display: 'block', marginBottom: '6px' }}>Nombre de portions *</label>
                <input type="number" value={nbPortions} onChange={e => setNbPortions(e.target.value)} placeholder="Ex : 1"
                  style={{ width: '100%', padding: '12px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, fontSize: '14px', outline: 'none', color: c.texte, background: c.blanc }}
                />
              </div>
              {!isSousFiche && (
                <div>
                  <label style={{ fontSize: '12px', color: c.texteMuted, fontWeight: '500', display: 'block', marginBottom: '6px' }}>Prix TTC (€)</label>
                  <input type="number" value={prixTTC} onChange={e => setPrixTTC(e.target.value)} placeholder="Ex : 12.00" step="0.01"
                    style={{ width: '100%', padding: '12px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, fontSize: '14px', outline: 'none', color: c.texte, background: c.blanc }}
                  />
                  {prixIndic && <div style={{ fontSize: '11px', color: '#3B6D11', marginTop: '4px' }}>Indicatif ({seuilVert}%) TVA {TVA_BAR()}% : <strong>{prixIndic} €</strong></div>}
                </div>
              )}
            </div>

            {!isSousFiche && (
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
            )}

            <div>
              <label style={{ fontSize: '12px', color: c.texteMuted, fontWeight: '500', display: 'block', marginBottom: '6px' }}>Description / Recette</label>
              <textarea value={description} onChange={e => setDescription(e.target.value)}
                placeholder="Méthode de préparation, présentation..." rows={3}
                style={{ width: '100%', padding: '12px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, fontSize: '14px', outline: 'none', resize: 'vertical', fontFamily: 'inherit', color: c.texte, background: c.blanc }}
              />
            </div>
          </div>
        </div>

        {/* Ingrédients */}
        <div style={{ background: c.blanc, borderRadius: '12px', padding: isMobile ? '16px' : '24px', border: `0.5px solid ${c.bordure}`, marginBottom: '12px' }}>
          <div style={{ fontSize: '13px', fontWeight: '500', color: c.texteMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '14px' }}>Ingrédients & Préparations</div>
          {isMobile ? (
            <>
              {ingredients.map((ing, index) => (
                <div key={index} style={{ background: c.fond, borderRadius: '8px', padding: '12px', marginBottom: '8px', border: `0.5px solid ${c.bordure}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span style={{ fontSize: '12px', color: c.texteMuted, fontWeight: '500' }}>Ingrédient {index + 1}</span>
                    <button onClick={() => supprimerIngredient(index)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#aaa', fontSize: '16px' }}>×</button>
                  </div>
                  <div style={{ marginBottom: '8px' }}>
                    <IngredientSearch ingredients={optionsRecherche} value={ing.ingredient_id} onChange={val => modifierIngredient(index, 'ingredient_id', val)} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <input type="number" value={ing.quantite} step="0.01" onChange={e => modifierIngredient(index, 'quantite', e.target.value)} placeholder="Quantité"
                      style={{ padding: '10px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, fontSize: '14px', outline: 'none', color: c.texte, background: c.blanc }}
                    />
                    <select value={ing.unite} onChange={e => modifierIngredient(index, 'unite', e.target.value)}
                      style={{ padding: '10px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, fontSize: '14px', background: c.blanc, outline: 'none', color: c.texte }}>
                      {['cl', 'ml', 'L', 'g', 'kg', 'u', 'trait', 'pièce'].map(u => <option key={u}>{u}</option>)}
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
                  <IngredientSearch ingredients={optionsRecherche} value={ing.ingredient_id} onChange={val => modifierIngredient(index, 'ingredient_id', val)} />
                  <input type="number" value={ing.quantite} step="0.01" onChange={e => modifierIngredient(index, 'quantite', e.target.value)} placeholder="0"
                    style={{ padding: '8px 10px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, fontSize: '13px', outline: 'none', color: c.texte, background: c.blanc, width: '100%', minWidth: 0 }}
                  />
                  <select value={ing.unite} onChange={e => modifierIngredient(index, 'unite', e.target.value)}
                    style={{ padding: '8px 10px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, fontSize: '13px', background: c.blanc, outline: 'none', color: c.texte, width: '100%', minWidth: 0 }}>
                    {['cl', 'ml', 'L', 'g', 'kg', 'u', 'trait', 'pièce'].map(u => <option key={u}>{u}</option>)}
                  </select>
                  <div style={{ padding: '8px 6px', borderRadius: '8px', background: c.fond, border: `0.5px solid ${c.bordure}`, display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 0 }}>
                    {(() => {
                      const sel = optionsRecherche.find(i => i.id === ing.ingredient_id)
                      const cout = sel?.prix_kg && ing.quantite ? (sel.prix_kg * parseFloat(ing.quantite)).toFixed(2) : null
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
            <div style={{ background: '#EAF3DE', borderRadius: '8px', padding: '12px' }}>
              <div style={{ fontSize: '10px', color: '#3B6D11', fontWeight: '500', textTransform: 'uppercase' }}>Prix indicatif TTC</div>
              <div style={{ fontSize: '20px', fontWeight: '500', marginTop: '4px', color: '#3B6D11' }}>{prixIndic} €</div>
              <div style={{ fontSize: '10px', color: '#3B6D11', opacity: 0.8, marginTop: '2px' }}>TVA {TVA_BAR()}% — seuil {seuilVert}%</div>
            </div>
          )}
          {fc && !isSousFiche && (
            <div style={{ background: fc < seuilVert ? '#EAF3DE' : fc < seuilOrange ? '#FAEEDA' : '#FCEBEB', borderRadius: '8px', padding: '12px' }}>
              <div style={{ fontSize: '10px', fontWeight: '500', textTransform: 'uppercase', color: fc < seuilVert ? '#3B6D11' : fc < seuilOrange ? '#854F0B' : '#A32D2D' }}>Bev cost</div>
              <div style={{ fontSize: '20px', fontWeight: '500', marginTop: '4px', color: fc < seuilVert ? '#3B6D11' : fc < seuilOrange ? '#854F0B' : '#A32D2D' }}>{fc} %</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
