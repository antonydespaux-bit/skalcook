'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../../../../lib/supabase'
import { useRouter, useParams } from 'next/navigation'
import { theme, Logo } from '../../../../lib/theme.jsx'

export default function ModifierFiche() {
  const [nom, setNom] = useState('')
  const [categorie, setCategorie] = useState('Plats')
  const [nbPortions, setNbPortions] = useState('')
  const [prixTTC, setPrixTTC] = useState('')
  const [description, setDescription] = useState('')
  const [saison, setSaison] = useState('Printemps 2026')
  const [ingredients, setIngredients] = useState([])
  const [listeIngredients, setListeIngredients] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()
  const params = useParams()
  const c = theme.couleurs
  const categories = [...theme.categories, 'Sous-fiche']

  useEffect(() => {
    checkUser()
    loadData()
  }, [])

  const checkUser = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) router.push('/')
  }

  const loadData = async () => {
    const { data: ficheData } = await supabase
      .from('fiches')
      .select('*')
      .eq('id', params.id)
      .single()

    if (!ficheData) { router.push('/fiches'); return }

    setNom(ficheData.nom)
    setCategorie(ficheData.categorie || 'Plats')
    setNbPortions(ficheData.nb_portions || '')
    setPrixTTC(ficheData.prix_ttc || '')
    setDescription(ficheData.description || '')
    setSaison(ficheData.saison || 'Printemps 2026')

    const { data: ingsData } = await supabase
      .from('fiche_ingredients')
      .select(`quantite, unite, ingredients (id, nom, prix_kg, unite)`)
      .eq('fiche_id', params.id)

    setIngredients((ingsData || []).map(i => ({
      ingredient_id: i.ingredients?.id || '',
      nom: i.ingredients?.nom || '',
      quantite: i.quantite,
      unite: i.unite
    })))

    const { data: liste } = await supabase
      .from('ingredients')
      .select('*')
      .order('nom')
    setListeIngredients(liste || [])
    setLoading(false)
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
      if (ing) {
        nouveaux[index].nom = ing.nom
        nouveaux[index].unite = ing.unite || 'kg'
      }
    }
    setIngredients(nouveaux)
  }

  const calculerCout = () => {
    return ingredients.reduce((total, ing) => {
      const ingData = listeIngredients.find(i => i.id === ing.ingredient_id)
      if (ingData?.prix_kg && ing.quantite) {
        return total + (ingData.prix_kg * parseFloat(ing.quantite))
      }
      return total
    }, 0)
  }

  const foodCost = () => {
    const cout = calculerCout()
    if (!prixTTC || !cout || !nbPortions) return null
    const coutParPortion = cout / parseFloat(nbPortions)
    const prixHT = parseFloat(prixTTC) / 1.10
    return (coutParPortion / prixHT * 100).toFixed(1)
  }

  const handleSubmit = async () => {
    if (!nom) { setError('Le nom est obligatoire'); return }
    setSaving(true)
    setError('')

    const cout = calculerCout()
    const coutPortion = nbPortions ? (cout / parseFloat(nbPortions)) : null

    await supabase
      .from('fiches')
      .update({
        nom,
        categorie,
        nb_portions: nbPortions ? parseInt(nbPortions) : null,
        prix_ttc: prixTTC ? parseFloat(prixTTC) : null,
        description,
        saison,
        cout_portion: coutPortion,
        updated_at: new Date().toISOString()
      })
      .eq('id', params.id)

    await supabase
      .from('fiche_ingredients')
      .delete()
      .eq('fiche_id', params.id)

    const ingredientsAInserer = ingredients
      .filter(i => i.ingredient_id && i.quantite)
      .map(i => ({
        fiche_id: params.id,
        ingredient_id: i.ingredient_id,
        quantite: parseFloat(i.quantite),
        unite: i.unite
      }))

    if (ingredientsAInserer.length > 0) {
      await supabase.from('fiche_ingredients').insert(ingredientsAInserer)
    }

    router.push(`/fiches/${params.id}`)
  }

  const fc = foodCost()

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: c.fond }}>
      <div style={{ fontSize: '14px', color: c.texteMuted }}>Chargement...</div>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: c.fond }}>

      <div style={{
        background: c.principal, borderBottom: `0.5px solid ${c.accent}40`,
        padding: '0 24px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', height: '56px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            onClick={() => router.push(`/fiches/${params.id}`)}
            style={{
              background: 'transparent', border: '0.5px solid rgba(255,255,255,0.2)',
              borderRadius: '8px', padding: '6px 12px',
              fontSize: '13px', cursor: 'pointer', color: 'rgba(255,255,255,0.7)'
            }}
          >← Retour</button>
          <span style={{ fontSize: '15px', fontWeight: '500', color: 'white' }}>Modifier — {nom}</span>
        </div>
        <button
          onClick={handleSubmit}
          disabled={saving}
          style={{
            background: saving ? c.texteMuted : c.accent,
            color: c.principal, border: 'none', borderRadius: '8px',
            padding: '8px 20px', fontSize: '13px', fontWeight: '600',
            cursor: saving ? 'not-allowed' : 'pointer'
          }}
        >
          {saving ? 'Enregistrement...' : 'Enregistrer les modifications'}
        </button>
      </div>

      <div style={{ padding: '24px', maxWidth: '800px', margin: '0 auto' }}>

        {error && (
          <div style={{
            background: '#FCEBEB', color: '#A32D2D', borderRadius: '8px',
            padding: '12px 16px', fontSize: '13px', marginBottom: '20px'
          }}>{error}</div>
        )}

        <div style={{
          background: 'white', borderRadius: '12px', padding: '24px',
          border: `0.5px solid ${c.bordure}`, marginBottom: '16px'
        }}>
          <div style={{ fontSize: '13px', fontWeight: '500', color: c.texteMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '16px' }}>
            Informations générales
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>

            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ fontSize: '12px', color: c.texteMuted, fontWeight: '500', display: 'block', marginBottom: '6px' }}>Nom *</label>
              <input
                type="text" value={nom} onChange={e => setNom(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, fontSize: '14px', outline: 'none', color: c.texte }}
              />
            </div>

            <div>
              <label style={{ fontSize: '12px', color: c.texteMuted, fontWeight: '500', display: 'block', marginBottom: '6px' }}>Catégorie</label>
              <select value={categorie} onChange={e => setCategorie(e.target.value)} style={{
                width: '100%', padding: '10px 12px', borderRadius: '8px',
                border: `0.5px solid ${c.bordure}`, fontSize: '14px',
                background: 'white', outline: 'none', color: c.texte
              }}>
                {categories.map(cat => <option key={cat}>{cat}</option>)}
              </select>
            </div>

            <div>
              <label style={{ fontSize: '12px', color: c.texteMuted, fontWeight: '500', display: 'block', marginBottom: '6px' }}>Saison</label>
              <select value={saison} onChange={e => setSaison(e.target.value)} style={{
                width: '100%', padding: '10px 12px', borderRadius: '8px',
                border: `0.5px solid ${c.bordure}`, fontSize: '14px',
                background: 'white', outline: 'none', color: c.texte
              }}>
                {theme.saisons.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>

            <div>
              <label style={{ fontSize: '12px', color: c.texteMuted, fontWeight: '500', display: 'block', marginBottom: '6px' }}>Nombre de portions</label>
              <input
                type="number" value={nbPortions} onChange={e => setNbPortions(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, fontSize: '14px', outline: 'none', color: c.texte }}
              />
            </div>

            <div>
              <label style={{ fontSize: '12px', color: c.texteMuted, fontWeight: '500', display: 'block', marginBottom: '6px' }}>Prix de vente TTC (€)</label>
              <input
                type="number" value={prixTTC} onChange={e => setPrixTTC(e.target.value)} step="0.01"
                style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, fontSize: '14px', outline: 'none', color: c.texte }}
              />
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ fontSize: '12px', color: c.texteMuted, fontWeight: '500', display: 'block', marginBottom: '6px' }}>Description</label>
              <textarea
                value={description} onChange={e => setDescription(e.target.value)} rows={3}
                style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, fontSize: '14px', outline: 'none', resize: 'vertical', fontFamily: 'inherit', color: c.texte }}
              />
            </div>
          </div>
        </div>

        <div style={{
          background: 'white', borderRadius: '12px', padding: '24px',
          border: `0.5px solid ${c.bordure}`, marginBottom: '16px'
        }}>
          <div style={{ fontSize: '13px', fontWeight: '500', color: c.texteMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '16px' }}>
            Ingrédients
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr) auto', gap: '8px', marginBottom: '8px' }}>
            {['Ingrédient', 'Quantité', 'Unité', ''].map((h, i) => (
              <div key={i} style={{ fontSize: '11px', color: c.texteMuted, fontWeight: '500', textTransform: 'uppercase' }}>{h}</div>
            ))}
          </div>

          {ingredients.map((ing, index) => {
            const ingData = listeIngredients.find(i => i.id === ing.ingredient_id)
            return (
              <div key={index} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr) auto', gap: '8px', marginBottom: '8px' }}>
                <select
                  value={ing.ingredient_id}
                  onChange={e => modifierIngredient(index, 'ingredient_id', e.target.value)}
                  style={{
                    padding: '8px 10px', borderRadius: '8px',
                    border: `0.5px solid ${ingData?.est_sous_fiche ? '#AFA9EC' : c.bordure}`,
                    fontSize: '13px',
                    background: ingData?.est_sous_fiche ? '#EEEDFE' : 'white',
                    outline: 'none', color: c.texte, width: '100%', minWidth: 0
                  }}
                >
                  <option value="">-- Choisir --</option>
                  {listeIngredients.filter(i => !i.est_sous_fiche).map(i => (
                    <option key={i.id} value={i.id}>{i.nom}</option>
                  ))}
                  {listeIngredients.some(i => i.est_sous_fiche) && (
                    <>
                      <option disabled>── Sous-fiches ──</option>
                      {listeIngredients.filter(i => i.est_sous_fiche).map(i => (
                        <option key={i.id} value={i.id}>[SF] {i.nom}</option>
                      ))}
                    </>
                  )}
                </select>
                <input
                  type="number" value={ing.quantite} step="0.01"
                  onChange={e => modifierIngredient(index, 'quantite', e.target.value)}
                  style={{ padding: '8px 10px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, fontSize: '13px', outline: 'none', color: c.texte, width: '100%', minWidth: 0 }}
                />
                <select
                  value={ing.unite}
                  onChange={e => modifierIngredient(index, 'unite', e.target.value)}
                  style={{ padding: '8px 10px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, fontSize: '13px', background: 'white', outline: 'none', color: c.texte, width: '100%', minWidth: 0 }}
                >
                  {['kg', 'g', 'L', 'cl', 'ml', 'u', 'botte', 'pièce', 'portions'].map(u => (
                    <option key={u}>{u}</option>
                  ))}
                </select>
                <button
                  onClick={() => supprimerIngredient(index)}
                  style={{ background: 'transparent', border: `0.5px solid ${c.bordure}`, borderRadius: '8px', width: '36px', height: '36px', cursor: 'pointer', color: '#aaa', fontSize: '16px', flexShrink: 0 }}
                >×</button>
              </div>
            )
          })}

          <button
            onClick={ajouterIngredient}
            style={{
              background: c.vertClair, color: c.vert,
              border: `0.5px solid ${c.vert}40`, borderRadius: '8px',
              padding: '8px 16px', fontSize: '13px', cursor: 'pointer', marginTop: '8px'
            }}
          >+ Ajouter un ingrédient</button>
        </div>

        {fc && (
          <div style={{
            background: 'white', borderRadius: '12px', padding: '20px',
            border: `0.5px solid ${c.bordure}`, display: 'flex', gap: '24px'
          }}>
            <div>
              <div style={{ fontSize: '11px', color: c.texteMuted, fontWeight: '500', textTransform: 'uppercase' }}>Coût total</div>
              <div style={{ fontSize: '22px', fontWeight: '500', marginTop: '4px', color: c.texte }}>{calculerCout().toFixed(2)} €</div>
            </div>
            <div>
              <div style={{ fontSize: '11px', color: c.texteMuted, fontWeight: '500', textTransform: 'uppercase' }}>Food cost</div>
              <div style={{
                fontSize: '22px', fontWeight: '500', marginTop: '4px',
                color: fc < 30 ? '#3B6D11' : fc < 40 ? '#854F0B' : '#A32D2D'
              }}>{fc} %</div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}