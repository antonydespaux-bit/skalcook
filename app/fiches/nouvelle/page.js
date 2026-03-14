'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../../../lib/supabase'
import { useRouter } from 'next/navigation'

export default function NouvelleFiche() {
  const [nom, setNom] = useState('')
  const [categorie, setCategorie] = useState('Plat')
  const [nbPortions, setNbPortions] = useState('')
  const [unitePortions, setUnitePortions] = useState('portions')
  const [prixTTC, setPrixTTC] = useState('')
  const [description, setDescription] = useState('')
  const [ingredients, setIngredients] = useState([
    { ingredient_id: '', nom: '', quantite: '', unite: 'kg' }
  ])
  const [listeIngredients, setListeIngredients] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

  const isSousFiche = categorie === 'Sous-fiche'

  useEffect(() => {
    checkUser()
    loadIngredients()
  }, [])

  const checkUser = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) router.push('/')
  }

  const loadIngredients = async () => {
    const { data } = await supabase
      .from('ingredients')
      .select('*')
      .order('nom')
    setListeIngredients(data || [])
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

  const calculerCoutPortion = () => {
    const cout = calculerCout()
    if (!cout || !nbPortions) return null
    return (cout / parseFloat(nbPortions)).toFixed(4)
  }

  const foodCost = () => {
    const cout = calculerCout()
    if (!prixTTC || !cout) return null
    const prixHT = parseFloat(prixTTC) / 1.10
    return (cout / prixHT * 100).toFixed(1)
  }

  const handleSubmit = async () => {
    if (!nom) { setError('Le nom de la fiche est obligatoire'); return }
    if (!nbPortions) { setError('Le nombre de portions est obligatoire'); return }
    setLoading(true)
    setError('')

    const coutTotal = calculerCout()
    const coutPortion = calculerCoutPortion()

    const { data: fiche, error: errFiche } = await supabase
      .from('fiches')
      .insert([{
        nom,
        categorie,
        nb_portions: parseInt(nbPortions),
        prix_ttc: isSousFiche ? null : (prixTTC ? parseFloat(prixTTC) : null),
        description,
        cout_portion: coutPortion ? parseFloat(coutPortion) : null
      }])
      .select()
      .single()

    if (errFiche) {
      setError('Erreur : ' + errFiche.message)
      setLoading(false)
      return
    }

    const ingredientsAInserer = ingredients
      .filter(i => i.ingredient_id && i.quantite)
      .map(i => ({
        fiche_id: fiche.id,
        ingredient_id: i.ingredient_id,
        quantite: parseFloat(i.quantite),
        unite: i.unite
      }))

    if (ingredientsAInserer.length > 0) {
      await supabase.from('fiche_ingredients').insert(ingredientsAInserer)
    }

    // Si c'est une sous-fiche, on l'ajoute automatiquement dans les ingrédients
    if (isSousFiche && coutPortion) {
      await supabase.from('ingredients').insert([{
        nom: fiche.nom,
        prix_kg: parseFloat(coutPortion),
        unite: unitePortions,
        est_sous_fiche: true,
        fiche_id: fiche.id
      }])
    }

    router.push(isSousFiche ? '/sous-fiches' : '/fiches')
  }

  const fc = foodCost()
  const coutPortion = calculerCoutPortion()

  return (
    <div style={{ minHeight: '100vh', background: '#f5f5f0' }}>

      <div style={{
        background: 'white', borderBottom: '0.5px solid #e0e0d8',
        padding: '0 24px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', height: '56px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            onClick={() => router.push(isSousFiche ? '/sous-fiches' : '/fiches')}
            style={{
              background: 'transparent', border: '0.5px solid #ddd',
              borderRadius: '8px', padding: '6px 12px',
              fontSize: '13px', cursor: 'pointer', color: '#666'
            }}
          >
            ← Retour
          </button>
          <span style={{ fontSize: '15px', fontWeight: '500' }}>
            {isSousFiche ? 'Nouvelle sous-fiche' : 'Nouvelle fiche technique'}
          </span>
        </div>
        <button
          onClick={handleSubmit}
          disabled={loading}
          style={{
            background: loading ? '#aaa' : (isSousFiche ? '#7F77DD' : '#1D9E75'),
            color: 'white', border: 'none', borderRadius: '8px',
            padding: '8px 20px', fontSize: '13px', fontWeight: '500',
            cursor: loading ? 'not-allowed' : 'pointer'
          }}
        >
          {loading ? 'Enregistrement...' : 'Enregistrer'}
        </button>
      </div>

      <div style={{ padding: '24px', maxWidth: '800px', margin: '0 auto' }}>

        {error && (
          <div style={{
            background: '#FCEBEB', color: '#A32D2D', borderRadius: '8px',
            padding: '12px 16px', fontSize: '13px', marginBottom: '20px'
          }}>
            {error}
          </div>
        )}

        {/* Informations générales */}
        <div style={{
          background: 'white', borderRadius: '12px', padding: '24px',
          border: `0.5px solid ${isSousFiche ? '#AFA9EC' : '#e0e0d8'}`,
          marginBottom: '16px'
        }}>
          {isSousFiche && (
            <div style={{
              background: '#EEEDFE', color: '#3C3489', borderRadius: '8px',
              padding: '10px 14px', fontSize: '13px', marginBottom: '16px',
              display: 'flex', alignItems: 'center', gap: '8px'
            }}>
              <span style={{
                background: '#7F77DD', color: 'white', borderRadius: '6px',
                padding: '2px 8px', fontSize: '11px', fontWeight: '500'
              }}>SF</span>
              Cette fiche sera disponible comme ingrédient dans les fiches principales
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ fontSize: '12px', color: '#666', fontWeight: '500', display: 'block', marginBottom: '6px' }}>
                Nom *
              </label>
              <input
                type="text" value={nom} onChange={e => setNom(e.target.value)}
                placeholder={isSousFiche ? 'Ex : Sauce béarnaise' : 'Ex : Blanquette de veau'}
                style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '0.5px solid #ddd', fontSize: '14px', outline: 'none' }}
              />
            </div>

            <div>
              <label style={{ fontSize: '12px', color: '#666', fontWeight: '500', display: 'block', marginBottom: '6px' }}>
                Catégorie
              </label>
              <select
                value={categorie} onChange={e => setCategorie(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '0.5px solid #ddd', fontSize: '14px', background: 'white', outline: 'none' }}
              >
                {['Entrée', 'Plat', 'Dessert', 'Sauce', 'Garniture', 'Sous-fiche'].map(c => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ fontSize: '12px', color: '#666', fontWeight: '500', display: 'block', marginBottom: '6px' }}>
                {isSousFiche ? 'Quantité produite *' : 'Nombre de portions *'}
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="number" value={nbPortions} onChange={e => setNbPortions(e.target.value)}
                  placeholder="Ex : 10"
                  style={{ flex: 1, padding: '10px 12px', borderRadius: '8px', border: '0.5px solid #ddd', fontSize: '14px', outline: 'none' }}
                />
                {isSousFiche && (
                  <select
                    value={unitePortions} onChange={e => setUnitePortions(e.target.value)}
                    style={{ padding: '10px 12px', borderRadius: '8px', border: '0.5px solid #ddd', fontSize: '14px', background: 'white', outline: 'none' }}
                  >
                    {['portions', 'kg', 'L', 'cl', 'ml', 'u'].map(u => (
                      <option key={u}>{u}</option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            {!isSousFiche && (
              <div>
                <label style={{ fontSize: '12px', color: '#666', fontWeight: '500', display: 'block', marginBottom: '6px' }}>
                  Prix de vente TTC (€)
                </label>
                <input
                  type="number" value={prixTTC} onChange={e => setPrixTTC(e.target.value)}
                  placeholder="Ex : 18.50" step="0.01"
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '0.5px solid #ddd', fontSize: '14px', outline: 'none' }}
                />
              </div>
            )}

            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ fontSize: '12px', color: '#666', fontWeight: '500', display: 'block', marginBottom: '6px' }}>
                Description / Présentation
              </label>
              <textarea
                value={description} onChange={e => setDescription(e.target.value)}
                placeholder="Notes de présentation, dressage..." rows={3}
                style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '0.5px solid #ddd', fontSize: '14px', outline: 'none', resize: 'vertical', fontFamily: 'inherit' }}
              />
            </div>
          </div>
        </div>

        {/* Ingrédients */}
        <div style={{
          background: 'white', borderRadius: '12px', padding: '24px',
          border: '0.5px solid #e0e0d8', marginBottom: '16px'
        }}>
          <div style={{ fontSize: '13px', fontWeight: '500', color: '#888', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '16px' }}>
            Ingrédients
          </div>

          {listeIngredients.length === 0 && (
            <div style={{
              background: '#FAEEDA', color: '#633806', borderRadius: '8px',
              padding: '12px 16px', fontSize: '13px', marginBottom: '16px'
            }}>
              Aucun ingrédient disponible.
              <span onClick={() => router.push('/ingredients')} style={{ textDecoration: 'underline', cursor: 'pointer', marginLeft: '4px' }}>
                Créez-en d'abord ici.
              </span>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: '8px', marginBottom: '8px' }}>
            {['Ingrédient', 'Quantité', 'Unité', ''].map((h, i) => (
              <div key={i} style={{ fontSize: '11px', color: '#888', fontWeight: '500', textTransform: 'uppercase' }}>{h}</div>
            ))}
          </div>

          {ingredients.map((ing, index) => {
            const ingData = listeIngredients.find(i => i.id === ing.ingredient_id)
            return (
              <div key={index} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: '8px', marginBottom: '8px' }}>
                <div style={{ position: 'relative' }}>
                  <select
                    value={ing.ingredient_id}
                    onChange={e => modifierIngredient(index, 'ingredient_id', e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: `0.5px solid ${ingData?.est_sous_fiche ? '#AFA9EC' : '#ddd'}`, fontSize: '13px', background: ingData?.est_sous_fiche ? '#EEEDFE' : 'white', outline: 'none' }}
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
                </div>
                <input
                  type="number" value={ing.quantite} step="0.01"
                  onChange={e => modifierIngredient(index, 'quantite', e.target.value)}
                  placeholder="0"
                  style={{ padding: '8px 10px', borderRadius: '8px', border: '0.5px solid #ddd', fontSize: '13px', outline: 'none' }}
                />
                <select
                  value={ing.unite}
                  onChange={e => modifierIngredient(index, 'unite', e.target.value)}
                  style={{ padding: '8px 10px', borderRadius: '8px', border: '0.5px solid #ddd', fontSize: '13px', background: 'white', outline: 'none' }}
                >
                  {['kg', 'g', 'L', 'cl', 'ml', 'u', 'botte', 'pièce', 'portions'].map(u => (
                    <option key={u}>{u}</option>
                  ))}
                </select>
                <button
                  onClick={() => supprimerIngredient(index)}
                  style={{ background: 'transparent', border: '0.5px solid #ddd', borderRadius: '8px', width: '36px', height: '36px', cursor: 'pointer', color: '#aaa', fontSize: '16px' }}
                >×</button>
              </div>
            )
          })}

          <button
            onClick={ajouterIngredient}
            style={{ background: '#E1F5EE', color: '#085041', border: '0.5px solid #9FE1CB', borderRadius: '8px', padding: '8px 16px', fontSize: '13px', cursor: 'pointer', marginTop: '8px' }}
          >
            + Ajouter un ingrédient
          </button>
        </div>

        {/* Récapitulatif */}
        <div style={{
          background: 'white', borderRadius: '12px', padding: '20px',
          border: '0.5px solid #e0e0d8', display: 'flex', gap: '24px', flexWrap: 'wrap'
        }}>
          <div>
            <div style={{ fontSize: '11px', color: '#888', fontWeight: '500', textTransform: 'uppercase' }}>Coût total</div>
            <div style={{ fontSize: '22px', fontWeight: '500', marginTop: '4px' }}>{calculerCout().toFixed(2)} €</div>
          </div>
          {isSousFiche && coutPortion && (
            <div style={{ background: '#EEEDFE', borderRadius: '8px', padding: '14px' }}>
              <div style={{ fontSize: '11px', color: '#3C3489', fontWeight: '500', textTransform: 'uppercase' }}>
                Coût / {unitePortions}
              </div>
              <div style={{ fontSize: '22px', fontWeight: '500', marginTop: '4px', color: '#3C3489' }}>
                {parseFloat(coutPortion).toFixed(4)} €
              </div>
            </div>
          )}
          {!isSousFiche && fc && (
            <div>
              <div style={{ fontSize: '11px', color: '#888', fontWeight: '500', textTransform: 'uppercase' }}>Food cost</div>
              <div style={{
                fontSize: '22px', fontWeight: '500', marginTop: '4px',
                color: fc < 30 ? '#3B6D11' : fc < 40 ? '#854F0B' : '#A32D2D'
              }}>{fc} %</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}