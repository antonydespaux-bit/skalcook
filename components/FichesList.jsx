'use client'
import { useState, useEffect } from 'react'
import { supabase, getClientId } from '../lib/supabase'
import { useRouter } from 'next/navigation'
import { theme } from '../lib/theme.jsx'
import { SAISONS, getYearsRange, formatSaison } from '../lib/saison'
import { useIsMobile } from '../lib/useIsMobile'
import { useTheme } from '../lib/useTheme'
import { useRole } from '../lib/useRole'
import { log } from '../lib/useLog'
import { estSousFiche } from '../lib/foodCost'
import { buildCommandeWorkbook, downloadXlsx } from '../lib/fichesExport'
import Navbar from './Navbar'
import Pagination from './Pagination'
import { Badge } from './ui'

const CATEGORIES_ALCOOL = ['Cocktails', 'Vins', 'Champagnes', 'Bières', 'Spiritueux']
const PAGE_SIZE = 24

const CFG = {
  cuisine: {
    table: 'fiches',
    sectionFilter: 'cuisine',
    allowedRoles: ['admin', 'cuisine', 'directeur'],
    modifierRoles: ['admin', 'cuisine'],
    redirectOnDeny: '/bar/dashboard',
    ficheUrlPrefix: '/fiches',
    newFicheUrl: '/fiches/nouvelle',
    hasPagination: true,
    hasSousFicheFilter: true,
    tvaFn: () => 1.10,
    fcSeuils: { vert: 28, orange: 35 },
    colors: {
      accent: null, accentClair: null, // uses theme
      lieuBg: '#FAECE7', lieuColor: '#993C1D',
      catBg: null, catColor: null, // uses theme
      archiveAccent: '#DC2626',
      selectedBg: '#FEE2E2', selectedBorder: '#FECACA',
      hoverAccent: null, // uses theme
    },
  },
  bar: {
    table: 'fiches_bar',
    sectionFilter: 'bar',
    allowedRoles: ['admin', 'bar', 'directeur'],
    modifierRoles: ['admin', 'bar'],
    redirectOnDeny: '/dashboard',
    ficheUrlPrefix: '/bar/fiches',
    newFicheUrl: '/bar/fiches/nouvelle',
    // Paginé comme la cuisine : la-fantaisie a 260 fiches bar, toutes rendues
    // d'un coup auparavant (2941 nœuds DOM, ~60 ms par frappe dans le filtre).
    hasPagination: true,
    hasSousFicheFilter: false,
    tvaFn: (fiche) => CATEGORIES_ALCOOL.includes(fiche?.categorie) ? 1.20 : 1.10,
    fcSeuils: { vert: 22, orange: 28 },
    colors: {
      accent: '#7C3AED', accentClair: '#EDE9FE',
      lieuBg: '#EEEDFE', lieuColor: '#3C3489',
      catBg: '#EDE9FE', catColor: '#3C3489',
      archiveAccent: '#7C3AED',
      selectedBg: '#EDE9FE', selectedBorder: '#DDD6FE',
      hoverAccent: '#7C3AED',
    },
  },
}

