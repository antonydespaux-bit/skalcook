'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useRouter } from 'next/navigation'

export default function SousFichesPage() {
  const [sousFiches, setSousFiches] = useState([])
  const [loading, setLoading] = useState(true)
  const [recherche, setRecherche] = useState('')
  const router = useRouter()

  useEffect(() => {
    checkUser()
    loadSousFiches()
  }, [])

  const checkUser = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) router.push('/')
  }

  const loadSousFiches = async () => {
    const { data } = await supabase
      .from('fiches')
      .select('*')
      .eq('categorie', 'Sous-fiche')
      .order('created_at', { ascending: false })
    setSousFiches(data || [])
    setLoading(false)
  }

  const sousFichesFiltrees = sousFiches.filter(f =>
    f.nom.toLowerCase().includes(recherche.toLowerCase())
  )

  return (
    <div style={{ minHeight: '100vh', background: '#f5f5f0' }}>

      <div style={{
        background: 'white', borderBottom: '0.5px solid #e0e0d8',
        padding: '0 24px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', height: '56px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            onClick={() => router.push('/fiches')}
            style={{ background: 'transparent', border: '0.5px solid #ddd', borderRadius: '8px', padding: '6px 12px', fontSize: '13px', cursor: 'pointer', color: '#666' }}
          >
            ← Retour
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ background: '#7F77DD', color: 'white', borderRadius: '6px', padding: '2px 8px', fontSize: '11px', fontWeight: '500' }}>SF</span>
            <span style={{ fontSize: '15px', fontWeight: '500' }}>Sous-fiches techniques</span>
          </div>
        </div>
        <button
          onClick={() => router.push('/fiches/nouvelle?type=sous-fiche')}
          style={{ background: '#7F77DD', color: 'white', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '13px', fontWeight: '500', cursor: 'pointer' }}
        >
          + Nouvelle sous-fiche
        </button>
      </div>

      <div style={{ padding: '24px', maxWidth: '900px', margin: '0 auto' }}>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '24px' }}>
          {[
            { label: 'Sous-fiches totales', value: sousFiches.length },
            { label: 'Coût moyen / portion', value: sousFiches.length ? (sousFiches.reduce((s, f) => s + (f.cout_portion || 0), 0) / sousFiches.length).toFixed(2) + ' €' : '—' },
            { label: 'Utilisées comme ingrédient', value: sousFiches.length },
          ].map((stat, i) => (
            <div key={i} style={{ background: 'white', borderRadius: '10px', padding: '16px', border: '0.5px solid #e0e0d8' }}>
              <div style={{ fontSize: '11px', color: '#888', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{stat.label}</div>
              <div style={{ fontSize: '24px', fontWeight: '500', marginTop: '4px' }}>{stat.value}</div>
            </div>
          ))}
        </div>

        <input
          type="text"
          placeholder="Rechercher une sous-fiche..."
          value={recherche}
          onChange={e => setRecherche(e.target.value)}
          style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '0.5px solid #ddd', fontSize: '14px', background: 'white', outline: 'none', marginBottom: '16px' }}
        />

        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px', color: '#888', fontSize: '14px' }}>Chargement...</div>
        ) : sousFichesFiltrees.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px', background: 'white', borderRadius: '12px', border: '0.5px solid #e0e0d8' }}>
            <div style={{ fontSize: '14px', color: '#888', marginBottom: '16px' }}>
              {sousFiches.length === 0 ? 'Aucune sous-fiche pour le moment' : 'Aucun résultat'}
            </div>
            {sousFiches.length === 0 && (
              <button
                onClick={() => router.push('/fiches/nouvelle')}
                style={{ background: '#7F77DD', color: 'white', border: 'none', borderRadius: '8px', padding: '10px 20px', fontSize: '13px', cursor: 'pointer' }}
              >
                Créer la première sous-fiche
              </button>
            )}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '14px' }}>
            {sousFichesFiltrees.map(fiche => (
              <div
                key={fiche.id}
                style={{ background: 'white', borderRadius: '12px', padding: '18px', border: '0.5px solid #AFA9EC', cursor: 'pointer' }}
                onMouseEnter={e => e.currentTarget.style.borderColor = '#7F77DD'}
                onMouseLeave={e => e.currentTarget.style.borderColor = '#AFA9EC'}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                      <span style={{ background: '#7F77DD', color: 'white', borderRadius: '6px', padding: '2px 6px', fontSize: '10px', fontWeight: '500' }}>SF</span>
                      <span style={{ fontSize: '15px', fontWeight: '500' }}>{fiche.nom}</span>
                    </div>
                    <div style={{ fontSize: '12px', color: '#888' }}>
                      {fiche.nb_portions} {fiche.nb_portions > 1 ? 'portions' : 'portion'}
                    </div>
                  </div>
                  {fiche.cout_portion && (
                    <div style={{ background: '#EEEDFE', borderRadius: '8px', padding: '6px 10px', textAlign: 'center' }}>
                      <div style={{ fontSize: '10px', color: '#534AB7' }}>/ portion</div>
                      <div style={{ fontSize: '14px', fontWeight: '500', color: '#3C3489' }}>
                        {Number(fiche.cout_portion).toFixed(3)} €
                      </div>
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                  <button
                    onClick={() => router.push(`/fiches/${fiche.id}`)}
                    style={{ flex: 1, padding: '7px', background: '#EEEDFE', color: '#3C3489', border: 'none', borderRadius: '8px', fontSize: '12px', cursor: 'pointer', fontWeight: '500' }}
                  >
                    Voir
                  </button>
                  <button
                    onClick={() => router.push(`/fiches/${fiche.id}/modifier`)}
                    style={{ flex: 1, padding: '7px', background: 'transparent', color: '#666', border: '0.5px solid #ddd', borderRadius: '8px', fontSize: '12px', cursor: 'pointer' }}
                  >
                    Modifier
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}