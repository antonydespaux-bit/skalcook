'use client'
import { useState, useEffect } from 'react'
import { supabase, getClientId } from '../lib/supabase'
import { useRouter } from 'next/navigation'
import { theme } from '../lib/theme.jsx'
import { useIsMobile } from '../lib/useIsMobile'
import { useTheme } from '../lib/useTheme'
import { useRole } from '../lib/useRole'
import { log } from '../lib/useLog'
import * as XLSX from 'xlsx'
import Navbar from './Navbar'

const CATEGORIES_ALCOOL = ['Cocktails', 'Vins', 'Champagnes', 'Bières', 'Spiritueux']

const SECTION_CONFIG = {
  cuisine: {
    fichesTable: 'fiches',
    sectionFilter: 'cuisine',
    allowedRoles: ['admin', 'cuisine', 'directeur'],
    modifierRoles: ['admin', 'cuisine'],
    redirectOnDeny: '/bar/dashboard',
    ficheUrlPrefix: '/fiches',
    exportPrefix: 'recap',
    categoryIcon: '🍽',
    hasMenus: true,
    tvaFn: () => 1.10,
    fcThresholds: { vert: 30, orange: 40 },
    loadExtraFilter: null,
    colors: {
      lieuBg: '#FAECE7', lieuColor: '#993C1D',
      catBg: '#E1F5EE', catColor: '#085041',
      archiveBtnBg: '#DC2626',
      archiveBannerBg: '#FEE2E2', archiveBannerBorder: '#FECACA', archiveBannerColor: '#DC2626',
      accentCheckbox: '#DC2626',
    },
  },
  bar: {
    fichesTable: 'fiches_bar',
    sectionFilter: 'bar',
    allowedRoles: ['admin', 'bar', 'directeur'],
    modifierRoles: ['admin', 'bar'],
    redirectOnDeny: '/dashboard',
    ficheUrlPrefix: '/bar/fiches',
    exportPrefix: 'recap_bar',
    categoryIcon: '🍷',
    hasMenus: false,
    tvaFn: (fiche) => CATEGORIES_ALCOOL.includes(fiche?.categorie) ? 1.20 : 1.10,
    fcThresholds: { vert: 22, orange: 28 },
    loadExtraFilter: (q) => q.neq('categorie', 'Sous-fiche'),
    colors: {
      lieuBg: '#EEEDFE', lieuColor: '#3C3489',
      catBg: '#EDE9FE', catColor: '#3C3489',
      archiveBtnBg: '#7C3AED',
      archiveBannerBg: '#EDE9FE', archiveBannerBorder: '#DDD6FE', archiveBannerColor: '#7C3AED',
      accentCheckbox: '#7C3AED',
    },
  },
}

