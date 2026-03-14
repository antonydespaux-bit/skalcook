'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useRouter } from 'next/navigation'

export default function IngredientsPage() {
  const [ingredients, setIngredients] = useState([])
  const [loading, setLoading] = useState(true)
  const [recherche, setRecherche] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [nom, setNom] = useState('')
  const [prixKg, setPrixKg] = useState('')
  const [unite, setUnite] = useState('kg')
  const [saving, setSaving] = useState(false)
  const router = useRouter()

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
    setIngredients(data || [])
    setLoading(false)
  }

  const resetForm = () => {
    setNom('')
    setPrixKg('')
    setUnite('kg')
    setEditingId(null)
    setShowForm(false)
  }

  const handleEdit = (ing) => {
    setNom(ing.nom)
    setPrixKg(ing.prix_kg || '')
    setUnite(ing.unite || 'kg')
    setEditingId(ing.id)
    setShowForm(true)
  }

  const handleSubmit = async () => {
    if (!nom) return
    setSaving(true)

    if (editingId) {
      await supabase
        .from('ingredients')
        .update({ nom, prix_kg: prixKg ? parseFloat(prixKg) : null, unite })
        .eq('id', editingId)
    } else {
      await supabase
        .from('ingredients')
        .insert([{ nom, prix_kg: prixKg ? parseFloat(prixKg) : null, unite }])
    }

    await loadIngredients()
    resetForm()
    setSaving(false)
  }

  const handleDelete = async (id) => {
    if (!confirm('Supprimer cet ingrédient ?')) return
    await supabase.from('ingredients').delete().eq('id', id)
    await loadIngredients()
  }

  const ingredientsFiltres = ingredients.filter(i =>
    i.nom.toLowerCase().includes(recherche.toLowerCase())
  )

  return (
    <div style={{ minHeight: '100vh', background: '#f5f5f0' }}>

      {/* Barre du haut */}
      <div style={{
        background: 'white',
        borderBottom: '0.5px solid #e0e0d8',
        padding: '0 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: '56px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            onClick={() => router.push('/fiches')}
            style={{
              background: 'transparent', border: '0.5px solid #ddd',
              borderRadius: '8px', padding: '6px 12px',
              fontSize: '13px', cursor: 'pointer', color: '#666'
            }}
          >
            ← Retour
          </button>
          <span style={{ fontSize: '15px', fontWeight: '500' }}>Gestion des ingrédients</span>
        </div>
        <button
          onClick={() => { resetForm(); setShowForm(true) }}
          style={{
            background: '#1D9E75', color: 'white', border: 'none',
            borderRadius: '8px', padding: '8px 16px',
            fontSize: '13px', fontWeight: '500', cursor: 'pointer'
          }}
        >
          + Nouvel ingrédient
        </button>
      </div>

      <div style={{ padding: '24px', maxWidth: '800px', margin: '0 auto' }}>

        {/* Formulaire ajout/modification */}
        {showForm && (
          <div style={{
            background: 'white', borderRadius: '12px', padding: '24px',
            border: '0.5px solid #1D9E75', marginBottom: '20px'
          }}>
            <div style={{ fontSize: '13px', fontWeight: '500', marginBottom: '16px' }}>
              {editingId ? 'Modifier l\'ingrédient' : 'Nouvel ingrédient'}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '12px', marginBottom: '16px' }}>
              <div>
                <label style={{ fontSize: '12px', color: '#666', fontWeight: '500', display: 'block', marginBottom: '6px' }}>
                  Nom *
                </label>
                <input
                  type="text"
                  value={nom}
                  onChange={e => setNom(e.target.value)}
                  placeholder="Ex : Beurre"
                  style={{
                    width: '100%', padding: '10px 12px', borderRadius: '8px',
                    border: '0.5px solid #ddd', fontSize: '14px', outline: 'none'
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: '12px', color: '#666', fontWeight: '500', display: 'block', marginBottom: '6px' }}>
                  Prix / unité (€)
                </label>
                <input
                  type="number"
                  value={prixKg}
                  onChange={e => setPrixKg(e.target.value)}
                  placeholder="Ex : 8.50"
                  step="0.01"
                  style={{
                    width: '100%', padding: '10px 12px', borderRadius: '8px',
                    border: '0.5px solid #ddd', fontSize: '14px', outline: 'none'
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: '12px', color: '#666', fontWeight: '500', display: 'block', marginBottom: '6px' }}>
                  Unité
                </label>
                <select
                  value={unite}
                  onChange={e => setUnite(e.target.value)}
                  style={{
                    width: '100%', padding: '10px 12px', borderRadius: '8px',
                    border: '0.5px solid #ddd', fontSize: '14px', background: 'white', outline: 'none'
                  }}
                >
                  {['kg', 'g', 'L', 'cl', 'ml', 'u', 'botte', 'pièce'].map(u => (
                    <option key={u}>{u}</option>
                  ))}
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={handleSubmit}
                disabled={saving}
                style={{
                  background: saving ? '#aaa' : '#1D9E75', color: 'white',
                  border: 'none', borderRadius: '8px', padding: '8px 20px',
                  fontSize: '13px', fontWeight: '500', cursor: saving ? 'not-allowed' : 'pointer'
                }}
              >
                {saving ? 'Enregistrement...' : editingId ? 'Modifier' : 'Ajouter'}
              </button>
              <button
                onClick={resetForm}
                style={{
                  background: 'transparent', color: '#666',
                  border: '0.5px solid #ddd', borderRadius: '8px',
                  padding: '8px 16px', fontSize: '13px', cursor: 'pointer'
                }}
              >
                Annuler
              </button>
            </div>
          </div>
        )}

        {/* Recherche */}
        <input
          type="text"
          placeholder="Rechercher un ingrédient..."
          value={recherche}
          onChange={e => setRecherche(e.target.value)}
          style={{
            width: '100%', padding: '10px 14px', borderRadius: '8px',
            border: '0.5px solid #ddd', fontSize: '14px',
            background: 'white', outline: 'none', marginBottom: '16px'
          }}
        />

        {/* Liste */}
        <div style={{
          background: 'white', borderRadius: '12px',
          border: '0.5px solid #e0e0d8', overflow: 'hidden'
        }}>
          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#888', fontSize: '14px' }}>
              Chargement...
            </div>
          ) : ingredientsFiltres.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#888', fontSize: '14px' }}>
              {ingredients.length === 0 ? 'Aucun ingrédient pour le moment' : 'Aucun résultat'}
            </div>
          ) : (
            <>
              <div style={{
                display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto',
                gap: '8px', padding: '12px 16px',
                borderBottom: '0.5px solid #e0e0d8',
                fontSize: '11px', color: '#888', fontWeight: '500', textTransform: 'uppercase'
              }}>
                <span>Nom</span><span>Prix / unité</span><span>Unité</span><span></span>
              </div>
              {ingredientsFiltres.map((ing, i) => (
                <div
                  key={ing.id}
                  style={{
                    display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto',
                    gap: '8px', padding: '12px 16px', alignItems: 'center',
                    borderBottom: i < ingredientsFiltres.length - 1 ? '0.5px solid #f0f0e8' : 'none'
                  }}
                >
                  <span style={{ fontSize: '14px', fontWeight: '500' }}>{ing.nom}</span>
                  <span style={{ fontSize: '14px', color: '#444' }}>
                    {ing.prix_kg ? `${Number(ing.prix_kg).toFixed(2)} €` : '—'}
                  </span>
                  <span style={{ fontSize: '13px', color: '#888' }}>{ing.unite || '—'}</span>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      onClick={() => handleEdit(ing)}
                      style={{
                        background: 'transparent', border: '0.5px solid #ddd',
                        borderRadius: '6px', padding: '4px 10px',
                        fontSize: '12px', cursor: 'pointer', color: '#666'
                      }}
                    >
                      Modifier
                    </button>
                    <button
                      onClick={() => handleDelete(ing.id)}
                      style={{
                        background: 'transparent', border: '0.5px solid #ddd',
                        borderRadius: '6px', padding: '4px 10px',
                        fontSize: '12px', cursor: 'pointer', color: '#A32D2D'
                      }}
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>

        {/* Compteur */}
        {ingredients.length > 0 && (
          <div style={{ textAlign: 'center', marginTop: '12px', fontSize: '12px', color: '#aaa' }}>
            {ingredients.length} ingrédient{ingredients.length > 1 ? 's' : ''} au total
          </div>
        )}
      </div>
    </div>
  )
}