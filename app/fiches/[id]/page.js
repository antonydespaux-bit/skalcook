'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../../../lib/supabase'
import { useRouter, useParams } from 'next/navigation'

export default function FicheDetail() {
  const [fiche, setFiche] = useState(null)
  const [ingredients, setIngredients] = useState([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const params = useParams()

  useEffect(() => {
    checkUser()
    loadFiche()
  }, [])

  const checkUser = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) router.push('/')
  }

  const loadFiche = async () => {
    const { data: ficheData } = await supabase
      .from('fiches')
      .select('*')
      .eq('id', params.id)
      .single()

    if (!ficheData) { router.push('/fiches'); return }
    setFiche(ficheData)

    const { data: ingsData } = await supabase
      .from('fiche_ingredients')
      .select(`
        quantite,
        unite,
        ingredients (id, nom, prix_kg, unite)
      `)
      .eq('fiche_id', params.id)

    setIngredients(ingsData || [])
    setLoading(false)
  }

  const calculerCout = () => {
    return ingredients.reduce((total, ing) => {
      if (ing.ingredients?.prix_kg && ing.quantite) {
        return total + (ing.ingredients.prix_kg * ing.quantite)
      }
      return total
    }, 0)
  }
const foodCost = () => {
  const cout = calculerCout()
  if (!fiche?.prix_ttc || !cout || !fiche?.nb_portions) return null
  const coutParPortion = cout / fiche.nb_portions
  const prixHT = fiche.prix_ttc / 1.10
  return (coutParPortion / prixHT * 100).toFixed(1)
}

  const handleDelete = async () => {
    if (!confirm('Supprimer définitivement cette fiche ?')) return
    await supabase.from('fiches').delete().eq('id', params.id)
    router.push('/fiches')
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f5f0' }}>
      <div style={{ fontSize: '14px', color: '#888' }}>Chargement...</div>
    </div>
  )

  const cout = calculerCout()
  const fc = foodCost()

  return (
    <div style={{ minHeight: '100vh', background: '#f5f5f0' }}>

      {/* Barre du haut — masquée à l'impression */}
      <div className="no-print" style={{
        background: 'white', borderBottom: '0.5px solid #e0e0d8',
        padding: '0 24px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', height: '56px'
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
          <span style={{ fontSize: '15px', fontWeight: '500' }}>{fiche.nom}</span>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => window.print()}
            style={{
              background: '#1D9E75', color: 'white', border: 'none',
              borderRadius: '8px', padding: '8px 16px',
              fontSize: '13px', fontWeight: '500', cursor: 'pointer'
            }}
          >
            Imprimer
          </button>
          <button
            onClick={() => router.push(`/fiches/${params.id}/modifier`)}
            style={{
              background: 'transparent', color: '#666', border: '0.5px solid #ddd',
              borderRadius: '8px', padding: '8px 16px',
              fontSize: '13px', cursor: 'pointer'
            }}
          >
            Modifier
          </button>
          <button
            onClick={handleDelete}
            style={{
              background: 'transparent', color: '#A32D2D', border: '0.5px solid #ddd',
              borderRadius: '8px', padding: '8px 16px',
              fontSize: '13px', cursor: 'pointer'
            }}
          >
            Supprimer
          </button>
        </div>
      </div>

      {/* Contenu imprimable */}
      <div style={{ padding: '24px', maxWidth: '800px', margin: '0 auto' }}>

        {/* En-tête de la fiche */}
        <div style={{
          background: 'white', borderRadius: '12px', padding: '24px',
          border: '0.5px solid #e0e0d8', marginBottom: '16px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
            <div>
              <h1 style={{ fontSize: '22px', fontWeight: '500', marginBottom: '6px' }}>{fiche.nom}</h1>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {fiche.categorie && (
                  <span style={{
                    background: '#E1F5EE', color: '#085041',
                    borderRadius: '20px', padding: '3px 12px',
                    fontSize: '12px', fontWeight: '500'
                  }}>{fiche.categorie}</span>
                )}
              </div>
            </div>
            <div style={{
              background: '#1D9E75', color: 'white',
              borderRadius: '10px', padding: '8px 16px', textAlign: 'center'
            }}>
              <div style={{ fontSize: '11px', opacity: 0.85 }}>Portions</div>
              <div style={{ fontSize: '22px', fontWeight: '500' }}>{fiche.nb_portions || '—'}</div>
            </div>
          </div>

          {fiche.description && (
            <div style={{
              background: '#f5f5f0', borderRadius: '8px', padding: '12px 16px',
              fontSize: '13px', color: '#555', lineHeight: '1.6'
            }}>
              {fiche.description}
            </div>
          )}
        </div>

        {/* Tableau des ingrédients */}
        <div style={{
          background: 'white', borderRadius: '12px',
          border: '0.5px solid #e0e0d8', marginBottom: '16px', overflow: 'hidden'
        }}>
          <div style={{
            padding: '16px 20px', borderBottom: '0.5px solid #e0e0d8',
            fontSize: '13px', fontWeight: '500', color: '#888',
            textTransform: 'uppercase', letterSpacing: '0.04em'
          }}>
            Ingrédients
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f9f9f6' }}>
                {['Ingrédient', 'Quantité', 'Unité', 'Prix unit.', 'Coût'].map((h, i) => (
                  <th key={i} style={{
                    padding: '10px 16px', textAlign: i === 0 ? 'left' : 'right',
                    fontSize: '11px', color: '#888', fontWeight: '500',
                    textTransform: 'uppercase', borderBottom: '0.5px solid #e0e0d8'
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ingredients.map((ing, i) => {
                const coutLigne = ing.ingredients?.prix_kg && ing.quantite
                  ? ing.ingredients.prix_kg * ing.quantite : null
                return (
                  <tr key={i} style={{ borderBottom: i < ingredients.length - 1 ? '0.5px solid #f0f0e8' : 'none' }}>
                    <td style={{ padding: '12px 16px', fontSize: '14px', fontWeight: '500' }}>
                      {ing.ingredients?.nom || '—'}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '14px', textAlign: 'right' }}>
                      {ing.quantite}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '14px', textAlign: 'right', color: '#888' }}>
                      {ing.unite}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '14px', textAlign: 'right', color: '#888' }}>
                      {ing.ingredients?.prix_kg ? `${Number(ing.ingredients.prix_kg).toFixed(2)} €` : '—'}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '14px', textAlign: 'right', fontWeight: '500' }}>
                      {coutLigne ? `${coutLigne.toFixed(2)} €` : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Récapitulatif financier */}
        <div style={{
          background: 'white', borderRadius: '12px', padding: '20px',
          border: '0.5px solid #e0e0d8',
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '16px'
        }}>
          {[
            { label: 'Coût / portion', value: cout && fiche.nb_portions ? `${(cout / fiche.nb_portions).toFixed(2)} €` : '—' },
            { label: 'Coût total matière', value: cout ? `${cout.toFixed(2)} €` : '—' },
            { label: 'Prix de vente TTC', value: fiche.prix_ttc ? `${Number(fiche.prix_ttc).toFixed(2)} €` : '—' },
            { label: 'Prix HT', value: fiche.prix_ttc ? `${(fiche.prix_ttc / 1.10).toFixed(2)} €` : '—' },
            {
              label: 'Food cost', value: fc ? `${fc} %` : '—',
              color: fc ? (fc < 30 ? '#3B6D11' : fc < 40 ? '#854F0B' : '#A32D2D') : '#888',
              bg: fc ? (fc < 30 ? '#EAF3DE' : fc < 40 ? '#FAEEDA' : '#FCEBEB') : 'transparent'
            },
          ].map((stat, i) => (
            <div key={i} style={{
              background: stat.bg || '#f9f9f6',
              borderRadius: '8px', padding: '14px'
            }}>
              <div style={{ fontSize: '11px', color: stat.color || '#888', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                {stat.label}
              </div>
              <div style={{ fontSize: '20px', fontWeight: '500', marginTop: '4px', color: stat.color || '#1a1a1a' }}>
                {stat.value}
              </div>
            </div>
          ))}
        </div>

        {/* Pied de page imprimable */}
        <div style={{
          marginTop: '16px', textAlign: 'center',
          fontSize: '11px', color: '#bbb'
        }}>
          Fiche technique — {fiche.nom} — {new Date().toLocaleDateString('fr-FR')}
        </div>
      </div>
    </div>
  )
}