export default function FichesList({ section = 'cuisine' }) {
  const cfg = CFG[section]
  const [fiches, setFiches] = useState([])
  const [lieux, setLieux] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [recherche, setRecherche] = useState('')
  const [filtreLieu, setFiltreLieu] = useState('tous')
  const [filtreCat, setFiltreCat] = useState('toutes')
  const [filtreSaison, setFiltreSaison] = useState('toutes')
  const [filtreAnnee, setFiltreAnnee] = useState('toutes')
  const annees = getYearsRange()
  const [modeArchive, setModeArchive] = useState(false)
  const [selection, setSelection] = useState([])
  const [saving, setSaving] = useState(false)
  const [showArchives, setShowArchives] = useState(false)
  const [page, setPage] = useState(1)
  const [modeExtraire, setModeExtraire] = useState(false)
  const [selectionExtraire, setSelectionExtraire] = useState([])
  const [rechercheExtraire, setRechercheExtraire] = useState('')
  const [extracting, setExtracting] = useState(false)
  const router = useRouter()
  const isMobile = useIsMobile()
  const { c } = useTheme()
  const { role, loading: roleLoading } = useRole()
  const peutModifier = cfg.modifierRoles.includes(role)

  // Resolve colors: use theme or config
  const accent = cfg.colors.accent || c.accent
  const accentClair = cfg.colors.accentClair || c.accentClair
  const hoverAccent = cfg.colors.hoverAccent || c.accent
  const catBg = cfg.colors.catBg || c.accentClair
  const catColor = cfg.colors.catColor || c.accent

  useEffect(() => { checkUser() }, [])
  useEffect(() => { loadFiches() }, [showArchives])
  useEffect(() => {
    if (!roleLoading && role && !cfg.allowedRoles.includes(role)) router.push(cfg.redirectOnDeny)
  }, [role, roleLoading])
  useEffect(() => { setPage(1) }, [recherche, filtreLieu, filtreCat, filtreSaison, filtreAnnee, showArchives])

  const checkUser = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) router.push('/')
    } catch { router.push('/') }
  }

  const loadFiches = async () => {
    try {
      setLoading(true)
      const clientId = await getClientId()
      if (!clientId) { router.push('/'); return }
      let fichesQuery = supabase.from(cfg.table)
        .select('*, lieux(id,nom,emoji), categories_plats(id,nom,emoji)')
        .eq('client_id', clientId)
      if (cfg.hasSousFicheFilter) {
        fichesQuery = fichesQuery
          .or('is_sub_fiche.is.null,is_sub_fiche.eq.false')
          .or('categorie.is.null,categorie.not.ilike.%sous%')
          .or(showArchives ? 'archive.eq.true' : 'archive.is.null,archive.eq.false')
      } else {
        fichesQuery = fichesQuery.eq('archive', showArchives)
      }
      fichesQuery = fichesQuery.order('created_at', { ascending: false })

      const [{ data: fichesData, error }, { data: lieuxData }, { data: catsData }] = await Promise.all([
        fichesQuery,
        supabase.from('lieux').select('*').eq('client_id', clientId).eq('section', cfg.sectionFilter).order('ordre'),
        supabase.from('categories_plats').select('*').eq('client_id', clientId).eq('section', cfg.sectionFilter).order('ordre'),
      ])
      if (error) throw error
      // Garde-fou : exclure les sous-fiches de la liste principale (elles vivent
      // dans /sous-fiches). Le filtre `.or()` côté requête ne les écarte pas de
      // façon fiable (plusieurs `or=` non combinés en AND par PostgREST).
      let rows = fichesData || []
      if (cfg.hasSousFicheFilter) rows = rows.filter(f => !estSousFiche(f))
      setFiches(rows)
      setLieux(lieuxData || [])
      setCategories(catsData || [])
      setSelection([])
    } catch (err) { console.error('Load fiches error:', err) }
    finally { setLoading(false) }
  }

  const toggleSelection = (id) => setSelection(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id])
  const fichesFiltrees = fiches.filter(f => {
    return f.nom.toLowerCase().includes(recherche.toLowerCase())
      && (filtreLieu === 'tous' || f.lieu_id === filtreLieu)
      && (filtreCat === 'toutes' || f.categorie_plat_id === filtreCat)
      && (filtreSaison === 'toutes' || f.saison === filtreSaison)
      && (filtreAnnee === 'toutes' || f.annee === parseInt(filtreAnnee, 10))
  })
  const totalPages = Math.max(1, Math.ceil(fichesFiltrees.length / PAGE_SIZE))
  const fichesDisplay = cfg.hasPagination ? fichesFiltrees.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE) : fichesFiltrees

  const archiverSelection = async () => {
    if (selection.length === 0) return
    if (!confirm(`${showArchives ? 'Désarchiver' : 'Archiver'} ${selection.length} fiche${selection.length > 1 ? 's' : ''} ?`)) return
    setSaving(true)
    try {
      const clientId = await getClientId()
      if (!clientId) return
      const { error } = await supabase.from(cfg.table).update({ archive: !showArchives }).in('id', selection).eq('client_id', clientId)
      if (error) throw error
      await log({ action: showArchives ? 'DESARCHIVAGE' : 'ARCHIVAGE', entite: cfg.table, entite_id: selection[0], entite_nom: `${selection.length} fiche(s)`, section, details: `IDs: ${selection.join(', ')}` })
      setModeArchive(false); setSelection([]); await loadFiches()
    } catch (err) { console.error('Archive error:', err); alert('Erreur archivage') }
    finally { setSaving(false) }
  }

  const toggleSelectionExtraire = (id) => setSelectionExtraire(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id])

  const extraireSelection = async () => {
    if (selectionExtraire.length === 0) return
    setExtracting(true)
    try {
      const clientId = await getClientId()
      if (!clientId) return
      const { data: ingsData, error } = await supabase
        .from('fiche_ingredients')
        .select('fiche_id, quantite, unite, ingredients (nom, unite)')
        .in('fiche_id', selectionExtraire)
        .eq('client_id', clientId)
      if (error) throw error
      // Regroupe les ingrédients par fiche, en respectant l'ordre d'affichage des fiches.
      const parFiche = new Map()
      for (const ligne of ingsData || []) {
        if (!parFiche.has(ligne.fiche_id)) parFiche.set(ligne.fiche_id, [])
        parFiche.get(ligne.fiche_id).push(ligne)
      }
      const fichesPourExport = fiches
        .filter(f => selectionExtraire.includes(f.id))
        .map(f => ({ nom: f.nom, ingredients: parFiche.get(f.id) || [] }))
      const wb = await buildCommandeWorkbook(fichesPourExport)
      const dateStr = new Date().toISOString().slice(0, 10)
      await downloadXlsx(wb, `commande_fiches_${dateStr}.xlsx`)
      setModeExtraire(false); setSelectionExtraire([]); setRechercheExtraire('')
    } catch (err) { console.error('Extract error:', err); alert('Erreur lors de l\'extraction Excel') }
    finally { setExtracting(false) }
  }

  const fichesExtraireFiltrees = fiches.filter(f => f.nom.toLowerCase().includes(rechercheExtraire.toLowerCase()))

  return (
    <div style={{ minHeight: '100vh', background: c.fond }}>
      <Navbar section={section} />
      <div style={{ padding: isMobile ? '16px' : '24px', maxWidth: '1100px', margin: '0 auto' }}>

        {/* Filters */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
          <input type="text" placeholder="Rechercher..." value={recherche} onChange={e => setRecherche(e.target.value)}
            style={{ flex: '1', minWidth: '180px', padding: '10px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, background: c.blanc, outline: 'none', fontSize: '13px', color: c.texte }} />
          <select value={filtreLieu} onChange={e => setFiltreLieu(e.target.value)}
            style={{ padding: '10px', borderRadius: '8px', border: `0.5px solid ${filtreLieu !== 'tous' ? accent : c.bordure}`, background: filtreLieu !== 'tous' ? accentClair : c.blanc, outline: 'none', cursor: 'pointer', color: c.texte, fontSize: '13px' }}>
            <option value="tous">Tous les lieux</option>
            {lieux.map(l => <option key={l.id} value={l.id}>{l.emoji} {l.nom}</option>)}
          </select>
          <select value={filtreCat} onChange={e => setFiltreCat(e.target.value)}
            style={{ padding: '10px', borderRadius: '8px', border: `0.5px solid ${filtreCat !== 'toutes' ? accent : c.bordure}`, background: filtreCat !== 'toutes' ? accentClair : c.blanc, outline: 'none', cursor: 'pointer', color: c.texte, fontSize: '13px' }}>
            <option value="toutes">Toutes catégories</option>
            {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.emoji} {cat.nom}</option>)}
          </select>
          <select value={filtreSaison} onChange={e => setFiltreSaison(e.target.value)}
            style={{ padding: '10px', borderRadius: '8px', border: `0.5px solid ${filtreSaison !== 'toutes' ? accent : c.bordure}`, background: filtreSaison !== 'toutes' ? accentClair : c.blanc, outline: 'none', cursor: 'pointer', color: c.texte, fontSize: '13px' }}>
            <option value="toutes">Toutes saisons</option>
            {SAISONS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={filtreAnnee} onChange={e => setFiltreAnnee(e.target.value)}
            style={{ padding: '10px', borderRadius: '8px', border: `0.5px solid ${filtreAnnee !== 'toutes' ? accent : c.bordure}`, background: filtreAnnee !== 'toutes' ? accentClair : c.blanc, outline: 'none', cursor: 'pointer', color: c.texte, fontSize: '13px' }}>
            <option value="toutes">Toutes années</option>
            {annees.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button onClick={() => { setShowArchives(!showArchives); setModeArchive(false); setSelection([]) }} style={{
            padding: '10px 14px', borderRadius: '8px', fontSize: '13px', cursor: 'pointer',
            border: `0.5px solid ${showArchives ? accent : c.bordure}`, background: showArchives ? accentClair : c.blanc,
            color: showArchives ? accent : c.texteMuted, fontWeight: showArchives ? '500' : '400', whiteSpace: 'nowrap'
          }}>📦 {showArchives ? 'Voir actives' : 'Voir archives'}</button>
          {section === 'cuisine' && role === 'admin' && (
            <button onClick={() => router.push('/fiches/import')} style={{
              padding: '10px 14px', borderRadius: '8px', fontSize: '13px', cursor: 'pointer',
              border: `0.5px solid ${c.bordure}`, background: c.blanc, color: c.texteMuted, whiteSpace: 'nowrap'
            }}>📊 Importer Excel</button>
          )}
          {peutModifier && fiches.length > 0 && (
            <button onClick={() => { setModeArchive(!modeArchive); setSelection([]) }} style={{
              padding: '10px 14px', borderRadius: '8px', fontSize: '13px', cursor: 'pointer',
              border: `0.5px solid ${modeArchive ? '#DC2626' : c.bordure}`, background: modeArchive ? '#FEE2E2' : c.blanc,
              color: modeArchive ? '#DC2626' : c.texteMuted, fontWeight: modeArchive ? '500' : '400', whiteSpace: 'nowrap'
            }}>{modeArchive ? '✕ Annuler' : showArchives ? '📤 Désarchiver' : '📥 Archiver'}</button>
          )}
          {fiches.length > 0 && (
            <button onClick={() => { setModeExtraire(true); setSelectionExtraire([]); setRechercheExtraire('') }} style={{
              padding: '10px 14px', borderRadius: '8px', fontSize: '13px', cursor: 'pointer',
              border: `0.5px solid ${c.bordure}`, background: c.blanc, color: c.texteMuted, whiteSpace: 'nowrap'
            }}>📤 Extraire</button>
          )}
        </div>

        {/* Active filter badges */}
        {(filtreLieu !== 'tous' || filtreCat !== 'toutes') && (
          <div style={{ display: 'flex', gap: '6px', marginBottom: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', color: c.texteMuted }}>Filtres actifs :</span>
            {filtreLieu !== 'tous' && (() => { const l = lieux.find(x => x.id === filtreLieu); return l ? (
              <span style={{ background: accentClair, color: accent, borderRadius: '20px', padding: '3px 10px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                {l.emoji} {l.nom} <button onClick={() => setFiltreLieu('tous')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: accent, fontSize: '14px', padding: '0', lineHeight: 1 }}>×</button>
              </span>) : null })()}
            {filtreCat !== 'toutes' && (() => { const cat = categories.find(x => x.id === filtreCat); return cat ? (
              <span style={{ background: accentClair, color: accent, borderRadius: '20px', padding: '3px 10px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                {cat.emoji} {cat.nom} <button onClick={() => setFiltreCat('toutes')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: accent, fontSize: '14px', padding: '0', lineHeight: 1 }}>×</button>
              </span>) : null })()}
            <button onClick={() => { setFiltreLieu('tous'); setFiltreCat('toutes') }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: c.texteMuted, fontSize: '12px', textDecoration: 'underline' }}>Tout effacer</button>
          </div>
        )}

        {/* Selection bar */}
        {modeArchive && (
          <div style={{ background: showArchives ? '#FEF3C7' : '#FEE2E2', border: `0.5px solid ${showArchives ? '#FDE68A' : '#FECACA'}`, borderRadius: '10px', padding: '12px 16px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <input type="checkbox" checked={selection.length === fichesFiltrees.length && fichesFiltrees.length > 0}
                onChange={() => setSelection(selection.length === fichesFiltrees.length ? [] : fichesFiltrees.map(f => f.id))}
                style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: cfg.colors.archiveAccent }} />
              <span style={{ fontSize: '13px', color: showArchives ? '#92400E' : '#DC2626', fontWeight: '500' }}>
                {selection.length > 0 ? `${selection.length} fiche${selection.length > 1 ? 's' : ''} sélectionnée${selection.length > 1 ? 's' : ''}` : `Sélectionnez les fiches à ${showArchives ? 'désarchiver' : 'archiver'}`}
              </span>
            </div>
            {selection.length > 0 && (
              <button onClick={archiverSelection} disabled={saving} style={{
                padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: '500', cursor: saving ? 'not-allowed' : 'pointer', border: 'none',
                background: saving ? '#A5B4FC' : (showArchives ? '#D97706' : cfg.colors.archiveAccent), color: 'white'
              }}>{saving ? 'En cours...' : showArchives ? `📤 Désarchiver (${selection.length})` : `📥 Archiver (${selection.length})`}</button>
            )}
          </div>
        )}

        {showArchives && (
          <div style={{ background: accentClair, border: `0.5px solid ${accent}40`, borderRadius: '10px', padding: '10px 16px', marginBottom: '16px', fontSize: '13px', color: accent, display: 'flex', alignItems: 'center', gap: '8px' }}>
            📦 Fiches archivées — {fiches.length} fiche{fiches.length > 1 ? 's' : ''}
          </div>
        )}

        {/* Fiches grid */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px', color: c.texteMuted, fontSize: '14px' }}>Chargement...</div>
        ) : fichesFiltrees.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px', background: c.blanc, borderRadius: '12px', border: `0.5px solid ${c.bordure}` }}>
            <div style={{ fontSize: '14px', color: c.texteMuted, marginBottom: '16px' }}>
              {fiches.length === 0 ? (showArchives ? 'Aucune fiche archivée' : 'Aucune fiche pour le moment') : 'Aucune fiche ne correspond à votre recherche'}
            </div>
            {fiches.length === 0 && !showArchives && peutModifier && (
              <button onClick={() => router.push(cfg.newFicheUrl)} style={{ background: accent, color: 'white', border: 'none', borderRadius: '8px', padding: '10px 20px', fontSize: '13px', cursor: 'pointer', fontWeight: '500' }}>Créer la première fiche</button>
            )}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(280px, 1fr))', gap: isMobile ? '10px' : '14px' }}>
            {fichesDisplay.map(fiche => {
              const tva = cfg.tvaFn(fiche)
              const fc = fiche.cout_portion > 0 && fiche.prix_ttc ? (fiche.cout_portion / (fiche.prix_ttc / tva) * 100).toFixed(1) : null
              const fcColor = fc ? (fc < cfg.fcSeuils.vert ? '#16A34A' : fc < cfg.fcSeuils.orange ? '#D97706' : '#DC2626') : null
              const fcBgColor = fc ? (fc < cfg.fcSeuils.vert ? '#DCFCE7' : fc < cfg.fcSeuils.orange ? '#FEF3C7' : '#FEE2E2') : null
              const isSelected = selection.includes(fiche.id)
              return (
                <div key={fiche.id}
                  onClick={() => modeArchive ? toggleSelection(fiche.id) : router.push(`${cfg.ficheUrlPrefix}/${fiche.id}`)}
                  style={{
                    background: isSelected ? (showArchives ? '#FEF3C7' : cfg.colors.selectedBg) : c.blanc,
                    borderRadius: '12px', border: `0.5px solid ${isSelected ? (showArchives ? '#FDE68A' : cfg.colors.selectedBorder) : c.bordure}`,
                    cursor: 'pointer', overflow: 'hidden', position: 'relative', transition: 'all 0.15s',
                    display: 'flex', flexDirection: isMobile ? 'row' : 'column'
                  }}
                  onMouseEnter={e => { if (!isSelected && !modeArchive) { e.currentTarget.style.borderColor = hoverAccent; e.currentTarget.style.boxShadow = `0 2px 12px ${hoverAccent}20` } }}
                  onMouseLeave={e => { if (!isSelected) { e.currentTarget.style.borderColor = c.bordure; e.currentTarget.style.boxShadow = 'none' } }}
                >
                  {modeArchive && (
                    <div style={{ position: 'absolute', top: '10px', right: '10px', zIndex: 10 }}>
                      <input type="checkbox" checked={isSelected} onChange={() => toggleSelection(fiche.id)} onClick={e => e.stopPropagation()}
                        style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: cfg.colors.archiveAccent }} />
                    </div>
                  )}
                  <div style={{ padding: isMobile ? '12px' : '16px', flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px', gap: '6px' }}>
                      <div style={{ fontSize: isMobile ? '14px' : '15px', fontWeight: '500', color: c.texte, paddingRight: modeArchive ? '24px' : '0', flex: 1 }}>{fiche.nom}</div>
                      {fiche.categories_plats ? (
                        <span style={{ background: catBg, color: catColor, borderRadius: '20px', padding: '2px 8px', fontSize: '10px', fontWeight: '500', flexShrink: 0 }}>{fiche.categories_plats.emoji} {fiche.categories_plats.nom}</span>
                      ) : fiche.categorie ? (
                        <span style={{ background: catBg, color: catColor, borderRadius: '20px', padding: '2px 8px', fontSize: '10px', fontWeight: '500', flexShrink: 0 }}>{fiche.categorie}</span>
                      ) : null}
                    </div>
                    <div style={{ display: 'flex', gap: '6px', fontSize: '12px', color: c.texteMuted, flexWrap: 'wrap', alignItems: 'center' }}>
                      {fiche.lieux && <Badge bg={cfg.colors.lieuBg} color={cfg.colors.lieuColor}>{fiche.lieux.emoji} {fiche.lieux.nom}</Badge>}
                      {(fiche.saison || fiche.annee) && <span style={{ fontSize: '11px' }}>{formatSaison(fiche.saison, fiche.annee)}</span>}
                      {fiche.nb_portions && <span>{fiche.nb_portions} portions</span>}
                      {fiche.prix_ttc && <span style={{ fontWeight: '500', color: c.texte }}>{Number(fiche.prix_ttc).toFixed(2)} €</span>}
                      {fc && <Badge bg={fcBgColor} color={fcColor}>{fc}%</Badge>}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
        {cfg.hasPagination && <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />}
      </div>

      {/* Modale d'extraction Excel */}
      {modeExtraire && (
        <div onClick={() => !extracting && setModeExtraire(false)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px'
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: c.blanc, borderRadius: '14px', width: '100%', maxWidth: '480px',
            maxHeight: '85vh', display: 'flex', flexDirection: 'column', overflow: 'hidden'
          }}>
            <div style={{ padding: '18px 20px', borderBottom: `0.5px solid ${c.bordure}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
                <div style={{ fontSize: '16px', fontWeight: '600', color: c.texte }}>📤 Extraire les ingrédients</div>
                <button onClick={() => !extracting && setModeExtraire(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', color: c.texteMuted, lineHeight: 1 }}>×</button>
              </div>
              <div style={{ fontSize: '12px', color: c.texteMuted, marginTop: '4px' }}>
                Sélectionnez les fiches à inclure dans le fichier Excel de commande.
              </div>
            </div>

            <div style={{ padding: '12px 20px', borderBottom: `0.5px solid ${c.bordure}`, display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              <input type="text" placeholder="Rechercher une fiche..." value={rechercheExtraire} onChange={e => setRechercheExtraire(e.target.value)}
                style={{ flex: 1, minWidth: '160px', padding: '8px 10px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, background: c.blanc, outline: 'none', fontSize: '13px', color: c.texte }} />
              <button onClick={() => setSelectionExtraire(
                selectionExtraire.length === fichesExtraireFiltrees.length ? [] : fichesExtraireFiltrees.map(f => f.id)
              )} style={{ padding: '8px 12px', borderRadius: '8px', fontSize: '12px', cursor: 'pointer', border: `0.5px solid ${c.bordure}`, background: c.blanc, color: c.texteMuted, whiteSpace: 'nowrap' }}>
                {selectionExtraire.length === fichesExtraireFiltrees.length && fichesExtraireFiltrees.length > 0 ? 'Tout désélectionner' : 'Tout sélectionner'}
              </button>
            </div>

            <div style={{ overflowY: 'auto', padding: '8px 12px', flex: 1 }}>
              {fichesExtraireFiltrees.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px', color: c.texteMuted, fontSize: '13px' }}>Aucune fiche</div>
              ) : fichesExtraireFiltrees.map(f => {
                const checked = selectionExtraire.includes(f.id)
                return (
                  <label key={f.id} style={{
                    display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 10px', borderRadius: '8px', cursor: 'pointer',
                    background: checked ? accentClair : 'transparent'
                  }}>
                    <input type="checkbox" checked={checked} onChange={() => toggleSelectionExtraire(f.id)}
                      style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: accent }} />
                    <span style={{ fontSize: '13px', color: c.texte, flex: 1 }}>{f.nom}</span>
                    {(f.saison || f.annee) && <span style={{ fontSize: '11px', color: c.texteMuted }}>{formatSaison(f.saison, f.annee)}</span>}
                  </label>
                )
              })}
            </div>

            <div style={{ padding: '14px 20px', borderTop: `0.5px solid ${c.bordure}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '12px', color: c.texteMuted }}>
                {selectionExtraire.length} fiche{selectionExtraire.length > 1 ? 's' : ''} sélectionnée{selectionExtraire.length > 1 ? 's' : ''}
              </span>
              <button onClick={extraireSelection} disabled={extracting || selectionExtraire.length === 0} style={{
                padding: '9px 18px', borderRadius: '8px', fontSize: '13px', fontWeight: '500', border: 'none',
                cursor: (extracting || selectionExtraire.length === 0) ? 'not-allowed' : 'pointer',
                background: (extracting || selectionExtraire.length === 0) ? c.bordure : accent,
                color: (extracting || selectionExtraire.length === 0) ? c.texteMuted : c.texte
              }}>{extracting ? 'Génération...' : `📊 Extraire Excel (${selectionExtraire.length})`}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