export default function RecapView({ section = 'cuisine' }) {
  const cfg = SECTION_CONFIG[section]
  const [fiches, setFiches] = useState([])
  const [menus, setMenus] = useState([])
  const [lieux, setLieux] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [vue, setVue] = useState('lieu')
  const [saisonFiltree, setSaisonFiltree] = useState('toutes')
  const [filtreLieu, setFiltreLieu] = useState('')
  const [filtreCat, setFiltreCat] = useState('')
  const [ouvert, setOuvert] = useState(null)
  const [ouvertLieu, setOuvertLieu] = useState(null)
  const [modifArchive, setModifArchive] = useState({})
  const [saving, setSaving] = useState(false)
  const router = useRouter()
  const isMobile = useIsMobile()
  const { c } = useTheme()
  const { role, loading: roleLoading } = useRole()
  const peutModifier = cfg.modifierRoles.includes(role)

  useEffect(() => { checkUser(); loadData() }, [])
  useEffect(() => {
    if (!roleLoading && role && !cfg.allowedRoles.includes(role)) {
      router.push(cfg.redirectOnDeny)
    }
  }, [role, roleLoading])

  const checkUser = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) router.push('/')
    } catch { router.push('/') }
  }

  const loadData = async () => {
    try {
      const clientId = await getClientId()
      if (!clientId) { router.push('/'); return }
      let fichesQuery = supabase.from(cfg.fichesTable)
        .select('*, lieux(id,nom,emoji), categories_plats(id,nom,emoji)')
        .eq('client_id', clientId).eq('archive', false).order('nom')
      if (cfg.loadExtraFilter) fichesQuery = cfg.loadExtraFilter(fichesQuery)

      const promises = [
        fichesQuery,
        supabase.from('lieux').select('*').eq('client_id', clientId).eq('section', cfg.sectionFilter).order('ordre'),
        supabase.from('categories_plats').select('*').eq('client_id', clientId).eq('section', cfg.sectionFilter).order('ordre'),
      ]
      if (cfg.hasMenus) {
        promises.push(supabase.from('menus').select('*, menu_fiches(id, service, fiches(id, nom, cout_portion))')
          .eq('client_id', clientId).eq('archive', false).order('nom'))
      }
      const results = await Promise.all(promises)
      setFiches(results[0].data || [])
      setLieux(results[1].data || [])
      setCategories(results[2].data || [])
      if (cfg.hasMenus) setMenus(results[3].data || [])
      setModifArchive({})
    } catch (err) { console.error('Load error:', err) }
    finally { setLoading(false) }
  }

  const fichesFiltrees = fiches.filter(f => {
    if (saisonFiltree !== 'toutes' && f.saison !== saisonFiltree) return false
    if (filtreLieu && f.lieu_id !== filtreLieu) return false
    if (filtreCat && f.categorie_plat_id !== filtreCat) return false
    return true
  })
  const menusFiltres = cfg.hasMenus ? menus.filter(m => saisonFiltree === 'toutes' || m.saison === saisonFiltree) : []
  const moyenne = (arr) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0

  const statsListe = (liste) => {
    if (!liste.length) return null
    const couts = liste.filter(f => f.cout_portion > 0).map(f => Number(f.cout_portion))
    const prixHTs = liste.filter(f => f.prix_ttc).map(f => f.prix_ttc / cfg.tvaFn(f))
    const prixTTCs = liste.filter(f => f.prix_ttc).map(f => Number(f.prix_ttc))
    const benefices = liste.filter(f => f.prix_ttc && f.cout_portion).map(f => (f.prix_ttc / cfg.tvaFn(f)) - Number(f.cout_portion))
    const ratios = liste.filter(f => f.prix_ttc && f.cout_portion).map(f => Number(f.cout_portion) / (f.prix_ttc / cfg.tvaFn(f)) * 100)
    return { nb: liste.length, coutMoyen: moyenne(couts), prixHTMoyen: moyenne(prixHTs), prixTTCMoyen: moyenne(prixTTCs), beneficeMoyen: moyenne(benefices), ratioMoyen: moyenne(ratios) }
  }

  const fcColor = (fc) => { if (!fc) return c.texteMuted; if (fc < cfg.fcThresholds.vert) return '#3B6D11'; if (fc < cfg.fcThresholds.orange) return '#854F0B'; return '#A32D2D' }
  const fcBg = (fc) => { if (!fc) return 'transparent'; if (fc < cfg.fcThresholds.vert) return '#EAF3DE'; if (fc < cfg.fcThresholds.orange) return '#FAEEDA'; return '#FCEBEB' }

  const toggleArchive = (id) => setModifArchive(prev => ({ ...prev, [id]: !prev[id] }))
  const nbArchives = Object.values(modifArchive).filter(Boolean).length

  const sauvegarderArchives = async () => {
    setSaving(true)
    try {
      const clientId = await getClientId()
      const ids = Object.keys(modifArchive).filter(id => modifArchive[id])
      const idsFiches = ids.filter(id => fiches.find(f => f.id === id))
      if (idsFiches.length > 0) await supabase.from(cfg.fichesTable).update({ archive: true }).in('id', idsFiches).eq('client_id', clientId)
      if (cfg.hasMenus) {
        const idsMenus = ids.filter(id => menus.find(m => m.id === id))
        if (idsMenus.length > 0) await supabase.from('menus').update({ archive: true }).in('id', idsMenus).eq('client_id', clientId)
      }
      await log({ action: 'ARCHIVAGE', entite: cfg.fichesTable, entite_id: ids[0], entite_nom: `${ids.length} élément(s)`, section, details: 'Archivage récap' })
      await loadData()
    } catch (err) { console.error(err); alert('Erreur archivage') }
    finally { setSaving(false) }
  }

  const exportExcel = () => {
    const wb = XLSX.utils.book_new()
    const rowsGlobal = lieux.map(lieu => {
      const lignes = fichesFiltrees.filter(f => f.lieu_id === lieu.id)
      const stats = statsListe(lignes)
      if (!stats) return null
      return { 'Lieu': `${lieu.emoji} ${lieu.nom}`, 'Nb fiches': stats.nb, 'Food cost moyen (%)': stats.ratioMoyen.toFixed(1), 'Bénéfice moyen (€)': stats.beneficeMoyen.toFixed(2) }
    }).filter(Boolean)
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rowsGlobal), 'Récap par lieu')
    const rowsDetail = fichesFiltrees.map(f => {
      const tva = cfg.tvaFn(f)
      const tvaPercent = Math.round((tva - 1) * 100)
      const prixHT = f.prix_ttc ? (f.prix_ttc / tva) : null
      return {
        'Nom': f.nom, 'Lieu': f.lieux?.nom || '—', 'Catégorie': f.categories_plats?.nom || f.categorie || '—',
        'Saison': f.saison || '—',
        'Coût / portion (€)': f.cout_portion ? Number(f.cout_portion).toFixed(2) : '—',
        'Prix HT (€)': prixHT ? prixHT.toFixed(2) : '—',
        'TVA (%)': tvaPercent,
        'Prix TTC (€)': f.prix_ttc ? Number(f.prix_ttc).toFixed(2) : '—',
        'Food cost (%)': prixHT && f.cout_portion ? (f.cout_portion / prixHT * 100).toFixed(1) : '—',
      }
    })
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rowsDetail), 'Détail fiches')
    XLSX.writeFile(wb, `${cfg.exportPrefix}_${new Date().toLocaleDateString('fr-FR').replace(/\//g, '-')}.xlsx`)
  }

  // ── Composant ligne fiche ──────────────────────────────────────────────
  const LigneFiche = ({ item, isMenu = false }) => {
    const tva = cfg.tvaFn(item)
    const cout = isMenu ? (item.menu_fiches?.reduce((t, mf) => t + (mf.fiches?.cout_portion || 0), 0) || 0) : item.cout_portion
    const prixTTC = isMenu ? item.prix_vente : item.prix_ttc
    const prixHT = prixTTC ? prixTTC / tva : null
    const benefice = prixHT && cout ? prixHT - cout : null
    const fc = prixHT && cout ? (cout / prixHT * 100).toFixed(1) : null
    const aArchiver = modifArchive[item.id] || false
    const url = isMenu ? `/menus/${item.id}` : `${cfg.ficheUrlPrefix}/${item.id}`

    return isMobile ? (
      <div style={{ background: aArchiver ? '#FAEEDA' : c.blanc, borderRadius: '8px', padding: '12px', marginBottom: '8px', border: `0.5px solid ${aArchiver ? '#FAC775' : c.bordure}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
          <div style={{ fontSize: '14px', fontWeight: '500', color: c.texte, cursor: 'pointer', flex: 1 }} onClick={() => router.push(url)}>{item.nom}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {fc && <span style={{ background: fcBg(fc), color: fcColor(fc), borderRadius: '20px', padding: '2px 8px', fontSize: '11px', fontWeight: '500' }}>{fc}%</span>}
            {peutModifier && <input type="checkbox" checked={aArchiver} onChange={() => toggleArchive(item.id)} style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: cfg.colors.accentCheckbox }} />}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '12px', fontSize: '12px', color: c.texteMuted, flexWrap: 'wrap' }}>
          {cout ? <span>Coût : {Number(cout).toFixed(2)} €</span> : null}
          {prixTTC ? <span>Prix : {Number(prixTTC).toFixed(2)} €</span> : null}
          {item.saison ? <span>{item.saison}</span> : null}
          {vue === 'categorie' && item.lieux && <span style={{ background: cfg.colors.lieuBg, color: cfg.colors.lieuColor, borderRadius: '20px', padding: '1px 8px', fontSize: '10px' }}>{item.lieux.emoji} {item.lieux.nom}</span>}
        </div>
      </div>
    ) : (
      <tr style={{ borderBottom: `0.5px solid ${c.bordure}`, background: aArchiver ? '#FAEEDA' : c.blanc }}>
        <td style={{ padding: '8px 10px', fontWeight: '500', color: c.texte, cursor: 'pointer' }} onClick={() => router.push(url)}>{item.nom}</td>
        {vue === 'categorie' && (
          <td style={{ padding: '8px 10px' }}>
            {item.lieux && <span style={{ background: cfg.colors.lieuBg, color: cfg.colors.lieuColor, borderRadius: '20px', padding: '2px 8px', fontSize: '11px' }}>{item.lieux.emoji} {item.lieux.nom}</span>}
          </td>
        )}
        <td style={{ padding: '8px 10px', textAlign: 'right', color: c.texteMuted }}>{item.saison || '—'}</td>
        <td style={{ padding: '8px 10px', textAlign: 'right' }}>{cout ? `${Number(cout).toFixed(2)} €` : '—'}</td>
        <td style={{ padding: '8px 10px', textAlign: 'right' }}>{prixHT ? `${prixHT.toFixed(2)} €` : '—'}</td>
        <td style={{ padding: '8px 10px', textAlign: 'right' }}>{prixTTC ? `${Number(prixTTC).toFixed(2)} €` : '—'}</td>
        <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: '500', color: benefice ? (benefice > 0 ? '#3B6D11' : '#A32D2D') : c.texteMuted }}>{benefice ? `${benefice.toFixed(2)} €` : '—'}</td>
        <td style={{ padding: '8px 10px', textAlign: 'right' }}>
          {fc ? <span style={{ background: fcBg(fc), color: fcColor(fc), borderRadius: '20px', padding: '2px 8px', fontSize: '11px', fontWeight: '500' }}>{fc} %</span> : '—'}
        </td>
        {peutModifier && <td style={{ padding: '8px 10px', textAlign: 'right' }}><input type="checkbox" checked={aArchiver} onChange={() => toggleArchive(item.id)} style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: cfg.colors.accentCheckbox }} /></td>}
      </tr>
    )
  }

  const HeadersDetail = ({ avecLieu = false }) => (
    <tr>
      {['Nom', ...(avecLieu ? ['Lieu'] : []), 'Saison', 'Coût / portion', 'Prix HT', 'Prix TTC', 'Bénéfice', 'Food cost', ...(peutModifier ? ['Archiver'] : [])].map(h => (
        <th key={h} style={{ padding: '6px 10px', textAlign: h === 'Nom' || h === 'Lieu' ? 'left' : 'right', color: c.texteMuted, fontWeight: '500', fontSize: '11px', textTransform: 'uppercase', borderBottom: `0.5px solid ${c.bordure}` }}>{h}</th>
      ))}
    </tr>
  )

  const Accordeon = ({ id, badge, stats, fiches: listeFiches, avecLieu = false }) => {
    const isOpen = ouvert === id
    if (!stats) return null
    return (
      <div style={{ marginBottom: '8px' }}>
        <div onClick={() => setOuvert(isOpen ? null : id)} style={{
          background: isOpen ? c.accentClair || cfg.colors.catBg : c.blanc, borderRadius: isOpen ? '12px 12px 0 0' : '12px',
          padding: isMobile ? '14px 16px' : '0', cursor: 'pointer',
          border: `0.5px solid ${c.bordure}`, borderBottom: isOpen ? 'none' : `0.5px solid ${c.bordure}`
        }}>
          {isMobile ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>{badge}<span style={{ fontSize: '11px', color: c.texteMuted }}>{stats.nb} fiche{stats.nb > 1 ? 's' : ''}</span></div>
                <span style={{ fontSize: '11px', color: c.accent }}>{isOpen ? '▲' : '▼'}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                <div><div style={{ fontSize: '10px', color: c.texteMuted, textTransform: 'uppercase' }}>Coût moy.</div><div style={{ fontSize: '13px', fontWeight: '500', color: c.texte }}>{stats.coutMoyen > 0 ? `${stats.coutMoyen.toFixed(2)}€` : '—'}</div></div>
                <div><div style={{ fontSize: '10px', color: c.texteMuted, textTransform: 'uppercase' }}>Prix TTC</div><div style={{ fontSize: '13px', fontWeight: '500', color: c.texte }}>{stats.prixTTCMoyen > 0 ? `${stats.prixTTCMoyen.toFixed(2)}€` : '—'}</div></div>
                <div><div style={{ fontSize: '10px', color: c.texteMuted, textTransform: 'uppercase' }}>Ratio</div><div style={{ fontSize: '13px', fontWeight: '500' }}>{stats.ratioMoyen > 0 ? <span style={{ color: fcColor(stats.ratioMoyen) }}>{stats.ratioMoyen.toFixed(1)}%</span> : '—'}</div></div>
              </div>
            </>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}><tbody><tr>
              <td style={{ padding: '14px 16px', width: '30%' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>{badge}<span style={{ fontSize: '11px', color: c.texteMuted }}>{stats.nb} fiche{stats.nb > 1 ? 's' : ''}</span><span style={{ fontSize: '11px', color: c.accent, marginLeft: 'auto' }}>{isOpen ? '▲' : '▼'}</span></div>
              </td>
              <td style={{ padding: '14px 16px', textAlign: 'right' }}>{stats.nb}</td>
              <td style={{ padding: '14px 16px', textAlign: 'right' }}>{stats.coutMoyen > 0 ? `${stats.coutMoyen.toFixed(2)} €` : '—'}</td>
              <td style={{ padding: '14px 16px', textAlign: 'right' }}>{stats.prixHTMoyen > 0 ? `${stats.prixHTMoyen.toFixed(2)} €` : '—'}</td>
              <td style={{ padding: '14px 16px', textAlign: 'right' }}>{stats.prixTTCMoyen > 0 ? `${stats.prixTTCMoyen.toFixed(2)} €` : '—'}</td>
              <td style={{ padding: '14px 16px', textAlign: 'right', fontWeight: '500', color: stats.beneficeMoyen > 0 ? '#3B6D11' : c.texteMuted }}>{stats.beneficeMoyen !== 0 ? `${stats.beneficeMoyen.toFixed(2)} €` : '—'}</td>
              <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                {stats.ratioMoyen > 0 ? <span style={{ background: fcBg(stats.ratioMoyen), color: fcColor(stats.ratioMoyen), borderRadius: '20px', padding: '3px 10px', fontSize: '12px', fontWeight: '500' }}>{stats.ratioMoyen.toFixed(1)} %</span> : '—'}
              </td>
            </tr></tbody></table>
          )}
        </div>
        {isOpen && (
          <div style={{ border: `0.5px solid ${c.bordure}`, borderTop: 'none', borderRadius: '0 0 12px 12px', overflow: 'hidden', background: c.fond }}>
            {isMobile ? (
              <div style={{ padding: '8px 12px' }}>{listeFiches.map(f => <LigneFiche key={f.id} item={f} />)}</div>
            ) : (
              <div style={{ padding: '12px 16px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead><HeadersDetail avecLieu={avecLieu} /></thead>
                  <tbody>{listeFiches.map(f => <LigneFiche key={f.id} item={f} />)}</tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  const HeaderTable = () => (
    <thead>
      <tr style={{ background: c.principal }}>
        {['Lieu / Catégorie', 'Nb fiches', 'Coût moy./portion', 'Prix HT moy.', 'Prix TTC moy.', 'Bénéfice moy.', 'Ratio moy.'].map(col => (
          <th key={col} style={{ padding: '12px 16px', textAlign: col === 'Lieu / Catégorie' ? 'left' : 'right', fontSize: '11px', color: c.accent, fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{col}</th>
        ))}
      </tr>
    </thead>
  )

  // ── VUE PAR LIEU ──────────────────────────────────────────────────────
  const VueLieu = () => {
    const lieuxAvecFiches = lieux.filter(l => fichesFiltrees.some(f => f.lieu_id === l.id))
    const sanslieu = fichesFiltrees.filter(f => !f.lieu_id)
    return (
      <div>
        {lieuxAvecFiches.map(lieu => {
          const fichesLieu = fichesFiltrees.filter(f => f.lieu_id === lieu.id)
          const catsLieu = categories.filter(cat => fichesLieu.some(f => f.categorie_plat_id === cat.id))
          const isOpenLieu = ouvertLieu === lieu.id
          const statsLieu = statsListe(fichesLieu)
          if (!statsLieu) return null
          return (
            <div key={lieu.id} style={{ marginBottom: '10px' }}>
              <div onClick={() => setOuvertLieu(isOpenLieu ? null : lieu.id)} style={{
                background: isOpenLieu ? cfg.colors.lieuBg : c.blanc, borderRadius: isOpenLieu ? '12px 12px 0 0' : '12px',
                padding: '14px 18px', cursor: 'pointer', border: `0.5px solid ${c.bordure}`,
                borderBottom: isOpenLieu ? 'none' : `0.5px solid ${c.bordure}`,
                display: 'flex', justifyContent: 'space-between', alignItems: 'center'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ background: cfg.colors.lieuBg, color: cfg.colors.lieuColor, borderRadius: '20px', padding: '4px 14px', fontSize: '12px', fontWeight: '500' }}>
                    {lieu.emoji} {lieu.nom}
                  </div>
                  <span style={{ fontSize: '12px', color: c.texteMuted }}>{fichesLieu.length} fiche{fichesLieu.length > 1 ? 's' : ''}</span>
                </div>
                <div style={{ display: 'flex', gap: isMobile ? '12px' : '24px', alignItems: 'center' }}>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '10px', color: c.texteMuted, textTransform: 'uppercase' }}>Food cost moy.</div>
                    <div style={{ fontSize: '15px', fontWeight: '500', color: fcColor(statsLieu.ratioMoyen) }}>{statsLieu.ratioMoyen > 0 ? `${statsLieu.ratioMoyen.toFixed(1)}%` : '—'}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '10px', color: c.texteMuted, textTransform: 'uppercase' }}>Bénéfice moy.</div>
                    <div style={{ fontSize: '15px', fontWeight: '500' }}>{statsLieu.beneficeMoyen > 0 ? `${statsLieu.beneficeMoyen.toFixed(2)} €` : '—'}</div>
                  </div>
                  <span style={{ color: c.texteMuted, fontSize: '13px' }}>{isOpenLieu ? '▼' : '▶'}</span>
                </div>
              </div>
              {isOpenLieu && (
                <div style={{ border: `0.5px solid ${c.bordure}`, borderTop: 'none', borderRadius: '0 0 12px 12px', background: c.fond, padding: '12px' }}>
                  {catsLieu.map(cat => {
                    const fichesCat = fichesLieu.filter(f => f.categorie_plat_id === cat.id)
                    return <Accordeon key={cat.id} id={`${lieu.id}-${cat.id}`} badge={<span style={{ background: cfg.colors.catBg, color: cfg.colors.catColor, borderRadius: '20px', padding: '3px 12px', fontSize: '12px', fontWeight: '500' }}>{cat.emoji} {cat.nom}</span>} stats={statsListe(fichesCat)} fiches={fichesCat} />
                  })}
                  {(() => {
                    const sansCat = fichesLieu.filter(f => !f.categorie_plat_id)
                    if (!sansCat.length) return null
                    return <Accordeon id={`${lieu.id}-sans-cat`} badge={<span style={{ background: c.fond, color: c.texteMuted, borderRadius: '20px', padding: '3px 12px', fontSize: '12px', border: `0.5px solid ${c.bordure}` }}>Sans catégorie</span>} stats={statsListe(sansCat)} fiches={sansCat} />
                  })()}
                </div>
              )}
            </div>
          )
        })}
        {sanslieu.length > 0 && (
          <Accordeon id="sans-lieu" badge={<span style={{ background: c.fond, color: c.texteMuted, borderRadius: '20px', padding: '3px 12px', fontSize: '12px', border: `0.5px solid ${c.bordure}` }}>Sans lieu</span>} stats={statsListe(sanslieu)} fiches={sanslieu} />
        )}
      </div>
    )
  }

  // ── VUE PAR CATÉGORIE ─────────────────────────────────────────────────
  const VueCategorie = () => {
    const catsAvecFiches = categories.filter(cat => fichesFiltrees.some(f => f.categorie_plat_id === cat.id))
    const sansCat = fichesFiltrees.filter(f => !f.categorie_plat_id)
    return (
      <div>
        <div style={{ background: '#FEF3C7', border: '0.5px solid #FDE68A', borderRadius: '8px', padding: '10px 14px', marginBottom: '14px', fontSize: '13px', color: '#92400E' }}>
          Vue globale — toutes les fiches regroupées par type, quel que soit le lieu
        </div>
        {isMobile ? (
          <div>
            {catsAvecFiches.map(cat => {
              const fichesCat = fichesFiltrees.filter(f => f.categorie_plat_id === cat.id)
              return <Accordeon key={cat.id} id={`cat-${cat.id}`} badge={<span style={{ background: cfg.colors.catBg, color: cfg.colors.catColor, borderRadius: '20px', padding: '3px 12px', fontSize: '12px', fontWeight: '500' }}>{cat.emoji} {cat.nom}</span>} stats={statsListe(fichesCat)} fiches={fichesCat} avecLieu={true} />
            })}
            {sansCat.length > 0 && <Accordeon id="cat-sans" badge={<span style={{ background: c.fond, color: c.texteMuted, borderRadius: '20px', padding: '3px 12px', fontSize: '12px', border: `0.5px solid ${c.bordure}` }}>Sans catégorie</span>} stats={statsListe(sansCat)} fiches={sansCat} avecLieu={true} />}
          </div>
        ) : (
          <div style={{ background: c.blanc, borderRadius: '12px', border: `0.5px solid ${c.bordure}`, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <HeaderTable />
              <tbody>
                {catsAvecFiches.map(cat => {
                  const fichesCat = fichesFiltrees.filter(f => f.categorie_plat_id === cat.id)
                  const stats = statsListe(fichesCat)
                  const isOpen = ouvert === `cat-${cat.id}`
                  if (!stats) return null
                  return (
                    <>
                      <tr key={cat.id} onClick={() => setOuvert(isOpen ? null : `cat-${cat.id}`)}
                        style={{ borderBottom: `0.5px solid ${c.bordure}`, cursor: 'pointer', background: isOpen ? cfg.colors.catBg : c.blanc }}
                        onMouseEnter={e => { if (!isOpen) e.currentTarget.style.background = c.fond }}
                        onMouseLeave={e => { if (!isOpen) e.currentTarget.style.background = c.blanc }}>
                        <td style={{ padding: '14px 16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span style={{ background: cfg.colors.catBg, color: cfg.colors.catColor, borderRadius: '20px', padding: '3px 12px', fontSize: '12px', fontWeight: '500' }}>{cat.emoji} {cat.nom}</span>
                            <span style={{ fontSize: '11px', color: c.texteMuted }}>{stats.nb} fiche{stats.nb > 1 ? 's' : ''}</span>
                            <span style={{ fontSize: '11px', color: c.accent, marginLeft: 'auto' }}>{isOpen ? '▲' : '▼'}</span>
                          </div>
                        </td>
                        <td style={{ padding: '14px 16px', textAlign: 'right' }}>{stats.nb}</td>
                        <td style={{ padding: '14px 16px', textAlign: 'right' }}>{stats.coutMoyen > 0 ? `${stats.coutMoyen.toFixed(2)} €` : '—'}</td>
                        <td style={{ padding: '14px 16px', textAlign: 'right' }}>{stats.prixHTMoyen > 0 ? `${stats.prixHTMoyen.toFixed(2)} €` : '—'}</td>
                        <td style={{ padding: '14px 16px', textAlign: 'right' }}>{stats.prixTTCMoyen > 0 ? `${stats.prixTTCMoyen.toFixed(2)} €` : '—'}</td>
                        <td style={{ padding: '14px 16px', textAlign: 'right', fontWeight: '500', color: stats.beneficeMoyen > 0 ? '#3B6D11' : c.texteMuted }}>{stats.beneficeMoyen !== 0 ? `${stats.beneficeMoyen.toFixed(2)} €` : '—'}</td>
                        <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                          {stats.ratioMoyen > 0 ? <span style={{ background: fcBg(stats.ratioMoyen), color: fcColor(stats.ratioMoyen), borderRadius: '20px', padding: '3px 10px', fontSize: '12px', fontWeight: '500' }}>{stats.ratioMoyen.toFixed(1)} %</span> : '—'}
                        </td>
                      </tr>
                      {isOpen && (
                        <tr key={`det-${cat.id}`}>
                          <td colSpan={7} style={{ padding: 0, background: c.fond }}>
                            <div style={{ padding: '12px 16px' }}>
                              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                                <thead><HeadersDetail avecLieu={true} /></thead>
                                <tbody>{fichesCat.map(f => <LigneFiche key={f.id} item={f} />)}</tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    )
  }

  // ── VUE GLOBAL ────────────────────────────────────────────────────────
  const VueGlobal = () => {
    const statsTotal = statsListe(fichesFiltrees)
    return (
      <div>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: '10px', marginBottom: '16px' }}>
          {[
            { label: 'Fiches actives', value: fichesFiltrees.length },
            { label: 'Food cost global', value: statsTotal?.ratioMoyen > 0 ? `${statsTotal.ratioMoyen.toFixed(1)}%` : '—', color: fcColor(statsTotal?.ratioMoyen), bg: fcBg(statsTotal?.ratioMoyen) },
            { label: 'Bénéfice moyen', value: statsTotal?.beneficeMoyen > 0 ? `${statsTotal.beneficeMoyen.toFixed(2)} €` : '—' },
            { label: 'Prix TTC moyen', value: statsTotal?.prixTTCMoyen > 0 ? `${statsTotal.prixTTCMoyen.toFixed(2)} €` : '—' },
          ].map((kpi, i) => (
            <div key={i} style={{ background: kpi.bg || c.fond, borderRadius: '10px', padding: '14px' }}>
              <div style={{ fontSize: '10px', color: kpi.color || c.texteMuted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>{kpi.label}</div>
              <div style={{ fontSize: '22px', fontWeight: '500', color: kpi.color || c.texte }}>{kpi.value}</div>
            </div>
          ))}
        </div>
        <div style={{ background: c.blanc, borderRadius: '12px', border: `0.5px solid ${c.bordure}`, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: c.principal }}>
                {['Lieu', 'Fiches', 'Coût moy.', 'Prix TTC moy.', 'Bénéfice moy.', 'Food cost'].map(col => (
                  <th key={col} style={{ padding: '12px 16px', textAlign: col === 'Lieu' ? 'left' : 'right', fontSize: '11px', color: c.accent, fontWeight: '500', textTransform: 'uppercase' }}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lieux.map(lieu => {
                const lignes = fichesFiltrees.filter(f => f.lieu_id === lieu.id)
                const stats = statsListe(lignes)
                if (!stats) return null
                return (
                  <tr key={lieu.id} style={{ borderBottom: `0.5px solid ${c.bordure}` }}>
                    <td style={{ padding: '12px 16px' }}><span style={{ background: cfg.colors.lieuBg, color: cfg.colors.lieuColor, borderRadius: '20px', padding: '3px 12px', fontSize: '12px', fontWeight: '500' }}>{lieu.emoji} {lieu.nom}</span></td>
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>{stats.nb}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>{stats.coutMoyen > 0 ? `${stats.coutMoyen.toFixed(2)} €` : '—'}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>{stats.prixTTCMoyen > 0 ? `${stats.prixTTCMoyen.toFixed(2)} €` : '—'}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: '500', color: stats.beneficeMoyen > 0 ? '#3B6D11' : c.texteMuted }}>{stats.beneficeMoyen > 0 ? `${stats.beneficeMoyen.toFixed(2)} €` : '—'}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      {stats.ratioMoyen > 0 ? <span style={{ background: fcBg(stats.ratioMoyen), color: fcColor(stats.ratioMoyen), borderRadius: '20px', padding: '3px 10px', fontSize: '12px', fontWeight: '500' }}>{stats.ratioMoyen.toFixed(1)} %</span> : '—'}
                    </td>
                  </tr>
                )
              })}
              {statsTotal && (
                <tr style={{ background: c.fond, borderTop: `1px solid ${c.bordure}` }}>
                  <td style={{ padding: '12px 16px', fontWeight: '500' }}>Total</td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: '500' }}>{fichesFiltrees.length}</td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: '500' }}>{statsTotal.coutMoyen > 0 ? `${statsTotal.coutMoyen.toFixed(2)} €` : '—'}</td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: '500' }}>{statsTotal.prixTTCMoyen > 0 ? `${statsTotal.prixTTCMoyen.toFixed(2)} €` : '—'}</td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: '500', color: statsTotal.beneficeMoyen > 0 ? '#3B6D11' : c.texteMuted }}>{statsTotal.beneficeMoyen > 0 ? `${statsTotal.beneficeMoyen.toFixed(2)} €` : '—'}</td>
                  <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                    {statsTotal.ratioMoyen > 0 ? <span style={{ background: fcBg(statsTotal.ratioMoyen), color: fcColor(statsTotal.ratioMoyen), borderRadius: '20px', padding: '3px 10px', fontSize: '12px', fontWeight: '500' }}>{statsTotal.ratioMoyen.toFixed(1)} %</span> : '—'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  // ── RENDER ─────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: c.fond }}>
      <Navbar section={section} />
      <div style={{ padding: isMobile ? '12px' : '24px', maxWidth: '1200px', margin: '0 auto' }}>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: '4px', background: c.blanc, padding: '3px', borderRadius: '8px', border: `0.5px solid ${c.bordure}` }}>
            {[{ id: 'lieu', label: '🏠 Par lieu' }, { id: 'categorie', label: `${cfg.categoryIcon} Par catégorie` }, { id: 'global', label: '📊 Global' }].map(v => (
              <button key={v.id} onClick={() => { setVue(v.id); setOuvert(null) }} style={{
                padding: '6px 12px', borderRadius: '6px', fontSize: isMobile ? '11px' : '12px', border: 'none',
                cursor: 'pointer', fontWeight: vue === v.id ? '500' : '400',
                background: vue === v.id ? c.accent : 'transparent',
                color: vue === v.id ? 'white' : c.texteMuted
              }}>{v.label}</button>
            ))}
          </div>
          <select value={saisonFiltree} onChange={e => setSaisonFiltree(e.target.value)} style={{ padding: '7px 10px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, fontSize: '12px', background: c.blanc, outline: 'none', color: c.texte }}>
            <option value="toutes">Toutes saisons</option>
            {theme.saisons.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          {vue !== 'global' && (
            <>
              <select value={filtreLieu} onChange={e => setFiltreLieu(e.target.value)} style={{ padding: '7px 10px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, fontSize: '12px', background: c.blanc, outline: 'none', color: c.texte }}>
                <option value="">Tous les lieux</option>
                {lieux.map(l => <option key={l.id} value={l.id}>{l.emoji} {l.nom}</option>)}
              </select>
              <select value={filtreCat} onChange={e => setFiltreCat(e.target.value)} style={{ padding: '7px 10px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, fontSize: '12px', background: c.blanc, outline: 'none', color: c.texte }}>
                <option value="">Toutes catégories</option>
                {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.emoji} {cat.nom}</option>)}
              </select>
            </>
          )}
          <span style={{ fontSize: '12px', color: c.texteMuted }}>{fichesFiltrees.length} fiche{fichesFiltrees.length > 1 ? 's' : ''}</span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center' }}>
            {peutModifier && nbArchives > 0 && (
              <button onClick={sauvegarderArchives} disabled={saving} style={{ padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: '500', border: 'none', cursor: saving ? 'not-allowed' : 'pointer', background: saving ? '#A5B4FC' : cfg.colors.archiveBtnBg, color: 'white' }}>
                {saving ? 'Archivage...' : `📥 Archiver (${nbArchives})`}
              </button>
            )}
            <button onClick={exportExcel} style={{ padding: '8px 14px', borderRadius: '8px', fontSize: '13px', border: `0.5px solid ${c.bordure}`, background: c.blanc, color: c.texteMuted, cursor: 'pointer' }}>
              📊 {!isMobile && 'Export Excel'}
            </button>
          </div>
        </div>
        {peutModifier && nbArchives > 0 && (
          <div style={{ background: cfg.colors.archiveBannerBg, border: `0.5px solid ${cfg.colors.archiveBannerBorder}`, borderRadius: '10px', padding: '10px 16px', marginBottom: '16px', fontSize: '13px', color: cfg.colors.archiveBannerColor, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>📥 {nbArchives} fiche{nbArchives > 1 ? 's' : ''} sélectionnée{nbArchives > 1 ? 's' : ''} pour archivage</span>
            <button onClick={() => setModifArchive({})} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: cfg.colors.archiveBannerColor, fontSize: '13px', fontWeight: '500' }}>Annuler</button>
          </div>
        )}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px', color: c.texteMuted }}>Chargement...</div>
        ) : (
          <>
            {vue === 'lieu' && <VueLieu />}
            {vue === 'categorie' && <VueCategorie />}
            {vue === 'global' && <VueGlobal />}
          </>
        )}
      </div>
    </div>
  )
}
