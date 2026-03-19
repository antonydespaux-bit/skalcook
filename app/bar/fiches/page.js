'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../../../lib/supabase'
import { useRouter } from 'next/navigation'
import { theme, Logo } from '../../../lib/theme.jsx'
import { useIsMobile } from '../../../lib/useIsMobile'
import { useTheme } from '../../../lib/useTheme'
import { useRole } from '../../../lib/useRole'

// AJOUT de 'Sous-fiche' dans la liste des catégories pour le filtre
const CATEGORIES_BAR = ['Cocktails', 'Vins', 'Bières', 'Softs', 'Champagnes', 'Spiritueux', 'Sans alcool', 'Mocktails', 'Sous-fiche']
const CATEGORIES_ALCOOL = ['Cocktails', 'Vins', 'Champagnes', 'Bières', 'Spiritueux']

export default function BarFichesPage() {
  const [fiches, setFiches] = useState([])
  const [loading, setLoading] = useState(true)
  const [recherche, setRecherche] = useState('')
  const [categorie, setCategorie] = useState('toutes')
  const [saison, setSaison] = useState('toutes')
  const [menuOuvert, setMenuOuvert] = useState(false)
  const router = useRouter()
  const isMobile = useIsMobile()
  const { c } = useTheme()
  const { role } = useRole()

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
      .from('fiches_bar')
      .select('*')
      .eq('archive', false)
      .order('created_at', { ascending: false })
    setFiches(data || [])
    setLoading(false)
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  const fichesFiltrees = fiches.filter(f => {
    const matchRecherche = f.nom.toLowerCase().includes(recherche.toLowerCase())
    const matchCategorie = categorie === 'toutes' || f.categorie === categorie
    const matchSaison = saison === 'toutes' || f.saison === saison
    return matchRecherche && matchCategorie && matchSaison
  })

  const peutModifier = role === 'admin' || role === 'bar'

  const navItems = [
    ...(peutModifier ? [{ label: '+ Nouvelle fiche', path: '/bar/fiches/nouvelle', accent: true }] : []),
    { label: 'Dashboard', path: '/bar/dashboard' },
    { label: 'Ingrédients', path: '/bar/ingredients' },
    { label: 'Récap', path: '/bar/recap' },
    { label: 'Déconnexion', path: null, action: handleLogout },
  ]

  return (
    <div style={{ minHeight: '100vh', background: c.fond }}>
      {/* HEADER (Inchangé) */}
      <div style={{
        background: '#3C3489', borderBottom: '0.5px solid #7F77DD40',
        padding: '0 16px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', height: '56px',
        position: 'sticky', top: 0, zIndex: 100
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Logo height={28} couleur="white" onClick={() => router.push('/bar/dashboard')} />
          <span style={{ background: '#7F77DD', color: 'white', borderRadius: '6px', padding: '2px 10px', fontSize: '11px', fontWeight: '600', letterSpacing: '1px' }}>BAR</span>
        </div>
        {isMobile ? (
          <button onClick={() => setMenuOuvert(!menuOuvert)} style={{ background: 'transparent', border: '0.5px solid rgba(255,255,255,0.3)', borderRadius: '8px', padding: '8px 12px', color: 'white' }}>☰</button>
        ) : (
          <div style={{ display: 'flex', gap: '8px' }}>
            {navItems.map((item, i) => (
              <button key={i} onClick={() => item.action ? item.action() : router.push(item.path)} style={{ background: item.accent ? '#C4956A' : 'transparent', color: item.accent ? '#3C3489' : 'rgba(255,255,255,0.7)', border: item.accent ? 'none' : '0.5px solid rgba(255,255,255,0.2)', borderRadius: '8px', padding: '8px 14px', fontSize: '13px', cursor: 'pointer' }}>{item.label}</button>
            ))}
          </div>
        )}
      </div>

      <div style={{ padding: isMobile ? '16px' : '24px', maxWidth: '1100px', margin: '0 auto' }}>
        
        {/* STATS (Inchangé) */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '24px' }}>
          {[
            { label: 'Fiches bar', value: fiches.length },
            { label: 'Cocktails', value: fiches.filter(f => f.categorie === 'Cocktails').length },
            { label: 'Préparations', value: fiches.filter(f => f.categorie === 'Sous-fiche').length },
          ].map((stat, i) => (
            <div key={i} style={{ background: c.blanc, borderRadius: '10px', padding: '16px', border: `0.5px solid ${c.bordure}` }}>
              <div style={{ fontSize: '10px', color: c.texteMuted, textTransform: 'uppercase' }}>{stat.label}</div>
              <div style={{ fontSize: '24px', fontWeight: '500', color: c.texte }}>{stat.value}</div>
            </div>
          ))}
        </div>

        {/* FILTRES */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexDirection: isMobile ? 'column' : 'row' }}>
          <input type="text" placeholder="Rechercher..." value={recherche} onChange={e => setRecherche(e.target.value)} style={{ flex: '1', padding: '10px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, background: c.blanc }} />
          <select value={categorie} onChange={e => setCategorie(e.target.value)} style={{ padding: '10px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, background: c.blanc }}>
            <option value="toutes">Toutes catégories</option>
            {CATEGORIES_BAR.map(cat => <option key={cat} value={cat}>{cat}</option>)}
          </select>
        </div>

        {/* GRILLE DE FICHES */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(280px, 1fr))', gap: '14px' }}>
          {fichesFiltrees.map(fiche => {
            // Calcul du Food Cost avec la bonne TVA (20% alcool, 10% le reste)
            const tva = CATEGORIES_ALCOOL.includes(fiche.categorie) ? 1.20 : 1.10
            const fc = fiche.prix_ttc && fiche.cout_portion
              ? (fiche.cout_portion / (fiche.prix_ttc / tva) * 100).toFixed(1)
              : null

            return (
              <div key={fiche.id} onClick={() => router.push(`/bar/fiches/${fiche.id}`)}
                style={{ background: c.blanc, borderRadius: '12px', border: `0.5px solid ${c.bordure}`, cursor: 'pointer', overflow: 'hidden' }}>
                {fiche.photo_url && <img src={fiche.photo_url} style={{ width: '100%', height: '160px', objectFit: 'cover' }} />}
                <div style={{ padding: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <div style={{ fontWeight: '500', color: c.texte }}>{fiche.nom}</div>
                    <span style={{ background: fiche.categorie === 'Sous-fiche' ? '#EEEDFE' : c.fond, color: fiche.categorie === 'Sous-fiche' ? '#3C3489' : c.texteMuted, borderRadius: '20px', padding: '2px 8px', fontSize: '10px' }}>
                      {fiche.categorie}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', fontSize: '12px', alignItems: 'center' }}>
                    {fiche.prix_ttc && <span style={{ fontWeight: '600' }}>{Number(fiche.prix_ttc).toFixed(2)} €</span>}
                    {fc && (
                      <span style={{ 
                        background: fc < 22 ? '#EAF3DE' : fc < 28 ? '#FAEEDA' : '#FCEBEB', 
                        color: fc < 22 ? '#3B6D11' : fc < 28 ? '#854F0B' : '#A32D2D',
                        borderRadius: '20px', padding: '1px 8px', fontSize: '11px', fontWeight: '500' 
                      }}>{fc}%</span>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
