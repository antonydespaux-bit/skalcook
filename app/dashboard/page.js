'use client'
import { useState, useEffect } from 'react'
import { supabase, getClientId, getParametres } from '../../lib/supabase'
import { useRouter } from 'next/navigation'
import { theme } from '../../lib/theme.jsx'
import { useIsMobile } from '../../lib/useIsMobile'
import { useTheme } from '../../lib/useTheme'
import { useRole } from '../../lib/useRole'
import { ALLERGENES } from '../../lib/allergenes'
import { calculerFoodCost, foodCostColor, getSeuilsFromParams } from '../../lib/foodCost'
import Navbar from '../../components/Navbar'
import * as XLSX from 'xlsx'

export default function DashboardPage() {
  const [fiches, setFiches] = useState([])
  const [menus, setMenus] = useState([])
  const [ingredientsPrixHausse, setIngredientsPrixHausse] = useState([])
  const [params, setParams] = useState({})
  const [loading, setLoading] = useState(true)
  const [filtreCategorie, setFiltreCategorie] = useState('toutes')
  const [filtreSaison, setFiltreSaison] = useState('toutes')
  const [isPrixExpanded, setIsPrixExpanded] = useState(false)
  const router = useRouter()
  const isMobile = useIsMobile()
  const { c } = useTheme()
  const { role, nom, loading: roleLoading } = useRole()

  useEffect(() => {
    checkUser()
    loadData()
  }, [])

  useEffect(() => {
    if (!roleLoading && role && !['admin', 'cuisine', 'directeur'].includes(role)) {
      router.push(role === 'bar' ? '/bar/dashboard' : '/dashboard')
    }
  }, [role, roleLoading])

  const checkUser = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) router.push('/')
  }

  const loadData = async () => {
    const clientId = await getClientId()
    if (!clientId) { setLoading(false); return }
    const p = await getParametres()
    setParams(p)
    const { data: fichesData } = await supabase
      .from('fiches').select('*').eq('client_id', clientId).neq('categorie', 'Sous-fiche').eq('archive', false)
    const { data: menusData } = await supabase
      .from('menus').select('*').eq('client_id', clientId).eq('archive', false)
    const { data: prixData } = await supabase
      .from('ingredients').select('*').eq('client_id', clientId)
      .not('prix_precedent', 'is', null)
      .order('prix_updated_at', { ascending: false })
      .limit(20)
    setFiches(fichesData || [])
    setMenus(menusData || [])
    setIngredientsPrixHausse(prixData || [])
    setLoading(false)
  }

  const { seuilVert, seuilOrange, tva } = getSeuilsFromParams(params, 'cuisine')
  const foodCostFiche = (fiche) => calculerFoodCost(fiche.cout_portion, fiche.prix_ttc, tva)

  const fichesAvecFC = fiches.filter(f => f.cout_portion && f.prix_ttc)
  const foodCostMoyen = fichesAvecFC.length > 0
    ? fichesAvecFC.reduce((sum, f) => sum + foodCostFiche(f), 0) / fichesAvecFC.length
    : null

  const fichesAlerte = fiches
    .filter(f => { const fc = foodCostFiche(f); return fc && fc > seuilOrange })
    .sort((a, b) => foodCostFiche(b) - foodCostFiche(a))

  const fichesFCColor = (fc) => foodCostColor(fc, seuilVert, seuilOrange)

  const fichesByCategorie = theme.categories.map(cat => ({
    cat, nb: fiches.filter(f => f.categorie === cat).length
  })).filter(c => c.nb > 0)

  const maxFiches = Math.max(...fichesByCategorie.map(c => c.nb), 1)

  const fichesAvecAllergenes = fiches.filter(f => f.allergenes && f.allergenes.length > 0)
  const fichesFiltreesAllergenes = fichesAvecAllergenes
    .filter(f => filtreCategorie === 'toutes' || f.categorie === filtreCategorie)
    .filter(f => filtreSaison === 'toutes' || f.saison === filtreSaison)

  const exportAllergenesExcel = () => {
    const wb = XLSX.utils.book_new()
    const rows = fichesFiltreesAllergenes.map(f => {
      const row = { 'Fiche': f.nom, 'Catégorie': f.categorie || '—', 'Saison': f.saison || '—' }
      ALLERGENES.forEach(a => { row[`${a.emoji} ${a.label}`] = f.allergenes?.includes(a.id) ? '✓' : '' })
      return row
    })
    const ws = XLSX.utils.json_to_sheet(rows)
    XLSX.utils.book_append_sheet(wb, ws, 'Allergènes')
    XLSX.writeFile(wb, `allergenes_la_fantaisie_${new Date().toLocaleDateString('fr-FR').replace(/\//g, '-')}.xlsx`)
  }

  if (loading || roleLoading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: c.fond }}>
      <div style={{ fontSize: '14px', color: c.texteMuted }}>Chargement...</div>
    </div>
  )

  const today = new Date().toLocaleDateString('fr-FR')

  return (
    <div style={{ minHeight: '100vh', background: c.fond }}>

      <Navbar section="cuisine" />

      {/* Vue écran */}
      <div className="no-print" style={{ padding: isMobile ? '12px' : '24px', maxWidth: '1100px', margin: '0 auto' }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div style={{ fontSize: '11px', color: c.texteMuted, textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: '500' }}>
            Tableau de bord Cuisine — {params['nom_etablissement'] || 'La Fantaisie'}
          </div>
          {nom && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '12px', color: c.texteMuted }}>Bonjour, <strong style={{ color: c.texte }}>{nom}</strong></span>
              <span style={{
                background: role === 'admin' ? '#F0E8E0' : role === 'cuisine' ? '#EAF3DE' : '#FAEEDA',
                color: role === 'admin' ? '#2C1810' : role === 'cuisine' ? '#3B6D11' : '#854F0B',
                borderRadius: '20px', padding: '3px 10px', fontSize: '11px', fontWeight: '500'
              }}>
                {role === 'admin' ? 'Administrateur' : role === 'cuisine' ? 'Cuisine' : 'Directeur'}
              </span>
            </div>
          )}
        </div>

        {/* KPIs */}
        <div style={{
          display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)',
          gap: isMobile ? '10px' : '16px', marginBottom: '24px'
        }}>
          <div style={{ background: foodCostMoyen ? fichesFCColor(foodCostMoyen).bg : c.blanc, borderRadius: '12px', padding: isMobile ? '14px' : '20px', border: `0.5px solid ${c.bordure}` }}>
            <div style={{ fontSize: '11px', color: c.texteMuted, fontWeight: '500', textTransform: 'uppercase', marginBottom: '8px' }}>Food cost moyen</div>
            <div style={{ fontSize: isMobile ? '28px' : '36px', fontWeight: '500', color: foodCostMoyen ? fichesFCColor(foodCostMoyen).color : c.texte }}>
              {foodCostMoyen ? `${foodCostMoyen.toFixed(1)}%` : '—'}
            </div>
            <div style={{ fontSize: '11px', color: c.texteMuted, marginTop: '4px' }}>Sur {fichesAvecFC.length} fiches</div>
          </div>
          <div style={{ background: c.blanc, borderRadius: '12px', padding: isMobile ? '14px' : '20px', border: `0.5px solid ${c.bordure}`, cursor: 'pointer' }} onClick={() => router.push('/fiches')}>
            <div style={{ fontSize: '11px', color: c.texteMuted, fontWeight: '500', textTransform: 'uppercase', marginBottom: '8px' }}>Fiches actives</div>
            <div style={{ fontSize: isMobile ? '28px' : '36px', fontWeight: '500', color: c.texte }}>{fiches.length}</div>
            <div style={{ fontSize: '11px', color: c.texteMuted, marginTop: '4px' }}>{menus.length} menu{menus.length > 1 ? 's' : ''}</div>
          </div>
          <div style={{ background: fichesAlerte.length > 0 ? '#FCEBEB' : '#EAF3DE', borderRadius: '12px', padding: isMobile ? '14px' : '20px', border: `0.5px solid ${c.bordure}` }}>
            <div style={{ fontSize: '11px', color: c.texteMuted, fontWeight: '500', textTransform: 'uppercase', marginBottom: '8px' }}>Fiches en alerte</div>
            <div style={{ fontSize: isMobile ? '28px' : '36px', fontWeight: '500', color: fichesAlerte.length > 0 ? '#A32D2D' : '#3B6D11' }}>{fichesAlerte.length}</div>
            <div style={{ fontSize: '11px', color: c.texteMuted, marginTop: '4px' }}>Food cost {'>'} {seuilOrange}%</div>
          </div>
          <div style={{ background: ingredientsPrixHausse.length > 0 ? '#FAEEDA' : c.blanc, borderRadius: '12px', padding: isMobile ? '14px' : '20px', border: `0.5px solid ${c.bordure}` }}>
            <div style={{ fontSize: '11px', color: c.texteMuted, fontWeight: '500', textTransform: 'uppercase', marginBottom: '8px' }}>Prix modifiés</div>
            <div style={{ fontSize: isMobile ? '28px' : '36px', fontWeight: '500', color: ingredientsPrixHausse.length > 0 ? '#854F0B' : c.texte }}>{ingredientsPrixHausse.length}</div>
            <div style={{ fontSize: '11px', color: c.texteMuted, marginTop: '4px' }}>Ingrédients récents</div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: isMobile ? '12px' : '16px', marginBottom: '16px' }}>
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
                    <div key={fiche.id} onClick={() => router.push(`/fiches/${fiche.id}`)}
                      style={{ padding: '12px 20px', cursor: 'pointer', borderBottom: i < fichesAlerte.length - 1 ? `0.5px solid ${c.bordure}` : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: c.blanc }}
                      onMouseEnter={e => e.currentTarget.style.background = c.fond}
                      onMouseLeave={e => e.currentTarget.style.background = c.blanc}
                    >
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: '500', color: c.texte }}>{fiche.nom}</div>
                        <div style={{ fontSize: '11px', color: c.texteMuted, marginTop: '2px' }}>{fiche.categorie}</div>
                      </div>
                      <span style={{ background: '#FCEBEB', color: '#A32D2D', borderRadius: '20px', padding: '3px 10px', fontSize: '12px', fontWeight: '600' }}>{fc.toFixed(1)}%</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
          <div style={{ background: c.blanc, borderRadius: '12px', border: `0.5px solid ${c.bordure}`, overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: `0.5px solid ${c.bordure}` }}>
              <div style={{ fontSize: '13px', fontWeight: '500', color: c.texte }}>📊 Fiches par espace</div>
            </div>
            <div style={{ padding: '16px 20px' }}>
              {fichesByCategorie.map(({ cat, nb }) => (
                <div key={cat} style={{ marginBottom: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontSize: '12px', color: c.texte, fontWeight: '500' }}>{cat}</span>
                    <span style={{ fontSize: '12px', color: c.texteMuted }}>{nb}</span>
                  </div>
                  <div style={{ background: c.fond, borderRadius: '20px', height: '6px', overflow: 'hidden' }}>
                    <div style={{ background: c.accent, height: '100%', borderRadius: '20px', width: `${(nb / maxFiches) * 100}%`, transition: 'width 0.5s ease' }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* SECTION PRIX MODIFIÉS RÉTRACTABLE */}
        {ingredientsPrixHausse.length > 0 && (
          <div style={{ background: c.blanc, borderRadius: '12px', border: `0.5px solid ${c.bordure}`, overflow: 'hidden', marginBottom: '16px' }}>
            <div onClick={() => setIsPrixExpanded(!isPrixExpanded)} style={{
              padding: '16px 20px',
              borderBottom: isPrixExpanded ? `0.5px solid ${c.bordure}` : 'none',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              cursor: 'pointer',
              background: isPrixExpanded ? c.fond + '40' : c.blanc,
              transition: 'background 0.2s ease'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ fontSize: '13px', fontWeight: '500', color: c.texte }}>📈 Ingrédients avec prix modifiés récemment</div>
                <span style={{ background: '#FAEEDA', color: '#854F0B', borderRadius: '20px', padding: '2px 10px', fontSize: '11px', fontWeight: '600' }}>
                  {ingredientsPrixHausse.length} alertes
                </span>
              </div>
              <div style={{ fontSize: '16px', color: c.texteMuted, fontWeight: '300' }}>
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

        {/* Tableau allergènes */}
        <div style={{ background: c.blanc, borderRadius: '12px', border: `0.5px solid ${c.bordure}`, overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: `0.5px solid ${c.bordure}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ fontSize: '13px', fontWeight: '500', color: c.texte }}>⚠️ Tableau des allergènes</div>
              <span style={{ background: '#FCEBEB', color: '#A32D2D', borderRadius: '20px', padding: '2px 8px', fontSize: '11px', fontWeight: '500' }}>
                {fichesAvecAllergenes.length} fiche{fichesAvecAllergenes.length > 1 ? 's' : ''}
              </span>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              <select value={filtreCategorie} onChange={e => setFiltreCategorie(e.target.value)} style={{
                padding: '6px 10px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`,
                fontSize: '12px', background: c.blanc, outline: 'none', color: c.texte, cursor: 'pointer'
              }}>
                <option value="toutes">Toutes les catégories</option>
                {theme.categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
              </select>
              <select value={filtreSaison} onChange={e => setFiltreSaison(e.target.value)} style={{
                padding: '6px 10px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`,
                fontSize: '12px', background: c.blanc, outline: 'none', color: c.texte, cursor: 'pointer'
              }}>
                <option value="toutes">Toutes les saisons</option>
                {theme.saisons.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <button onClick={exportAllergenesExcel} style={{ padding: '6px 12px', background: c.vert, color: 'white', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>📊 Excel</button>
              <button onClick={() => window.print()} style={{ padding: '6px 12px', background: c.accent, color: c.principal, border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>🖨️ Imprimer</button>
            </div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', minWidth: '900px' }}>
              <thead>
                <tr style={{ background: c.principal }}>
                  <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: '11px', color: c.accent, fontWeight: '500', textTransform: 'uppercase', position: 'sticky', left: 0, background: c.principal, zIndex: 1, minWidth: '160px' }}>
                    Fiche / Catégorie
                  </th>
                  {ALLERGENES.map(a => (
                    <th key={a.id} style={{ padding: '8px 4px', textAlign: 'center', fontSize: '10px', color: c.accent, fontWeight: '500', minWidth: '52px' }}>
                      <div style={{ fontSize: '14px' }}>{a.emoji}</div>
                      <div style={{ fontSize: '8px', textTransform: 'uppercase', letterSpacing: '0.5px', lineHeight: '1.2', marginTop: '2px' }}>{a.label}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {fichesFiltreesAllergenes.map((fiche, i) => (
                  <tr key={fiche.id} style={{ borderBottom: `0.5px solid ${c.bordure}`, background: i % 2 === 0 ? c.blanc : c.fond }}>
                    <td style={{ padding: '10px 12px', position: 'sticky', left: 0, background: i % 2 === 0 ? c.blanc : c.fond, zIndex: 1 }}>
                      <div style={{ fontWeight: '500', color: c.texte, fontSize: '13px' }}>{fiche.nom}</div>
                      <div style={{ fontSize: '11px', color: c.texteMuted, marginTop: '2px' }}>{fiche.categorie}</div>
                    </td>
                    {ALLERGENES.map(a => (
                      <td key={a.id} style={{ padding: '8px 4px', textAlign: 'center' }}>
                        {fiche.allergenes?.includes(a.id) ? (
                          <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: '#FCEBEB', border: '1.5px solid #A32D2D', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto', fontSize: '10px', color: '#A32D2D', fontWeight: '700' }}>✓</div>
                        ) : (
                          <div style={{ width: '20px', height: '20px', margin: '0 auto', opacity: 0.15, fontSize: '12px', textAlign: 'center', color: c.bordure }}>—</div>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
                {fichesFiltreesAllergenes.length === 0 && (
                  <tr>
                    <td colSpan={ALLERGENES.length + 1} style={{ padding: '30px', textAlign: 'center', color: c.texteMuted, fontSize: '13px' }}>
                      Aucune fiche avec allergènes
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Version impression */}
      <div className="print-only dashboard-allergenes-print" style={{ fontFamily: 'sans-serif', color: '#1a1a1a', background: 'white', padding: '0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #2C1810', paddingBottom: '12px', marginBottom: '16px' }}>
          <div>
            <div style={{ fontSize: '8px', letterSpacing: '3px', textTransform: 'uppercase', color: '#8B7355', marginBottom: '4px' }}>Tableau des allergènes — Fiches actives</div>
            <div style={{ fontSize: '18px', fontWeight: '600', color: '#2C1810', fontFamily: 'Georgia, serif' }}>{params['nom_etablissement'] || 'La Fantaisie'}</div>
            <div style={{ fontSize: '9px', color: '#8B7355', marginTop: '2px' }}>Imprimé le {today} — {fichesFiltreesAllergenes.length} fiche{fichesFiltreesAllergenes.length > 1 ? 's' : ''}</div>
          </div>
          <img
            src={params['logo_url'] || '/skalcook_logo.svg'}
            alt={params['nom_etablissement'] || 'Skalcook'}
            style={{ height: '60px', objectFit: 'contain' }}
          />
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9px', tableLayout: 'fixed' }}>
          <thead>
            <tr style={{ background: '#2C1810' }}>
              <th style={{ padding: '6px 8px', textAlign: 'left', color: '#C4956A', fontWeight: '600', fontSize: '9px', textTransform: 'uppercase', width: '140px', wordWrap: 'break-word' }}>Fiche</th>
              {ALLERGENES.map(a => (
                <th key={a.id} style={{ padding: '4px 2px', textAlign: 'center', color: '#C4956A', fontWeight: '600', fontSize: '7px', textTransform: 'uppercase', lineHeight: '1.2' }}>
                  <div style={{ fontSize: '10px' }}>{a.emoji}</div>
                  <div style={{ fontSize: '6px', marginTop: '1px' }}>{a.label.replace('Céréales/Gluten', 'Gluten').replace('Graines de sésame', 'Sésame').replace('Anhydride sulfureux', 'Sulfites').replace('Fruits à coque', 'F. à coque')}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {fichesFiltreesAllergenes.map((fiche, i) => (
              <tr key={fiche.id} style={{ background: i % 2 === 0 ? 'white' : '#FAF9F6', borderBottom: '0.5px solid #e8e4dc' }}>
                <td style={{ padding: '5px 8px', fontWeight: '500', color: '#2C1810', fontSize: '9px', wordWrap: 'break-word' }}>
                  {fiche.nom}
                  <div style={{ fontSize: '7px', color: '#8B7355', marginTop: '1px' }}>{fiche.categorie}</div>
                </td>
                {ALLERGENES.map(a => (
                  <td key={a.id} style={{ padding: '4px 2px', textAlign: 'center' }}>
                    {fiche.allergenes?.includes(a.id) ? (
                      <div style={{ width: '14px', height: '14px', borderRadius: '50%', background: '#FCEBEB', border: '1px solid #A32D2D', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto', fontSize: '8px', color: '#A32D2D', fontWeight: '700' }}>✓</div>
                    ) : (
                      <div style={{ color: '#ddd', fontSize: '8px', textAlign: 'center' }}>·</div>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ marginTop: '10px', borderTop: '1px solid #e8e4dc', paddingTop: '8px', fontSize: '7px', color: '#8B7355' }}>
          <strong>Allergènes :</strong> {ALLERGENES.map(a => `${a.emoji} ${a.label}`).join(' — ')}
        </div>
      </div>
    </div>
  )
}
