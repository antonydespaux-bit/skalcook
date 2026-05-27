'use client'
import { useState, useEffect } from 'react'
import { supabase, getParametres, getClientId } from '../../../../lib/supabase'
import { useRouter, useParams } from 'next/navigation'
import { theme, Logo } from '../../../../lib/theme.jsx'
import { useIsMobile } from '../../../../lib/useIsMobile'
import { useTheme } from '../../../../lib/useTheme'
import { useAutosave } from '../../../../lib/useAutosave'
import { log } from '../../../../lib/useLog'
import { ALLERGENES } from '../../../../lib/allergenes'
import { SAISONS, getYearsRange, parseSaison } from '../../../../lib/saison'
import IngredientSearch from '../../../../components/IngredientSearch'
import FichePhoto from '../../../../components/FichePhoto'
import ChefLoader from '../../../../components/ChefLoader'
import BackButton from '../../../../components/BackButton'
import { Card, Alert } from '../../../../components/ui'

import { isIngredientPossible } from '../../../../lib/foodCost'
import { UNITES_PRODUCTION } from '../../../../lib/constants'

export default function ModifierFiche() {
  const [nom, setNom] = useState('')
  const [categoriePlat, setCategoriePlat] = useState('')
  const [lieuId, setLieuId] = useState('')
  const [nbPortions, setNbPortions] = useState('')
  const [unitePortions, setUnitePortions] = useState('portions')
  const [prixTTC, setPrixTTC] = useState('')
  const [perte, setPerte] = useState(0)
  const [description, setDescription] = useState('')
  const [instructions, setInstructions] = useState('')
  const [saison, setSaison] = useState('')
  const [annee, setAnnee] = useState(new Date().getFullYear())
  const [allergenes, setAllergenes] = useState([])
  const [ingredients, setIngredients] = useState([])
  const [listeIngredients, setListeIngredients] = useState([])
  const [lieux, setLieux] = useState([])
  const [categoriesDyn, setCategoriesDyn] = useState([])
  const [params, setParams] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [draftRestored, setDraftRestored] = useState(false)
  const [clientId, setClientId] = useState(null)
  const [photoPath, setPhotoPath] = useState(null)
  const [formatAffichage, setFormatAffichage] = useState('brasserie')
  const [clientFormatDefaut, setClientFormatDefaut] = useState('brasserie')
  // Mode étoilé : sections = [{tempId, nom, descriptif}]. Chaque ingrédient a
  // un `section_temp_id` (string) qui pointe vers une section ; NULL = ligne
  // libre (brasserie).
  const [sections, setSections] = useState([])
  const router = useRouter()
  const params_route = useParams()
  const { c, logoUrl, nomEtablissement } = useTheme()
  const isMobile = useIsMobile()

  const catSelectionnee = categoriesDyn.find(cat => cat.id === categoriePlat)
  const isSousFiche = catSelectionnee?.nom === 'Sous-fiches' || catSelectionnee?.nom === 'Sous-fiche'

  const autosaveData = { nom, categoriePlat, lieuId, nbPortions, prixTTC, perte, description, instructions, saison, annee, allergenes, ingredients }
  const annees = getYearsRange()
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
    const clientId = await getClientId()
    if (!clientId) { router.push('/'); return }
    setClientId(clientId)

    const [
      { data: ficheData },
      { data: lieuxData },
      { data: catsData },
      { data: liste },
      { data: sousFiches },
      { data: clientData },
      { data: sectionsData }
    ] = await Promise.all([
      supabase.from('fiches').select('*').eq('id', params_route.id).eq('client_id', clientId).single(),
      supabase.from('lieux').select('*').eq('client_id', clientId).eq('section', 'cuisine').order('ordre'),
      supabase.from('categories_plats').select('*').eq('client_id', clientId).eq('section', 'cuisine').order('ordre'),
      supabase.from('ingredients').select('*').eq('client_id', clientId).order('nom').limit(5000),
      supabase.from('fiches').select('id, nom, cout_portion').eq('client_id', clientId).eq('is_sub_fiche', true).eq('archive', false).order('nom'),
      supabase.from('clients').select('fiche_format_defaut').eq('id', clientId).single(),
      supabase.from('fiche_sections').select('*').eq('fiche_id', params_route.id).eq('client_id', clientId).order('ordre')
    ])

    if (!ficheData) { router.push('/fiches'); return }

    setLieux(lieuxData || [])
    setCategoriesDyn(catsData || [])

    const sousFichesFormatees = (sousFiches || []).map(sf => ({
      id: sf.id,
      nom: sf.nom,
      prix_kg: sf.cout_portion,
      unite: 'portion',
      est_sous_fiche: true
    }))
    setListeIngredients([...(liste || []), ...sousFichesFormatees])

    setPhotoPath(ficheData.photo_url || null)
    setNom(ficheData.nom)
    setCategoriePlat(ficheData.categorie_plat_id || '')
    setLieuId(ficheData.lieu_id || '')
    setNbPortions(ficheData.nb_portions != null ? String(ficheData.nb_portions) : '')
    setPrixTTC(ficheData.prix_ttc || '')
    if (ficheData.is_sub_fiche) {
      const { data: ingMiroir } = await supabase
        .from('ingredients')
        .select('unite')
        .eq('fiche_id', params_route.id)
        .eq('client_id', clientId)
        .single()
      if (ingMiroir?.unite) setUnitePortions(ingMiroir.unite)
    }
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

    const formatDefaut = clientData?.fiche_format_defaut === 'etoile' ? 'etoile' : 'brasserie'
    setClientFormatDefaut(formatDefaut)
    const formatActif = ficheData.format_affichage || formatDefaut
    setFormatAffichage(formatActif)

    // Sections : convertir DB rows en state local avec tempId stable.
    const sectionsLocales = (sectionsData || []).map(s => ({
      tempId: s.id,
      dbId: s.id,
      nom: s.nom || '',
      descriptif: s.descriptif || ''
    }))
    setSections(sectionsLocales)

    const { data: ingsData } = await supabase
      .from('fiche_ingredients')
      .select(`quantite, unite, section_id, ingredients (id, nom, prix_kg, unite)`)
      .eq('fiche_id', params_route.id)
      .eq('client_id', clientId)

    setIngredients((ingsData || []).map(i => ({
      ingredient_id: i.ingredients?.id || '',
      nom: i.ingredients?.nom || '',
      quantite: i.quantite,
      unite: i.unite,
      section_temp_id: i.section_id || null
    })))

    setLoading(false)
  }

  // ── Sections (mode étoilé) ───────────────────────────────────────────────
  const ajouterSection = () => {
    const tempId = `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    setSections([...sections, { tempId, nom: '', descriptif: '' }])
  }
  const modifierSection = (tempId, champ, valeur) => {
    setSections(sections.map(s => s.tempId === tempId ? { ...s, [champ]: valeur } : s))
  }
  const supprimerSection = (tempId) => {
    if (!confirm('Supprimer cette préparation et ses ingrédients ?')) return
    setSections(sections.filter(s => s.tempId !== tempId))
    setIngredients(ingredients.filter(i => i.section_temp_id !== tempId))
  }
  const monterSection = (idx) => {
    if (idx === 0) return
    const next = [...sections]
    ;[next[idx - 1], next[idx]] = [next[idx], next[idx - 1]]
    setSections(next)
  }
  const descendreSection = (idx) => {
    if (idx === sections.length - 1) return
    const next = [...sections]
    ;[next[idx], next[idx + 1]] = [next[idx + 1], next[idx]]
    setSections(next)
  }
  const ajouterIngredientSection = (sectionTempId) => {
    setIngredients([...ingredients, { ingredient_id: '', nom: '', quantite: '', unite: 'kg', section_temp_id: sectionTempId }])
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

  const foodCost = () => {
    const cout = calculerCoutAvecPerte()
    if (!prixTTC || !cout || !nbPortions) return null
    const tva = 1 + parseFloat(params['tva_restauration'] || 10) / 100
    return (cout / parseFloat(nbPortions) / (parseFloat(prixTTC) / tva) * 100).toFixed(1)
  }

  const prixIndicatif = () => {
    const cout = calculerCoutAvecPerte()
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

    const clientId = await getClientId()
    if (!clientId) { setError('Erreur : session expirée'); setSaving(false); return }

    const cout = calculerCoutAvecPerte()
    const coutPortion = nbPortions ? (cout / parseFloat(nbPortions)) : null

    // En mode étoilé, on alimente aussi `instructions` (concat des descriptifs)
    // pour qu'une bascule en vue brasserie reste lisible.
    let instructionsFinales = instructions
    if (formatAffichage === 'etoile') {
      instructionsFinales = sections
        .filter(s => (s.nom || '').trim() || (s.descriptif || '').trim())
        .map(s => {
          const titre = (s.nom || '').trim()
          const desc = (s.descriptif || '').trim()
          return titre ? `${titre} :\n${desc}` : desc
        })
        .join('\n\n')
    }

    const { error: updateError } = await supabase.from('fiches').update({
      nom,
      categorie: catSelectionnee?.nom || '',
      categorie_plat_id: categoriePlat || null,
      lieu_id: lieuId || null,
      nb_portions: nbPortions !== '' ? parseFloat(nbPortions) : null,
      unite_production: isSousFiche ? unitePortions : (nbPortions !== '' ? 'portions' : null),
      // Même logique que dans la création : la catégorie "Sous-fiche" pilote `is_sub_fiche`.
      is_sub_fiche: isSousFiche,
      prix_ttc: isSousFiche ? null : (prixTTC ? parseFloat(prixTTC) : null),
      description,
      instructions: instructionsFinales || null,
      format_affichage: formatAffichage,
      saison: saison || null, annee: annee || null, allergenes,
      cout_portion: coutPortion,
      perte: perte ? parseFloat(perte) : 0,
      updated_at: new Date().toISOString()
    }).eq('id', params_route.id).eq('client_id', clientId)
    if (updateError) { setError('Erreur sauvegarde : ' + updateError.message); setSaving(false); return }

    // Wipe + reinsert : ingredients d'abord (FK section_id ON DELETE SET NULL),
    // puis sections, puis on regénère le mapping.
    await supabase.from('fiche_ingredients').delete().eq('fiche_id', params_route.id).eq('client_id', clientId)
    await supabase.from('fiche_sections').delete().eq('fiche_id', params_route.id).eq('client_id', clientId)

    const tempIdToDbId = new Map()
    if (formatAffichage === 'etoile') {
      const sectionsAInserer = sections.filter(s =>
        (s.nom || '').trim() ||
        (s.descriptif || '').trim() ||
        ingredients.some(i => i.section_temp_id === s.tempId)
      )
      // Insert un par un pour récupérer l'id réel en gardant l'ordre.
      for (let i = 0; i < sectionsAInserer.length; i++) {
        const s = sectionsAInserer[i]
        const { data: inserted, error: errSection } = await supabase
          .from('fiche_sections')
          .insert({
            client_id: clientId,
            fiche_id: params_route.id,
            ordre: i,
            nom: (s.nom || '').trim() || `Préparation ${i + 1}`,
            descriptif: s.descriptif || null
          })
          .select('id')
          .single()
        if (errSection || !inserted) {
          setError('Erreur sauvegarde section : ' + (errSection?.message || 'inconnue'))
          setSaving(false)
          return
        }
        tempIdToDbId.set(s.tempId, inserted.id)
      }
    }

    const ingredientsAInserer = ingredients
      .filter(i => i.ingredient_id && i.quantite)
      .map(i => ({
        fiche_id: params_route.id,
        ingredient_id: i.ingredient_id,
        quantite: parseFloat(i.quantite),
        unite: i.unite,
        client_id: clientId,
        section_id: formatAffichage === 'etoile' ? (tempIdToDbId.get(i.section_temp_id) || null) : null
      }))

    if (ingredientsAInserer.length > 0) {
      await supabase.from('fiche_ingredients').insert(ingredientsAInserer)
    }

    if (isIngredientPossible(catSelectionnee?.nom || '') && coutPortion !== null) {
      const { data: ingExistant } = await supabase
        .from('ingredients').select('id').eq('fiche_id', params_route.id).eq('client_id', clientId).single()
      if (ingExistant) {
        await supabase.from('ingredients').update({ nom, prix_kg: parseFloat(coutPortion), unite: unitePortions }).eq('fiche_id', params_route.id).eq('client_id', clientId)
      } else {
        await supabase.from('ingredients').insert([{
          nom, prix_kg: parseFloat(coutPortion),
          unite: unitePortions, est_sous_fiche: true,
          fiche_id: params_route.id, client_id: clientId
        }])
      }
    }

    await log({
      action: 'MODIFICATION', entite: 'fiche', entite_id: params_route.id,
      entite_nom: nom, section: 'cuisine',
      details: `Catégorie: ${catSelectionnee?.nom || ''}, Saison: ${[saison, annee].filter(Boolean).join(' ')}${perte > 0 ? `, Perte: ${perte}%` : ''}`
    })

    setSaving(false)
    clearDraft()
    router.push(`/fiches/${params_route.id}`)
  }

  const fc = foodCost()
  const prixIndic = prixIndicatif()
  const seuilVert = parseFloat(params['seuil_vert_cuisine'] || 28)
  const seuilOrange = parseFloat(params['seuil_orange_cuisine'] || 35)
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
        background: c.principal, borderBottom: `0.5px solid ${c.accent}40`,
        padding: '0 16px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', height: '56px',
        position: 'sticky', top: 0, zIndex: 100
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Logo height={28} couleur="white" nom={nomEtablissement} logoUrl={logoUrl} onClick={() => router.push("/dashboard")} />
          <BackButton fallback={`/fiches/${params_route.id}`} />
          {!isMobile && <span style={{ fontSize: '14px', fontWeight: '500', color: 'white' }}>Modifier — {nom}</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {lastSaved && <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>{!isMobile && `Sauvegardé à ${lastSaved.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`}{isMobile && '✓'}</span>}
          <button onClick={handleSubmit} disabled={saving} style={{
            background: saving ? c.texteMuted : c.accent, color: 'white', border: 'none',
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

        {error && <Alert variant="error" style={{ marginBottom: '16px' }}>{error}</Alert>}

        {/* Toggle format d'affichage */}
        <div style={{ background: c.blanc, borderRadius: '12px', border: `0.5px solid ${c.bordure}`, padding: '12px 14px', marginBottom: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: '12px', fontWeight: '500', color: c.texteMuted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Format de la fiche</div>
            <div style={{ fontSize: '11px', color: c.texteMuted, marginTop: '2px' }}>
              Défaut établissement : <strong>{clientFormatDefaut === 'etoile' ? 'Étoilé' : 'Brasserie'}</strong>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '4px', background: c.fond, padding: '4px', borderRadius: '10px' }}>
            {[
              { value: 'brasserie', label: '🥖 Brasserie' },
              { value: 'etoile', label: '⭐ Étoilé' },
            ].map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  if (opt.value === 'etoile' && sections.length === 0) {
                    // Premier passage en étoilé : créer une section englobante
                    // avec les ingrédients existants + instructions actuelles.
                    const tempId = `tmp_${Date.now()}`
                    setSections([{ tempId, nom: 'Préparation', descriptif: instructions || '' }])
                    setIngredients(ingredients.map(i => ({ ...i, section_temp_id: i.section_temp_id || tempId })))
                  }
                  setFormatAffichage(opt.value)
                }}
                style={{
                  padding: '6px 14px', borderRadius: '7px', fontSize: '12px', border: 'none', cursor: 'pointer',
                  fontWeight: formatAffichage === opt.value ? '500' : '400',
                  background: formatAffichage === opt.value ? c.accent : 'transparent',
                  color: formatAffichage === opt.value ? 'white' : c.texteMuted,
                }}
              >{opt.label}</button>
            ))}
          </div>
        </div>

        {/* Informations générales */}
        <Card c={c} style={{ marginBottom: '12px' }}>
          <div className="sk-label-muted" style={{ fontSize: '13px', color: c.texteMuted, marginBottom: '14px' }}>Informations générales</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <label style={{ fontSize: '12px', color: c.texteMuted, fontWeight: '500', display: 'block', marginBottom: '6px' }}>Nom *</label>
              <input type="text" value={nom} onChange={e => setNom(e.target.value)}
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

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '12px', color: c.texteMuted, fontWeight: '500', display: 'block', marginBottom: '6px' }}>Saison</label>
                <select value={saison} onChange={e => setSaison(e.target.value)} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, fontSize: '14px', background: c.blanc, outline: 'none', color: c.texte }}>
                  <option value="">— Aucune —</option>
                  {SAISONS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: '12px', color: c.texteMuted, fontWeight: '500', display: 'block', marginBottom: '6px' }}>Année</label>
                <select value={annee || ''} onChange={e => setAnnee(e.target.value ? parseInt(e.target.value, 10) : null)} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, fontSize: '14px', background: c.blanc, outline: 'none', color: c.texte }}>
                  <option value="">— Aucune —</option>
                  {annees.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '12px', color: c.texteMuted, fontWeight: '500', display: 'block', marginBottom: '6px' }}>{isSousFiche ? 'Quantité produite' : 'Nombre de portions'}</label>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <input type="text" inputMode="decimal" value={nbPortions} onChange={e => setNbPortions(e.target.value.replace(',', '.'))}
                    style={{ flex: 1, padding: '12px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, fontSize: '14px', outline: 'none', color: c.texte, background: c.blanc }}
                  />
                  {isSousFiche && (
                    <select value={unitePortions} onChange={e => setUnitePortions(e.target.value)}
                      style={{ padding: '12px 8px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, fontSize: '13px', background: c.blanc, outline: 'none', color: c.texte }}>
                      {UNITES_PRODUCTION.map(u => <option key={u}>{u}</option>)}
                    </select>
                  )}
                </div>
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

            {!isSousFiche && (
              <div>
                <label style={{ fontSize: '12px', color: c.texteMuted, fontWeight: '500', display: 'block', marginBottom: '6px' }}>% de perte — parures, épluchage, désossage...</label>
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
              <label style={{ fontSize: '12px', color: c.texteMuted, fontWeight: '500', display: 'block', marginBottom: '6px' }}>Description courte</label>
              <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2}
                placeholder="Description affichée en haut de la fiche..."
                style={{ width: '100%', padding: '12px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, fontSize: '14px', outline: 'none', resize: 'vertical', fontFamily: 'inherit', color: c.texte, background: c.blanc }}
              />
            </div>
          </div>
        </Card>

        {/* Photo */}
        {clientId && (
          <div style={{ background: c.blanc, borderRadius: '12px', padding: '16px', border: `0.5px solid ${c.bordure}`, marginBottom: '12px' }}>
            <div className="sk-label-muted" style={{ fontSize: '13px', color: c.texteMuted, marginBottom: '12px' }}>Photo</div>
            <FichePhoto
              ficheId={params_route.id}
              clientId={clientId}
              photoPath={photoPath}
              peutModifier={true}
              onPhotoChange={setPhotoPath}
              c={c}
            />
          </div>
        )}

        {/* ── MODE ÉTOILÉ : Sections de préparation ── */}
        {formatAffichage === 'etoile' && (
          <Card c={c} style={{ marginBottom: '12px' }}>
            <div className="sk-label-muted" style={{ fontSize: '13px', color: c.texteMuted, marginBottom: '6px' }}>⭐ Préparations</div>
            <div style={{ fontSize: '12px', color: c.texteMuted, marginBottom: '14px' }}>
              Chaque préparation regroupe ses ingrédients et son descriptif. Le coût est calculé section par section.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {sections.map((section, sIdx) => {
                const ingsSection = ingredients
                  .map((ing, gIdx) => ({ ing, gIdx }))
                  .filter(({ ing }) => ing.section_temp_id === section.tempId)
                const coutSection = ingsSection.reduce((tot, { ing }) => {
                  const ingData = listeIngredients.find(i => i.id === ing.ingredient_id)
                  if (ingData?.prix_kg && ing.quantite) return tot + (ingData.prix_kg * parseFloat(ing.quantite))
                  return tot
                }, 0)
                return (
                  <div key={section.tempId} style={{ background: c.fond, borderRadius: '10px', padding: '14px', border: `0.5px solid ${c.bordure}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                      <input
                        type="text" value={section.nom}
                        onChange={e => modifierSection(section.tempId, 'nom', e.target.value)}
                        placeholder={`Préparation ${sIdx + 1} — ex : Garniture navet ail noir`}
                        style={{ flex: 1, padding: '10px 12px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, fontSize: '14px', fontWeight: '500', outline: 'none', color: c.texte, background: c.blanc }}
                      />
                      <button type="button" onClick={() => monterSection(sIdx)} disabled={sIdx === 0}
                        style={{ width: '32px', height: '36px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, background: c.blanc, cursor: sIdx === 0 ? 'not-allowed' : 'pointer', color: c.texteMuted, opacity: sIdx === 0 ? 0.3 : 1 }}>↑</button>
                      <button type="button" onClick={() => descendreSection(sIdx)} disabled={sIdx === sections.length - 1}
                        style={{ width: '32px', height: '36px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, background: c.blanc, cursor: sIdx === sections.length - 1 ? 'not-allowed' : 'pointer', color: c.texteMuted, opacity: sIdx === sections.length - 1 ? 0.3 : 1 }}>↓</button>
                      <button type="button" onClick={() => supprimerSection(section.tempId)}
                        style={{ width: '36px', height: '36px', borderRadius: '8px', border: '0.5px solid #FECACA', background: c.blanc, cursor: 'pointer', color: '#DC2626', fontSize: '16px' }}>🗑</button>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1fr) minmax(0, 1fr)', gap: '10px', alignItems: 'stretch' }}>
                      {/* Colonne gauche : ingrédients */}
                      <div style={{ background: c.blanc, borderRadius: '8px', padding: '10px', border: `0.5px solid ${c.bordure}` }}>
                        <div style={{ fontSize: '11px', color: c.texteMuted, fontWeight: '500', textTransform: 'uppercase', marginBottom: '8px' }}>Ingrédients</div>
                        {ingsSection.length === 0 && (
                          <div style={{ fontSize: '12px', color: c.texteMuted, fontStyle: 'italic', padding: '6px 0' }}>Aucun ingrédient — ajoutez-en un ci-dessous.</div>
                        )}
                        {ingsSection.map(({ ing, gIdx }) => (
                          <div key={gIdx} style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1.6fr) minmax(0, 70px) minmax(0, 80px) 32px', gap: '6px', marginBottom: '6px', alignItems: 'center' }}>
                            <IngredientSearch ingredients={listeIngredients} value={ing.ingredient_id} onChange={val => modifierIngredient(gIdx, 'ingredient_id', val)} />
                            <input type="number" value={ing.quantite} step="0.01" placeholder="Qté"
                              onChange={e => modifierIngredient(gIdx, 'quantite', e.target.value)}
                              style={{ padding: '8px 10px', borderRadius: '6px', border: `0.5px solid ${c.bordure}`, fontSize: '13px', outline: 'none', color: c.texte, background: c.blanc, minWidth: 0 }}
                            />
                            <select value={ing.unite} onChange={e => modifierIngredient(gIdx, 'unite', e.target.value)}
                              style={{ padding: '8px 6px', borderRadius: '6px', border: `0.5px solid ${c.bordure}`, fontSize: '13px', background: c.blanc, outline: 'none', color: c.texte, minWidth: 0 }}>
                              {['kg', 'g', 'L', 'cl', 'ml', 'u', 'botte', 'pièce', 'portions'].map(u => <option key={u}>{u}</option>)}
                            </select>
                            <button type="button" onClick={() => supprimerIngredient(gIdx)} style={{ background: 'transparent', border: `0.5px solid ${c.bordure}`, borderRadius: '6px', cursor: 'pointer', color: '#aaa', fontSize: '14px', height: '32px', width: '32px' }}>×</button>
                          </div>
                        ))}
                        <button type="button" onClick={() => ajouterIngredientSection(section.tempId)} style={{ background: c.vertClair, color: c.vert, border: `0.5px solid ${c.vert}40`, borderRadius: '6px', padding: '6px 10px', fontSize: '12px', cursor: 'pointer', marginTop: '4px' }}>
                          + Ingrédient
                        </button>
                        {coutSection > 0 && (
                          <div style={{ marginTop: '8px', paddingTop: '6px', borderTop: `0.5px solid ${c.bordure}`, fontSize: '11px', color: c.texteMuted, display: 'flex', justifyContent: 'space-between' }}>
                            <span>Coût section</span>
                            <strong style={{ color: c.texte }}>{coutSection.toFixed(2)} €</strong>
                          </div>
                        )}
                      </div>

                      {/* Colonne droite : descriptif */}
                      <div style={{ background: c.blanc, borderRadius: '8px', padding: '10px', border: `0.5px solid ${c.bordure}`, display: 'flex', flexDirection: 'column' }}>
                        <div style={{ fontSize: '11px', color: c.texteMuted, fontWeight: '500', textTransform: 'uppercase', marginBottom: '8px' }}>Descriptif / méthode</div>
                        <textarea
                          value={section.descriptif}
                          onChange={e => modifierSection(section.tempId, 'descriptif', e.target.value)}
                          placeholder="Méthode de préparation de cette section…"
                          rows={isMobile ? 4 : 6}
                          style={{ flex: 1, padding: '10px', borderRadius: '6px', border: `0.5px solid ${c.bordure}`, fontSize: '13px', outline: 'none', resize: 'vertical', fontFamily: 'inherit', color: c.texte, background: c.blanc, lineHeight: '1.6', minHeight: '90px' }}
                        />
                      </div>
                    </div>
                  </div>
                )
              })}
              {sections.length === 0 && (
                <div style={{ background: c.fond, borderRadius: '10px', padding: '20px', textAlign: 'center', fontSize: '13px', color: c.texteMuted, border: `0.5px dashed ${c.bordure}` }}>
                  Aucune préparation pour l'instant. Cliquez sur « Ajouter une préparation » pour démarrer.
                </div>
              )}
              <button type="button" onClick={ajouterSection} style={{ background: c.accentClair, color: c.accent, border: `0.5px solid ${c.accent}40`, borderRadius: '8px', padding: '10px 16px', fontSize: '13px', cursor: 'pointer', fontWeight: '500' }}>
                + Ajouter une préparation
              </button>
            </div>
          </Card>
        )}

        {/* Ingrédients + Instructions (mode brasserie) */}
        {formatAffichage === 'brasserie' && (<>
        <Card c={c} style={{ marginBottom: '12px' }}>
          <div className="sk-label-muted" style={{ fontSize: '13px', color: c.texteMuted, marginBottom: '14px' }}>Ingrédients</div>
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
        </Card>

        {/* Instructions */}
        <Card c={c} style={{ marginBottom: '12px' }}>
          <div className="sk-label-muted" style={{ fontSize: '13px', color: c.texteMuted, marginBottom: '6px' }}>📋 Instructions de préparation</div>
          <div style={{ fontSize: '12px', color: c.texteMuted, marginBottom: '12px' }}>Les sauts de ligne seront respectés à l'écran et à l'impression.</div>
          <textarea value={instructions} onChange={e => setInstructions(e.target.value)} rows={8}
            placeholder={`1. Préparer la marinade...\n2. Saisir la viande à feu vif...\n\nDressage :\n- Disposer les légumes...`}
            style={{ width: '100%', padding: '12px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, fontSize: '14px', outline: 'none', resize: 'vertical', fontFamily: 'inherit', color: c.texte, background: c.blanc, lineHeight: '1.7', minHeight: '180px' }}
          />
          {instructions && (
            <div style={{ marginTop: '8px', fontSize: '12px', color: c.texteMuted }}>
              {instructions.split('\n').length} ligne{instructions.split('\n').length > 1 ? 's' : ''} — {instructions.length} caractères
            </div>
          )}
        </Card>
        </>)}

        {/* Allergènes */}
        <Card c={c} style={{ marginBottom: '12px' }}>
          <div className="sk-label-muted" style={{ fontSize: '13px', color: c.texteMuted, marginBottom: '14px' }}>Allergènes</div>
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
            <Alert variant="error" style={{ marginTop: '12px', fontSize: '12px' }}>
              {allergenes.length} allergène{allergenes.length > 1 ? 's' : ''} : {allergenes.map(id => ALLERGENES.find(a => a.id === id)?.label).join(', ')}
            </Alert>
          )}
        </Card>

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
