'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useRouter } from 'next/navigation'
import { theme, Logo } from '../../lib/theme.jsx'
import * as XLSX from 'xlsx'

export default function RecapPage() {
  const [fiches, setFiches] = useState([])
  const [menus, setMenus] = useState([])
  const [loading, setLoading] = useState(true)
  const [saisonFiltree, setSaisonFiltree] = useState('toutes')
  const [categorieOuverte, setCategorieOuverte] = useState(null)
  const router = useRouter()
  const c = theme.couleurs

  useEffect(() => {
    checkUser()
    loadData()
  }, [])

  const checkUser = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) router.push('/')
  }

  const loadData = async () => {
    const { data: fichesData } = await supabase
      .from('fiches')
      .select('*')
      .neq('categorie', 'Sous-fiche')
      .order('nom')

    const { data: menusData } = await supabase
      .from('menus')
      .select(`*, menu_fiches(id, service, fiches(id, nom, cout_portion))`)
      .order('nom')

    setFiches(fichesData || [])
    setMenus(menusData || [])
    setLoading(false)
  }

  const fichesFiltrees = fiches.filter(f =>
    saisonFiltree === 'toutes' || f.saison === saisonFiltree
  )

  const menusFiltres = menus.filter(m =>
    saisonFiltree === 'toutes' || m.saison === saisonFiltree
  )

  const moyenne = (arr) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0

  const statsCategorie = (cat) => {
    const lignes = cat === 'Menus'
      ? menusFiltres
      : fichesFiltrees.filter(f => f.categorie === cat)

    if (lignes.length === 0) return null

    if (cat === 'Menus') {
      const couts = lignes.map(m => {
        if (!m.menu_fiches) return 0
        return m.menu_fiches.reduce((t, mf) => t + (mf.fiches?.cout_portion || 0), 0)
      }).filter(v => v > 0)

      const prixHTs = lignes.filter(m => m.prix_vente).map(m => m.prix_vente / 1.10)
      const prixTTCs = lignes.filter(m => m.prix_vente).map(m => m.prix_vente)
      const benefices = lignes.filter(m => m.prix_vente).map(m => {
        const cout = m.menu_fiches?.reduce((t, mf) => t + (mf.fiches?.cout_portion || 0), 0) || 0
        return (m.prix_vente / 1.10) - cout
      })
      const ratios = lignes.filter(m => m.prix_vente).map(m => {
        const cout = m.menu_fiches?.reduce((t, mf) => t + (mf.fiches?.cout_portion || 0), 0) || 0
        if (!cout) return null
        return cout / (m.prix_vente / 1.10) * 100
      }).filter(v => v !== null)

      return {
        nb: lignes.length,
        coutMoyen: moyenne(couts),
        prixHTMoyen: moyenne(prixHTs),
        prixTTCMoyen: moyenne(prixTTCs),
        beneficeMoyen: moyenne(benefices),
        ratioMoyen: moyenne(ratios)
      }
    }

    const couts = lignes.filter(f => f.cout_portion).map(f => f.cout_portion)
    const prixHTs = lignes.filter(f => f.prix_ttc).map(f => f.prix_ttc / 1.10)
    const prixTTCs = lignes.filter(f => f.prix_ttc).map(f => f.prix_ttc)
    const benefices = lignes.filter(f => f.prix_ttc && f.cout_portion).map(f => (f.prix_ttc / 1.10) - f.cout_portion)
    const ratios = lignes.filter(f => f.prix_ttc && f.cout_portion).map(f => f.cout_portion / (f.prix_ttc / 1.10) * 100)

    return {
      nb: lignes.length,
      coutMoyen: moyenne(couts),
      prixHTMoyen: moyenne(prixHTs),
      prixTTCMoyen: moyenne(prixTTCs),
      beneficeMoyen: moyenne(benefices),
      ratioMoyen: moyenne(ratios)
    }
  }

  const fcColor = (fc) => {
    if (!fc) return c.texteMuted
    if (fc < 30) return '#3B6D11'
    if (fc < 40) return '#854F0B'
    return '#A32D2D'
  }

  const fcBg = (fc) => {
    if (!fc) return 'transparent'
    if (fc < 30) return '#EAF3DE'
    if (fc < 40) return '#FAEEDA'
    return '#FCEBEB'
  }

  const exportExcel = () => {
    const wb = XLSX.utils.book_new()

    const rowsRecap = [...theme.categories, 'Menus'].map(cat => {
      const stats = statsCategorie(cat)
      if (!stats) return null
      return {
        'Catégorie': cat,
        'Nb fiches': stats.nb,
        'Coût moyen / portion (€)': stats.coutMoyen.toFixed(2),
        'Prix HT moyen (€)': stats.prixHTMoyen.toFixed(2),
        'Prix TTC moyen (€)': stats.prixTTCMoyen.toFixed(2),
        'Bénéfice moyen (€)': stats.beneficeMoyen.toFixed(2),
        'Ratio moyen (%)': stats.ratioMoyen.toFixed(1)
      }
    }).filter(Boolean)

    const wsRecap = XLSX.utils.json_to_sheet(rowsRecap)
    XLSX.utils.book_append_sheet(wb, wsRecap, 'Récapitulatif')

    theme.categories.forEach(cat => {
      const lignes = fichesFiltrees.filter(f => f.categorie === cat)
      if (!lignes.length) return
      const rows = lignes.map(f => ({
        'Nom': f.nom,
        'Saison': f.saison || '—',
        'Coût / portion (€)': f.cout_portion ? Number(f.cout_portion).toFixed(2) : '—',
        'Prix HT (€)': f.prix_ttc ? (f.prix_ttc / 1.10).toFixed(2) : '—',
        'Prix TTC (€)': f.prix_ttc ? Number(f.prix_ttc).toFixed(2) : '—',
        'Bénéfice (€)': f.prix_ttc && f.cout_portion ? ((f.prix_ttc / 1.10) - f.cout_portion).toFixed(2) : '—',
        'Food cost (%)': f.prix_ttc && f.cout_portion ? (f.cout_portion / (f.prix_ttc / 1.10) * 100).toFixed(1) : '—'
      }))
      const ws = XLSX.utils.json_to_sheet(rows)
      XLSX.utils.book_append_sheet(wb, ws, cat.substring(0, 31))
    })

    XLSX.writeFile(wb, `recap_la_fantaisie_${new Date().toLocaleDateString('fr-FR').replace(/\//g, '-')}.xlsx`)
  }

  const colonnes = ['Catégorie', 'Nb fiches', 'Coût moy./portion', 'Prix HT moy.', 'Prix TTC moy.', 'Bénéfice moy.', 'Ratio moy.']

  const DetailFiches = ({ cat }) => {
    const lignes = cat === 'Menus'
      ? menusFiltres
      : fichesFiltrees.filter(f => f.categorie === cat)

    if (!lignes.length) return null

    return (
      <tr>
        <td colSpan={7} style={{ padding: '0', background: c.fond }}>
          <div style={{ padding: '12px 16px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr>
                  {['Nom', 'Saison', 'Coût / portion', 'Prix HT', 'Prix TTC', 'Bénéfice', 'Food cost'].map(h => (
                    <th key={h} style={{
                      padding: '6px 10px', textAlign: h === 'Nom' ? 'left' : 'right',
                      color: c.texteMuted, fontWeight: '500', fontSize: '11px',
                      textTransform: 'uppercase', borderBottom: `0.5px solid ${c.bordure}`
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lignes.map((item, i) => {
                  const cout = cat === 'Menus'
                    ? (item.menu_fiches?.reduce((t, mf) => t + (mf.fiches?.cout_portion || 0), 0) || 0)
                    : item.cout_portion
                  const prixTTC = cat === 'Menus' ? item.prix_vente : item.prix_ttc
                  const prixHT = prixTTC ? prixTTC / 1.10 : null
                  const benefice = prixHT && cout ? prixHT - cout : null
                  const fc = prixHT && cout ? (cout / prixHT * 100).toFixed(1) : null

                  return (
                    <tr
                      key={item.id}
                      style={{ borderBottom: i < lignes.length - 1 ? `0.5px solid ${c.bordure}` : 'none', cursor: cat !== 'Menus' ? 'pointer' : 'default', background: 'white' }}
                      onClick={() => cat !== 'Menus' && router.push(`/fiches/${item.id}`)}
                      onMouseEnter={e => { if (cat !== 'Menus') e.currentTarget.style.background = c.accentClair }}
                      onMouseLeave={e => e.currentTarget.style.background = 'white'}
                    >
                      <td style={{ padding: '8px 10px', fontWeight: '500', color: c.texte }}>{item.nom}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', color: c.texteMuted }}>{item.saison || '—'}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', color: c.texte }}>{cout ? `${Number(cout).toFixed(2)} €` : '—'}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', color: c.texte }}>{prixHT ? `${prixHT.toFixed(2)} €` : '—'}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', color: c.texte }}>{prixTTC ? `${Number(prixTTC).toFixed(2)} €` : '—'}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', color: benefice ? (benefice > 0 ? '#3B6D11' : '#A32D2D') : c.texteMuted }}>
                        {benefice ? `${benefice.toFixed(2)} €` : '—'}
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                        {fc ? (
                          <span style={{ background: fcBg(fc), color: fcColor(fc), borderRadius: '20px', padding: '2px 8px', fontSize: '11px', fontWeight: '500' }}>
                            {fc} %
                          </span>
                        ) : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </td>
      </tr>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: c.fond }}>

      <div className="no-print" style={{
        background: c.principal, borderBottom: `0.5px solid ${c.accent}40`,
        padding: '0 24px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', height: '56px'
      }}>
        <Logo height={30} couleur="white" />
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button onClick={exportExcel} style={{
            background: c.vert, color: 'white', border: 'none',
            borderRadius: '8px', padding: '8px 16px', fontSize: '13px',
            fontWeight: '600', cursor: 'pointer'
          }}>Export Excel</button>
          <button onClick={() => router.push('/fiches')} style={{
            background: 'transparent', color: 'rgba(255,255,255,0.7)',
            border: '0.5px solid rgba(255,255,255,0.2)',
            borderRadius: '8px', padding: '8px 16px', fontSize: '13px', cursor: 'pointer'
          }}>← Retour</button>
        </div>
      </div>

      <div style={{ padding: '24px', maxWidth: '1100px', margin: '0 auto' }}>

        <div className="no-print" style={{ display: 'flex', gap: '10px', marginBottom: '24px', alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '13px', color: c.texteMuted }}>Filtrer par saison :</span>
          <select
            value={saisonFiltree}
            onChange={e => setSaisonFiltree(e.target.value)}
            style={{
              padding: '8px 14px', borderRadius: '8px',
              border: `0.5px solid ${c.bordure}`, fontSize: '13px',
              background: 'white', outline: 'none', color: c.texte, cursor: 'pointer'
            }}
          >
            <option value="toutes">Toutes les saisons</option>
            {theme.saisons.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <span style={{ fontSize: '12px', color: c.texteMuted }}>
            {fichesFiltrees.length} fiche{fichesFiltrees.length > 1 ? 's' : ''} + {menusFiltres.length} menu{menusFiltres.length > 1 ? 's' : ''}
          </span>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px', color: c.texteMuted }}>Chargement...</div>
        ) : (
          <div style={{ background: 'white', borderRadius: '12px', border: `0.5px solid ${c.bordure}`, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: c.principal }}>
                  {colonnes.map(col => (
                    <th key={col} style={{
                      padding: '12px 16px', textAlign: col === 'Catégorie' ? 'left' : 'right',
                      fontSize: '11px', color: c.accent, fontWeight: '500',
                      textTransform: 'uppercase', letterSpacing: '0.04em'
                    }}>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...theme.categories, 'Menus'].map((cat, i) => {
                  const stats = statsCategorie(cat)
                  if (!stats) return null
                  const isOpen = categorieOuverte === cat
                  const isMenuCat = cat === 'Menus'

                  return (
                    <>
                      <tr
                        key={cat}
                        onClick={() => setCategorieOuverte(isOpen ? null : cat)}
                        style={{
                          borderBottom: `0.5px solid ${c.bordure}`,
                          cursor: 'pointer',
                          background: isOpen ? c.accentClair : 'white'
                        }}
                        onMouseEnter={e => { if (!isOpen) e.currentTarget.style.background = c.fond }}
                        onMouseLeave={e => { if (!isOpen) e.currentTarget.style.background = 'white' }}
                      >
                        <td style={{ padding: '14px 16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span style={{
                              background: isMenuCat ? c.accentClair : c.violetClair,
                              color: isMenuCat ? c.principal : '#3C3489',
                              borderRadius: '20px', padding: '3px 12px',
                              fontSize: '12px', fontWeight: '500'
                            }}>{cat}</span>
                            <span style={{ fontSize: '11px', color: c.texteMuted }}>{stats.nb} fiche{stats.nb > 1 ? 's' : ''}</span>
                            <span style={{ fontSize: '11px', color: c.accent, marginLeft: 'auto' }}>
                              {isOpen ? '▲' : '▼'}
                            </span>
                          </div>
                        </td>
                        <td style={{ padding: '14px 16px', textAlign: 'right', color: c.texte }}>{stats.nb}</td>
                        <td style={{ padding: '14px 16px', textAlign: 'right', color: c.texte }}>{stats.coutMoyen.toFixed(2)} €</td>
                        <td style={{ padding: '14px 16px', textAlign: 'right', color: c.texte }}>{stats.prixHTMoyen.toFixed(2)} €</td>
                        <td style={{ padding: '14px 16px', textAlign: 'right', color: c.texte }}>{stats.prixTTCMoyen.toFixed(2)} €</td>
                        <td style={{ padding: '14px 16px', textAlign: 'right', color: stats.beneficeMoyen > 0 ? '#3B6D11' : '#A32D2D', fontWeight: '500' }}>
                          {stats.beneficeMoyen.toFixed(2)} €
                        </td>
                        <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                          <span style={{
                            background: fcBg(stats.ratioMoyen),
                            color: fcColor(stats.ratioMoyen),
                            borderRadius: '20px', padding: '3px 10px',
                            fontSize: '12px', fontWeight: '500'
                          }}>{stats.ratioMoyen.toFixed(1)} %</span>
                        </td>
                      </tr>
                      {isOpen && <DetailFiches key={`detail-${cat}`} cat={cat} />}
                    </>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
