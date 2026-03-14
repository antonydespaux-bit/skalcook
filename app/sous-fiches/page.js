'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useRouter } from 'next/navigation'
import { theme, Logo } from '../../lib/theme.jsx'
import { useIsMobile } from '../../lib/useIsMobile'

export default function SousFichesPage() {
  const [fiches, setFiches] = useState([])
  const [loading, setLoading] = useState(true)
  const [recherche, setRecherche] = useState('')
  const router = useRouter()
  const c = theme.couleurs
  const isMobile = useIsMobile()

  useEffect(() => {
    checkUser()
    loadFiches()
  }, [])

  const checkUser = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) router.push('/')
  }

  const loadFiches = async () => {
    const { data } = await supabase
      .from('fiches')
      .select('*')
      .eq('categorie', 'Sous-fiche')
      .eq('archive', false)
      .order('nom')
    setFiches(data || [])
    setLoading(false)
  }

  const fichesFiltrees = fiches.filter(f =>
    f.nom.toLowerCase().includes(recherche.toLowerCase())
  )

  const coutMoyen = fiches.filter(f => f.cout_portion).length > 0
    ? fiches.filter(f => f.cout_portion).reduce((sum, f) => sum + Number(f.cout_portion), 0) / fiches.filter(f => f.cout_portion).length
    : null

  return (
    <div style={{ minHeight: '100vh', background: c.fond }}>

      <div style={{
        background: c.principal, borderBottom: `0.5px solid ${c.accent}40`,
        padding: '0 16px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', height: '56px',
        position: 'sticky', top: 0, zIndex: 100
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Logo height={28} couleur="white" onClick={() => router.push('/dashboard')} />
          <button onClick={() => router.push('/fiches')} style={{
            background: 'transparent', border: '0.5px solid rgba(255,255,255,0.2)',
            borderRadius: '8px', padding: '6px 10px',
            fontSize: '13px', cursor: 'pointer', color: 'rgba(255,255,255,0.7)'
          }}>← {!isMobile && 'Retour'}</button>
          {!isMobile && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{
                background: c.violet, color: 'white', borderRadius: '6px',
                padding: '2px 8px', fontSize: '11px', fontWeight: '500'
              }}>SF</span>
              <span style={{ fontSize: '14px', fontWeight: '500', color: 'white' }}>Sous-fiches techniques</span>
            </div>
          )}
        </div>
        <button onClick={() => router.push('/fiches/nouvelle')} style={{
          background: c.accent, color: c.principal, border: 'none',
          borderRadius: '8px', padding: '8px 14px', fontSize: '13px',
          fontWeight: '600', cursor: 'pointer'
        }}>+ {!isMobile && 'Nouvelle sous-fiche'}</button>
      </div>

      <div style={{ padding: isMobile ? '12px' : '24px', maxWidth: '1000px', margin: '0 auto' }}>

        {/* Stats */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? 'repeat(3, 1fr)' : 'repeat(3, 1fr)',
          gap: isMobile ? '8px' : '12px',
          marginBottom: isMobile ? '16px' : '24px'
        }}>
          {[
            { label: 'Sous-fiches totales', value: fiches.length },
            { label: 'Coût moyen / portion', value: coutMoyen ? `${coutMoyen.toFixed(2)} €` : '—' },
            { label: 'Utilisées comme ingrédient', value: fiches.length },
          ].map((stat, i) => (
            <div key={i} style={{
              background: 'white', borderRadius: '10px',
              padding: isMobile ? '12px' : '16px',
              border: `0.5px solid ${c.bordure}`
            }}>
              <div style={{ fontSize: '10px', color: c.texteMuted, fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '6px' }}>
                {stat.label}
              </div>
              <div style={{ fontSize: isMobile ? '20px' : '26px', fontWeight: '500', color: c.texte }}>
                {stat.value}
              </div>
            </div>
          ))}
        </div>

        {/* Recherche */}
        <input
          type="text"
          placeholder="Rechercher une sous-fiche..."
          value={recherche}
          onChange={e => setRecherche(e.target.value)}
          style={{
            width: '100%', padding: '10px 14px',
            borderRadius: '8px', border: `0.5px solid ${c.bordure}`,
            fontSize: '14px', background: 'white', outline: 'none',
            color: c.texte, marginBottom: '16px'
          }}
        />

        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px', color: c.texteMuted }}>Chargement...</div>
        ) : fichesFiltrees.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: '60px', background: 'white',
            borderRadius: '12px', border: `0.5px solid ${c.bordure}`
          }}>
            <div style={{ fontSize: '14px', color: c.texteMuted, marginBottom: '16px' }}>
              Aucune sous-fiche pour le moment
            </div>
            <button onClick={() => router.push('/fiches/nouvelle')} style={{
              background: c.accent, color: c.principal, border: 'none',
              borderRadius: '8px', padding: '10px 20px', fontSize: '13px',
              cursor: 'pointer', fontWeight: '600'
            }}>Créer la première sous-fiche</button>
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: isMobile ? '10px' : '14px'
          }}>
            {fichesFiltrees.map(fiche => (
              <div key={fiche.id} style={{
                background: 'white', borderRadius: '12px', padding: '18px',
                border: `0.5px solid ${c.bordure}`
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{
                      background: c.violet, color: 'white', borderRadius: '6px',
                      padding: '2px 8px', fontSize: '11px', fontWeight: '500', flexShrink: 0
                    }}>SF</span>
                    <span style={{ fontSize: isMobile ? '14px' : '15px', fontWeight: '500', color: c.texte }}>{fiche.nom}</span>
                  </div>
                  {fiche.cout_portion && (
                    <div style={{
                      background: c.violetClair, borderRadius: '8px',
                      padding: '6px 10px', textAlign: 'right', flexShrink: 0, marginLeft: '8px'
                    }}>
                      <div style={{ fontSize: '10px', color: '#3C3489', opacity: 0.7 }}>/ portion</div>
                      <div style={{ fontSize: '14px', fontWeight: '500', color: '#3C3489' }}>
                        {Number(fiche.cout_portion).toFixed(3)} €
                      </div>
                    </div>
                  )}
                </div>

                <div style={{ fontSize: '12px', color: c.texteMuted, marginBottom: '14px' }}>
                  {fiche.nb_portions} portion{fiche.nb_portions > 1 ? 's' : ''}
                  {fiche.saison && ` — ${fiche.saison}`}
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => router.push(`/fiches/${fiche.id}`)}
                    style={{
                      flex: 1, padding: '8px', background: c.violetClair, color: '#3C3489',
                      border: `0.5px solid #AFA9EC`, borderRadius: '8px',
                      fontSize: '12px', cursor: 'pointer', fontWeight: '500'
                    }}
                  >Voir</button>
                  <button
                    onClick={() => router.push(`/fiches/${fiche.id}/modifier`)}
                    style={{
                      flex: 1, padding: '8px', background: 'transparent', color: c.texteMuted,
                      border: `0.5px solid ${c.bordure}`, borderRadius: '8px',
                      fontSize: '12px', cursor: 'pointer'
                    }}
                  >Modifier</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
