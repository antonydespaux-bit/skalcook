'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useRouter } from 'next/navigation'
import { theme, Logo } from '../../lib/theme.jsx'

export default function FichesPage() {
  const [fiches, setFiches] = useState([])
  const [loading, setLoading] = useState(true)
  const [recherche, setRecherche] = useState('')
  const [categorie, setCategorie] = useState('toutes')
  const router = useRouter()
  const c = theme.couleurs

  useEffect(() => {
    checkUser()
    loadFiches()
  }, [])

  const checkUser = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) router.push('/')
  }

  const loadFiches = async () => {
    const { data, error } = await supabase
      .from('fiches')
      .select('*')
      .neq('categorie', 'Sous-fiche')
      .order('created_at', { ascending: false })
    if (!error) setFiches(data || [])
    setLoading(false)
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  const fichesFiltrees = fiches.filter(f => {
    const matchRecherche = f.nom.toLowerCase().includes(recherche.toLowerCase())
    const matchCategorie = categorie === 'toutes' || f.categorie === categorie
    return matchRecherche && matchCategorie
  })

  const categories = ['toutes', ...new Set(fiches.map(f => f.categorie).filter(Boolean))]

  return (
    <div style={{ minHeight: '100vh', background: c.fond }}>

      <div className="no-print" style={{
        background: c.principal,
        borderBottom: `0.5px solid ${c.accent}40`,
        padding: '0 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: '56px'
      }}>
        <Logo height={30} couleur="white" />
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button onClick={() => router.push('/fiches/nouvelle')} style={{
            background: c.accent, color: c.principal, border: 'none',
            borderRadius: '8px', padding: '8px 16px', fontSize: '13px',
            fontWeight: '600', cursor: 'pointer'
          }}>+ Nouvelle fiche</button>
          <button onClick={() => router.push('/sous-fiches')} style={{
            background: 'transparent', color: 'rgba(255,255,255,0.7)',
            border: '0.5px solid rgba(255,255,255,0.2)',
            borderRadius: '8px', padding: '8px 16px', fontSize: '13px', cursor: 'pointer'
          }}>Sous-fiches</button>
          <button onClick={() => router.push('/ingredients')} style={{
            background: 'transparent', color: 'rgba(255,255,255,0.7)',
            border: '0.5px solid rgba(255,255,255,0.2)',
            borderRadius: '8px', padding: '8px 16px', fontSize: '13px', cursor: 'pointer'
          }}>Ingrédients</button>
          <button onClick={handleLogout} style={{
            background: 'transparent', color: 'rgba(255,255,255,0.7)',
            border: '0.5px solid rgba(255,255,255,0.2)',
            borderRadius: '8px', padding: '8px 16px', fontSize: '13px', cursor: 'pointer'
          }}>Déconnexion</button>
        </div>
      </div>

      <div style={{ padding: '24px', maxWidth: '1100px', margin: '0 auto' }}>

        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '12px', marginBottom: '24px'
        }}>
          {[
            { label: 'Fiches totales', value: fiches.length },
            { label: 'Plats', value: fiches.filter(f => f.categorie === 'Plat').length },
            { label: 'Desserts', value: fiches.filter(f => f.categorie === 'Dessert').length },
          ].map((stat, i) => (
            <div key={i} style={{
              background: 'white', borderRadius: '10px', padding: '16px',
              border: `0.5px solid ${c.bordure}`
            }}>
              <div style={{ fontSize: '11px', color: c.texteMuted, fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                {stat.label}
              </div>
              <div style={{ fontSize: '28px', fontWeight: '500', marginTop: '4px', color: c.texte }}>
                {stat.value}
              </div>
            </div>
          ))}
        </div>

        <div className="no-print" style={{
          display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap'
        }}>
          <input
            type="text"
            placeholder="Rechercher une fiche..."
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            style={{
              flex: '1', minWidth: '200px', padding: '10px 14px',
              borderRadius: '8px', border: `0.5px solid ${c.bordure}`,
              fontSize: '14px', background: 'white', outline: 'none', color: c.texte
            }}
          />
          <select
            value={categorie}
            onChange={(e) => setCategorie(e.target.value)}
            style={{
              padding: '10px 14px', borderRadius: '8px',
              border: `0.5px solid ${c.bordure}`, fontSize: '14px',
              background: 'white', outline: 'none', cursor: 'pointer', color: c.texte
            }}
          >
            {categories.map(c => (
              <option key={c} value={c}>
                {c === 'toutes' ? 'Toutes les catégories' : c}
              </option>
            ))}
          </select>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px', color: c.texteMuted, fontSize: '14px' }}>
            Chargement...
          </div>
        ) : fichesFiltrees.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: '60px', background: 'white',
            borderRadius: '12px', border: `0.5px solid ${c.bordure}`
          }}>
            <div style={{ fontSize: '14px', color: c.texteMuted, marginBottom: '16px' }}>
              {fiches.length === 0 ? 'Aucune fiche pour le moment' : 'Aucune fiche ne correspond à votre recherche'}
            </div>
            {fiches.length === 0 && (
              <button onClick={() => router.push('/fiches/nouvelle')} style={{
                background: c.accent, color: c.principal, border: 'none',
                borderRadius: '8px', padding: '10px 20px', fontSize: '13px',
                cursor: 'pointer', fontWeight: '600'
              }}>
                Créer la première fiche
              </button>
            )}
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: '14px'
          }}>
            {fichesFiltrees.map(fiche => (
              <div
                key={fiche.id}
                onClick={() => router.push(`/fiches/${fiche.id}`)}
                style={{
                  background: 'white', borderRadius: '12px', padding: '18px',
                  border: `0.5px solid ${c.bordure}`, cursor: 'pointer',
                  transition: 'border-color 0.15s, box-shadow 0.15s'
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = c.accent
                  e.currentTarget.style.boxShadow = `0 2px 12px ${c.accent}20`
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = c.bordure
                  e.currentTarget.style.boxShadow = 'none'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                  <div style={{ fontSize: '15px', fontWeight: '500', color: c.texte }}>
                    {fiche.nom}
                  </div>
                  {fiche.categorie && (
                    <span style={{
                      background: c.accentClair, color: c.principal,
                      borderRadius: '20px', padding: '3px 10px',
                      fontSize: '11px', fontWeight: '500',
                      flexShrink: 0, marginLeft: '8px'
                    }}>
                      {fiche.categorie}
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '16px', fontSize: '13px', color: c.texteMuted }}>
                  {fiche.nb_portions && <span>{fiche.nb_portions} portions</span>}
                  {fiche.prix_ttc && (
                    <span style={{ fontWeight: '500', color: c.texte }}>
                      {Number(fiche.prix_ttc).toFixed(2)} €
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}