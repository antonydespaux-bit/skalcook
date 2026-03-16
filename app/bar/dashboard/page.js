'use client'
import { useState, useEffect } from 'react'
import { supabase, getParametres } from '../../../lib/supabase'
import { useRouter } from 'next/navigation'
import { theme, Logo } from '../../../lib/theme.jsx'
import { useIsMobile } from '../../../lib/useIsMobile'
import { useTheme } from '../../../lib/useTheme'
import { useRole } from '../../../lib/useRole'

export default function BarDashboardPage() {
  const [fiches, setFiches] = useState([])
  const [ingredientsPrixHausse, setIngredientsPrixHausse] = useState([])
  const [params, setParams] = useState({})
  const [loading, setLoading] = useState(true)
  const [menuOuvert, setMenuOuvert] = useState(false)
  const [isPrixExpanded, setIsPrixExpanded] = useState(false) // État rétractable ajouté
  const router = useRouter()
  const isMobile = useIsMobile()
  const { c } = useTheme()
  const { role, nom, loading: roleLoading } = useRole()

  useEffect(() => {
    checkUser()
    loadData()
  }, [])

  useEffect(() => {
    if (!roleLoading && role && role !== 'admin' && role !== 'bar' && role !== 'directeur') {
      router.push('/dashboard')
    }
  }, [role, roleLoading])

  const checkUser = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) router.push('/')
  }

  const loadData = async () => {
    const p = await getParametres()
    setParams(p)

    const { data: fichesData } = await supabase
      .from('fiches_bar')
      .select('*')
      .neq('categorie', 'Sous-fiche')
      .eq('archive', false)

    const { data: prixData } = await supabase
      .from('ingredients_bar')
      .select('*')
      .not('prix_precedent', 'is', null)
      .order('prix_updated_at', { ascending: false })
      .limit(20)

    setFiches(fichesData || [])
    setIngredientsPrixHausse(prixData || [])
    setLoading(false)
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  const seuilVert = parseFloat(params['seuil_vert_boissons'] || 22)
  const seuilOrange = parseFloat(params['seuil_orange_boissons'] || 28)

  const foodCostFiche = (fiche) => {
    if (!fiche.prix_ttc || !fiche.cout_portion) return null
    return (fiche.cout_portion / (fiche.prix_ttc / 1.10) * 100)
  }

  const fichesAvecFC = fiches.filter(f => f.cout_portion && f.prix_ttc)
  const foodCostMoyen = fichesAvecFC.length > 0
    ? fichesAvecFC.reduce((sum, f) => sum + foodCostFiche(f), 0) / fichesAvecFC.length
    : null

  const fichesAlerte = fiches
    .filter(f => { const fc = foodCostFiche(f); return fc && fc > seuilOrange })
    .sort((a, b) => foodCostFiche(b) - foodCostFiche(a))

  const fichesFCColor = (fc) => {
    if (fc < seuilVert) return { bg: '#EAF3DE', color: '#3B6D11' }
    if (fc < seuilOrange) return { bg: '#FAEEDA', color: '#854F0B' }
    return { bg: '#FCEBEB', color: '#A32D2D' }
  }

  const fichesByCategorie = [...new Set(fiches.map(f => f.categorie).filter(Boolean))].map(cat => ({
    cat, nb: fiches.filter(f => f.categorie === cat).length
  }))

  const maxFiches = Math.max(...fichesByCategorie.map(c => c.nb), 1)

  const peutModifier = role === 'admin' || role === 'bar'

  const navItems = [
    ...(peutModifier ? [{ label: '+ Nouvelle fiche', path: '/bar/fiches/nouvelle', accent: true }] : []),
    { label: 'Fiches Bar', path: '/bar/fiches' },
    { label: 'Récap', path: '/bar/recap' },
    { label: 'Ingrédients', path: '/bar/ingredients' },
    { label: 'Import', path: '/bar/import' },
    { label: 'Archives', path: '/bar/archives' },
    ...(role === 'admin' ? [{ label: '🍽️ Cuisine', path: '/choix' }] : []),
    ...(role === 'directeur' ? [{ label: '🍽️ Cuisine', path: '/dashboard' }] : []),
    { label: 'Déconnexion', path: null, action: handleLogout },
  ]

  if (loading || roleLoading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: c.fond }}>
      <div style={{ fontSize: '14px', color: c.texteMuted }}>Chargement...</div>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: c.fond }}>

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
          <button onClick={() => setMenuOuvert(!menuOuvert)} style={{
            background: 'transparent', border: '0.5px solid rgba(255,255,255,0.3)',
            borderRadius: '8px', padding: '8px 12px', cursor: 'pointer',
            color: 'white', fontSize: '18px'
          }}>☰</button>
        ) : (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {navItems.map((item, i) => (
              <button key={i}
                onClick={() => item.action ? item.action() : router.push(item.path)}
                style={{
                  background: item.accent ? '#C4956A' : 'transparent',
                  color: item.accent ? '#3C3489' : 'rgba(255,255,255,0.7)',
                  border: item.accent ? 'none' : '0.5px solid rgba(255,255,255,0.2)',
                  borderRadius: '8px', padding: '8px 14px', fontSize: '13px',
                  fontWeight: item.accent ? '600' : '400', cursor: 'pointer'
                }}
              >{item.label}</button>
            ))}
          </div>
        )}
      </div>

      {isMobile && menuOuvert && (
        <div style={{
          background: '#3C3489', padding: '8px 16px 16px',
          borderBottom: '0.5px solid #7F77DD40',
          position: 'sticky', top: '56px', zIndex: 99
        }}>
          {navItems.map((item, i) => (
            <button key={i}
              onClick={() => { setMenuOuvert(false); item.action ? item.action() : router.push(item.path) }}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                background: item.accent ? '#C4956A' : 'transparent',
                color: item.accent ? '#3C3489' : 'rgba(255,255,255,0.85)',
                border: 'none', borderRadius: '8px',
                padding: '12px 16px', fontSize: '14px',
                fontWeight: item.accent ? '600' : '400',
                cursor: 'pointer', marginBottom: '4px'
              }}
            >{item.label}</button>
          ))}
        </div>
      )}

      <div style={{ padding: isMobile ? '12px' : '24px', maxWidth: '1100px', margin: '0 auto' }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div style={{ fontSize: '11px', color: c.texteMuted, textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: '500' }}>
            🍸 Dashboard Bar — {params['nom_etablissement'] || 'La Fantaisie'}
          </div>
          {nom && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '12px', color: c.texteMuted }}>Bonjour, <strong style={{ color: c.texte }}>{nom}</strong></span>
              <span style={{ background: '#EEEDFE', color: '#3C3489', borderRadius: '20px', padding: '3px 10px', fontSize: '11px', fontWeight: '500' }}>
                {role === 'admin' ? 'Administrateur' : role === 'bar' ? 'Bar' : 'Directeur'}
              </span>
            </div>
          )}
        </div>

        {/* KPIs */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)',
          gap: isMobile ? '10px' : '16px', marginBottom: '24px'
        }}>
          <div style={{
            background: foodCostMoyen ? fichesFCColor(foodCostMoyen).bg : c.blanc,
            borderRadius: '12px', padding: isMobile ? '14px' : '20px', border: `0.5px solid ${c.bordure}`
          }}>
            <div style={{ fontSize: '11px', color: c.texteMuted, fontWeight: '500', textTransform: 'uppercase', marginBottom: '8px' }}>Food cost moyen</div>
            <div style={{ fontSize: isMobile ? '28px' : '36px', fontWeight: '500', color: foodCostMoyen ? fichesFCColor(foodCostMoyen).color : c.texte }}>
              {foodCostMoyen ? `${foodCostMoyen.toFixed(1)}%` : '—'}
            </div>
            <div style={{ fontSize: '11px', color: c.texteMuted, marginTop: '4px' }}>Sur {fichesAvecFC.length} fiches</div>
          </div>

          <div style={{
            background: c.blanc, borderRadius: '12px', padding: isMobile ? '14px' : '20px',
            border: `0.5px solid ${c.bordure}`, cursor: 'pointer'
          }} onClick={() => router.push('/bar/fiches')}>
            <div style={{ fontSize: '11px', color: c.texteMuted, fontWeight: '500', textTransform: 'uppercase', marginBottom: '8px' }}>Fiches actives</div>
            <div style={{ fontSize: isMobile ? '28px' : '36px', fontWeight: '500', color: c.texte }}>{fiches.length}</div>
            <div style={{ fontSize: '11px', color: c.texteMuted, marginTop: '4px' }}>Cocktails & boissons</div>
          </div>

          <div style={{
            background: fichesAlerte.length > 0 ? '#FCEBEB' : '#EAF3DE',
            borderRadius: '12px', padding: isMobile ? '14px' : '20px', border: `0.5px solid ${c.bordure}`
          }}>
            <div style={{ fontSize: '11px', color: c.texteMuted, fontWeight: '500', textTransform: 'uppercase', marginBottom: '8px' }}>Fiches en alerte</div>
            <div style={{ fontSize: isMobile ? '28px' : '36px', fontWeight: '500', color: fichesAlerte.length > 0 ? '#A32D2D' : '#3B6D11' }}>{fichesAlerte.length}</div>
            <div style={{ fontSize: '11px', color: c.texteMuted, marginTop: '4px' }}>Food cost {'>'} {seuilOrange}%</div>
          </div>

          <div style={{
            background: ingredientsPrixHausse.length > 0 ? '#FAEEDA' : c.blanc,
            borderRadius: '12px', padding: isMobile ? '14px' : '20px', border: `0.5px solid ${c.bordure}`
          }}>
            <div style={{ fontSize: '11px', color: c.texteMuted, fontWeight: '500', textTransform: 'uppercase', marginBottom: '8px' }}>Prix modifiés</div>
            <div style={{ fontSize: isMobile ? '28px' : '36px', fontWeight: '500', color: ingredientsPrixHausse.length > 0 ? '#854F0B' : c.texte }}>{ingredientsPrixHausse.length}</div>
            <div style={{ fontSize: '11px', color: c.texteMuted, marginTop: '4px' }}>Ingrédients récents</div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: isMobile ? '12px' : '16px', marginBottom: '16px' }}>

          {/* Fiches en alerte */}
          <div style={{ background: c.blanc, borderRadius: '12px', border: `0.5px solid ${c.bordure}`, overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: `0.5px solid ${c.bordure}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: '13px', fontWeight: '500', color: c.texte }}>🚨 Fiches en alerte</div>
              <span style={{ fontSize: '11px', color: c.texteMuted }}>Food cost {'>'} {seuilOrange}%</span>
            </div>
            {fichesAlerte.length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', color: c.texteMuted, fontSize: '13px' }}>✓ Aucune fiche en alerte</div>
            ) : (
              <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                {fichesAlerte.slice(0, 10).map((fiche, i) => {
                  const fc = foodCostFiche(fiche)
                  return (
                    <div key={fiche.id} onClick={() => router.push(`/bar/fiches/${fiche.id}`)}
                      style={{
                        padding: '12px 20px', cursor: 'pointer',
                        borderBottom: i < fichesAlerte.length - 1 ? `0.5px solid ${c.bordure}` : 'none',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: c.blanc
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = c.fond}
                      onMouseLeave={e => e.currentTarget.style.background = c.blanc}
                    >
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: '500', color: c.texte }}>{fiche.nom}</div>
                        <div style={{ fontSize: '11px', color: c.texteMuted, marginTop: '2px' }}>{fiche.categorie}</div>
                      </div>
                      <span style={{ background: '#FCEBEB', color: '#A32D2D', borderRadius: '20px', padding: '3px 10px', fontSize: '12px', fontWeight: '600' }}>
                        {fc.toFixed(1)}%
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Fiches par catégorie */}
          <div style={{ background: c.blanc, borderRadius: '12px', border: `0.5px solid ${c.bordure}`, overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: `0.5px solid ${c.bordure}` }}>
              <div style={{ fontSize: '13px', fontWeight: '500', color: c.texte }}>📊 Fiches par catégorie</div>
            </div>
            <div style={{ padding: '16px 20px' }}>
              {fichesByCategorie.length === 0 ? (
                <div style={{ textAlign: 'center', color: c.texteMuted, fontSize: '13px', padding: '20px 0' }}>Aucune fiche pour le moment</div>
              ) : fichesByCategorie.map(({ cat, nb }) => (
                <div key={cat} style={{ marginBottom: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontSize: '12px', color: c.texte, fontWeight: '500' }}>{cat}</span>
                    <span style={{ fontSize: '12px', color: c.texteMuted }}>{nb}</span>
                  </div>
                  <div style={{ background: c.fond, borderRadius: '20px', height: '6px', overflow: 'hidden' }}>
                    <div style={{ background: '#7F77DD', height: '100%', borderRadius: '20px', width: `${(nb / maxFiches) * 100}%`, transition: 'width 0.5s ease' }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* SECTION PRIX MODIFIÉS RÉTRACTABLE (BAR VERSION) */}
        {ingredientsPrixHausse.length > 0 && (
          <div style={{ background: c.blanc, borderRadius: '12px', border: `0.5px solid ${c.bordure}`, overflow: 'hidden', marginBottom: '16px' }}>
            <div 
              onClick={() => setIsPrixExpanded(!isPrixExpanded)}
              style={{ 
                padding: '16px 20px', 
                borderBottom: isPrixExpanded ? `0.5px solid ${c.bordure}` : 'none', 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center',
                cursor: 'pointer',
                background: isPrixExpanded ? '#EEEDFE50' : c.blanc,
                transition: 'background 0.2s ease'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ fontSize: '13px', fontWeight: '500', color: '#3C3489' }}>📈 Ingrédients Bar avec prix modifiés</div>
                <span style={{ background: '#EEEDFE', color: '#3C3489', borderRadius: '20px', padding: '2px 10px', fontSize: '11px', fontWeight: '600' }}>
                  {ingredientsPrixHausse.length} alertes
                </span>
              </div>
              <div style={{ fontSize: '14px', color: '#3C3489', fontWeight: '500' }}>
                {isPrixExpanded ? '− Masquer' : '+ Développer'}
              </div>
            </div>

            {isPrixExpanded && (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ background: c.fond }}>
                      {['Ingrédient', 'Ancien prix', 'Nouveau prix', 'Variation', 'Date'].map((h, i) => (
                        <th key={h} style={{ padding: '10px 16px', textAlign: i === 0 ? 'left' : 'right', fontSize: '11px', color: c.texteMuted, fontWeight: '500', textTransform: 'uppercase', borderBottom: `0.5px solid ${c.bordure}` }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {ingredientsPrixHausse.map((ing, i) => {
                      const variation = ing.prix_precedent && ing.prix_kg ? ((ing.prix_kg - ing.prix_precedent) / ing.prix_precedent * 100) : null
                      const hausse = variation > 0
                      return (
                        <tr key={ing.id} style={{ borderBottom: i < ingredientsPrixHausse.length - 1 ? `0.5px solid ${c.bordure}` : 'none', background: c.blanc }}>
                          <td style={{ padding: '10px 16px', fontWeight: '500', color: c.texte }}>{ing.nom}</td>
                          <td style={{ padding: '10px 16px', textAlign: 'right', color: c.texteMuted }}>{ing.prix_precedent ? `${Number(ing.prix_precedent).toFixed(2)} €` : '—'}</td>
                          <td style={{ padding: '10px 16px', textAlign: 'right', color: c.texte }}>{ing.prix_kg ? `${Number(ing.prix_kg).toFixed(2)} €` : '—'}</td>
                          <td style={{ padding: '10px 16px', textAlign: 'right' }}>
                            {variation !== null && (
                              <span style={{ background: hausse ? '#FCEBEB' : '#EAF3DE', color: hausse ? '#A32D2D' : '#3B6D11', borderRadius: '20px', padding: '2px 8px', fontSize: '12px', fontWeight: '500' }}>
                                {hausse ? '+' : ''}{variation.toFixed(1)}%
                              </span>
                            )}
                          </td>
                          <td style={{ padding: '10px 16px', textAlign: 'right', color: c.texteMuted, fontSize: '12px' }}>
                            {ing.prix_updated_at ? new Date(ing.prix_updated_at).toLocaleDateString('fr-FR') : '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
