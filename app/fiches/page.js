'use client'
import { useState, useEffect } from 'react'
import { supabase, getClientId } from '../../lib/supabase'
import { useRouter } from 'next/navigation'
import { theme } from '../../lib/theme.jsx'
import { useIsMobile } from '../../lib/useIsMobile'
import { useTheme } from '../../lib/useTheme'
import { useRole } from '../../lib/useRole'
import { log } from '../../lib/useLog'
import NavbarCuisine from '../../components/NavbarCuisine'

export default function FichesPage() {
  const [fiches, setFiches] = useState([])
  const [lieux, setLieux] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [recherche, setRecherche] = useState('')
  const [filtreLieu, setFiltreLieu] = useState('tous')
  const [filtreCat, setFiltreCat] = useState('toutes')
  const [saison, setSaison] = useState('toutes')
  const [modeArchive, setModeArchive] = useState(false)
  const [selection, setSelection] = useState([])
  const [saving, setSaving] = useState(false)
  const [showArchives, setShowArchives] = useState(false)
  const router = useRouter()
  const isMobile = useIsMobile()
  const { c } = useTheme()
  const { role, loading: roleLoading } = useRole()

  const peutModifier = role === 'admin' || role === 'cuisine'

  useEffect(() => { checkUser() }, [])
  useEffect(() => { loadFiches() }, [showArchives])

  useEffect(() => {
    if (!roleLoading && role && !['admin', 'cuisine', 'directeur'].includes(role)) {
      router.push(role === 'bar' ? '/bar/dashboard' : '/dashboard')
    }
  }, [role, roleLoading])

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

      const [
        { data: fichesData, error },
        { data: lieuxData },
        { data: catsData }
      ] = await Promise.all([
        supabase.from('fiches').select('*, lieux(id,nom,emoji), categories_plats(id,nom,emoji)')
          .eq('client_id', clientId)
          // Exclut les sous-fiches (nouvelles + legacy).
          .or('is_sub_fiche.is.null,is_sub_fiche.eq.false')
          .or('categorie.is.null,categorie.neq.Sous-fiche')
          .eq('archive', showArchives)
          .order('created_at', { ascending: false }),
        supabase.from('lieux').select('*').eq('client_id', clientId).eq('section', 'cuisine').order('ordre'),
        supabase.from('categories_plats').select('*').eq('client_id', clientId).eq('section', 'cuisine').order('ordre')
      ])

      if (error) throw error
      setFiches(fichesData || [])
      setLieux(lieuxData || [])
      setCategories(catsData || [])
      setSelection([])
    } catch (err) {
      console.error('Load fiches error:', err)
    } finally {
      setLoading(false)
    }
  }

  const toggleSelection = (id) => {
    setSelection(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id])
  }

  const toutSelectionner = () => {
    setSelection(selection.length === fichesFiltrees.length ? [] : fichesFiltrees.map(f => f.id))
  }

  const archiverSelection = async () => {
    if (selection.length === 0) return
    if (!confirm(`${showArchives ? 'Désarchiver' : 'Archiver'} ${selection.length} fiche${selection.length > 1 ? 's' : ''} ?`)) return
    setSaving(true)
    try {
      const clientId = await getClientId()
      if (!clientId) return
      const { error } = await supabase.from('fiches')
        .update({ archive: !showArchives })
        .in('id', selection)
        .eq('client_id', clientId)
      if (error) throw error
      await log({
        action: showArchives ? 'DESARCHIVAGE' : 'ARCHIVAGE',
        entite: 'fiche', entite_id: selection[0],
        entite_nom: `${selection.length} fiche(s)`, section: 'cuisine',
        details: `IDs: ${selection.join(', ')}`
      })
      setModeArchive(false)
      setSelection([])
      await loadFiches()
    } catch (err) {
      console.error('Archive error:', err)
      alert('Erreur lors de l\'archivage')
    } finally {
      setSaving(false)
    }
  }

  const fichesFiltrees = fiches.filter(f => {
    const matchRecherche = f.nom.toLowerCase().includes(recherche.toLowerCase())
    const matchLieu = filtreLieu === 'tous' || f.lieu_id === filtreLieu
    const matchCat = filtreCat === 'toutes' || f.categorie_plat_id === filtreCat
    const matchSaison = saison === 'toutes' || f.saison === saison
    return matchRecherche && matchLieu && matchCat && matchSaison
  })

  return (
    <div style={{ minHeight: '100vh', background: c.fond }}>
      <NavbarCuisine />

      <div style={{ padding: isMobile ? '16px' : '24px', maxWidth: '1100px', margin: '0 auto' }}>

        {/* KPIs dynamiques */}
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(lieux.length + 1, 4)}, 1fr)`, gap: '12px', marginBottom: '24px' }}>
          <div style={{ background: c.blanc, borderRadius: '10px', padding: '16px', border: `0.5px solid ${c.bordure}` }}>
            <div style={{ fontSize: '10px', color: c.texteMuted, textTransform: 'uppercase', marginBottom: '4px' }}>Total fiches</div>
            <div style={{ fontSize: '24px', fontWeight: '500', color: c.texte }}>{fiches.length}</div>
          </div>
          {lieux.slice(0, 3).map(lieu => (
            <div key={lieu.id} style={{ background: c.blanc, borderRadius: '10px', padding: '16px', border: `0.5px solid ${c.bordure}` }}>
              <div style={{ fontSize: '10px', color: c.texteMuted, textTransform: 'uppercase', marginBottom: '4px' }}>{lieu.emoji} {lieu.nom}</div>
              <div style={{ fontSize: '24px', fontWeight: '500', color: c.texte }}>{fiches.filter(f => f.lieu_id === lieu.id).length}</div>
            </div>
          ))}
        </div>

        {/* Filtres + actions */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>

          {/* Recherche */}
          <input type="text" placeholder="Rechercher..." value={recherche} onChange={e => setRecherche(e.target.value)}
            style={{ flex: '1', minWidth: '180px', padding: '10px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, background: c.blanc, outline: 'none', fontSize: '13px', color: c.texte }}
          />

          {/* Filtre lieu dynamique */}
          <select value={filtreLieu} onChange={e => setFiltreLieu(e.target.value)}
            style={{ padding: '10px', borderRadius: '8px', border: `0.5px solid ${filtreLieu !== 'tous' ? c.accent : c.bordure}`, background: filtreLieu !== 'tous' ? c.accentClair : c.blanc, outline: 'none', cursor: 'pointer', color: c.texte, fontSize: '13px' }}>
            <option value="tous">Tous les lieux</option>
            {lieux.map(l => <option key={l.id} value={l.id}>{l.emoji} {l.nom}</option>)}
          </select>

          {/* Filtre catégorie dynamique */}
          <select value={filtreCat} onChange={e => setFiltreCat(e.target.value)}
            style={{ padding: '10px', borderRadius: '8px', border: `0.5px solid ${filtreCat !== 'toutes' ? c.accent : c.bordure}`, background: filtreCat !== 'toutes' ? c.accentClair : c.blanc, outline: 'none', cursor: 'pointer', color: c.texte, fontSize: '13px' }}>
            <option value="toutes">Toutes catégories</option>
            {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.emoji} {cat.nom}</option>)}
          </select>

          {/* Filtre saison */}
          <select value={saison} onChange={e => setSaison(e.target.value)}
            style={{ padding: '10px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, background: c.blanc, outline: 'none', cursor: 'pointer', color: c.texte, fontSize: '13px' }}>
            <option value="toutes">Toutes saisons</option>
            {theme.saisons.map(s => <option key={s} value={s}>{s}</option>)}
          </select>

          {/* Bouton archives */}
          <button onClick={() => { setShowArchives(!showArchives); setModeArchive(false); setSelection([]) }} style={{
            padding: '10px 14px', borderRadius: '8px', fontSize: '13px', cursor: 'pointer',
            border: `0.5px solid ${showArchives ? c.accent : c.bordure}`,
            background: showArchives ? c.accentClair : c.blanc,
            color: showArchives ? c.accent : c.texteMuted,
            fontWeight: showArchives ? '500' : '400', whiteSpace: 'nowrap'
          }}>
            📦 {showArchives ? 'Voir actives' : 'Voir archives'}
          </button>

          {/* Bouton mode archivage */}
          {peutModifier && fiches.length > 0 && (
            <button onClick={() => { setModeArchive(!modeArchive); setSelection([]) }} style={{
              padding: '10px 14px', borderRadius: '8px', fontSize: '13px', cursor: 'pointer',
              border: `0.5px solid ${modeArchive ? '#DC2626' : c.bordure}`,
              background: modeArchive ? '#FEE2E2' : c.blanc,
              color: modeArchive ? '#DC2626' : c.texteMuted,
              fontWeight: modeArchive ? '500' : '400', whiteSpace: 'nowrap'
            }}>
              {modeArchive ? '✕ Annuler' : showArchives ? '📤 Désarchiver' : '📥 Archiver'}
            </button>
          )}
        </div>

        {/* Badges filtres actifs */}
        {(filtreLieu !== 'tous' || filtreCat !== 'toutes') && (
          <div style={{ display: 'flex', gap: '6px', marginBottom: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', color: c.texteMuted }}>Filtres actifs :</span>
            {filtreLieu !== 'tous' && (() => {
              const l = lieux.find(x => x.id === filtreLieu)
              return l ? (
                <span style={{ background: c.accentClair, color: c.accent, borderRadius: '20px', padding: '3px 10px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  {l.emoji} {l.nom}
                  <button onClick={() => setFiltreLieu('tous')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: c.accent, fontSize: '14px', padding: '0', lineHeight: 1 }}>×</button>
                </span>
              ) : null
            })()}
            {filtreCat !== 'toutes' && (() => {
              const cat = categories.find(x => x.id === filtreCat)
              return cat ? (
                <span style={{ background: c.accentClair, color: c.accent, borderRadius: '20px', padding: '3px 10px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  {cat.emoji} {cat.nom}
                  <button onClick={() => setFiltreCat('toutes')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: c.accent, fontSize: '14px', padding: '0', lineHeight: 1 }}>×</button>
                </span>
              ) : null
            })()}
            <button onClick={() => { setFiltreLieu('tous'); setFiltreCat('toutes') }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: c.texteMuted, fontSize: '12px', textDecoration: 'underline' }}>
              Tout effacer
            </button>
          </div>
        )}

        {/* Barre de sélection en mode archivage */}
        {modeArchive && (
          <div style={{
            background: showArchives ? '#FEF3C7' : '#FEE2E2',
            border: `0.5px solid ${showArchives ? '#FDE68A' : '#FECACA'}`,
            borderRadius: '10px', padding: '12px 16px', marginBottom: '16px',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <input type="checkbox"
                checked={selection.length === fichesFiltrees.length && fichesFiltrees.length > 0}
                onChange={toutSelectionner}
                style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#DC2626' }}
              />
              <span style={{ fontSize: '13px', color: showArchives ? '#92400E' : '#DC2626', fontWeight: '500' }}>
                {selection.length > 0
                  ? `${selection.length} fiche${selection.length > 1 ? 's' : ''} sélectionnée${selection.length > 1 ? 's' : ''}`
                  : 'Sélectionnez les fiches à ' + (showArchives ? 'désarchiver' : 'archiver')}
              </span>
            </div>
            {selection.length > 0 && (
              <button onClick={archiverSelection} disabled={saving} style={{
                padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: '500',
                cursor: saving ? 'not-allowed' : 'pointer', border: 'none',
                background: saving ? '#A5B4FC' : (showArchives ? '#D97706' : '#DC2626'), color: 'white'
              }}>
                {saving ? 'En cours...' : showArchives ? `📤 Désarchiver (${selection.length})` : `📥 Archiver (${selection.length})`}
              </button>
            )}
          </div>
        )}

        {/* Bandeau archives actif */}
        {showArchives && (
          <div style={{
            background: '#FEF3C7', border: '0.5px solid #FDE68A',
            borderRadius: '10px', padding: '10px 16px', marginBottom: '16px',
            fontSize: '13px', color: '#92400E', display: 'flex', alignItems: 'center', gap: '8px'
          }}>
            📦 Vous consultez les fiches archivées — {fiches.length} fiche{fiches.length > 1 ? 's' : ''}
          </div>
        )}

        {/* Liste des fiches */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px', color: c.texteMuted, fontSize: '14px' }}>Chargement...</div>
        ) : fichesFiltrees.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px', background: c.blanc, borderRadius: '12px', border: `0.5px solid ${c.bordure}` }}>
            <div style={{ fontSize: '14px', color: c.texteMuted, marginBottom: '16px' }}>
              {fiches.length === 0
                ? showArchives ? 'Aucune fiche archivée' : 'Aucune fiche pour le moment'
                : 'Aucune fiche ne correspond à votre recherche'}
            </div>
            {fiches.length === 0 && !showArchives && (
              <button onClick={() => router.push('/fiches/nouvelle')} style={{
                background: c.accent, color: 'white', border: 'none',
                borderRadius: '8px', padding: '10px 20px', fontSize: '13px', cursor: 'pointer', fontWeight: '500'
              }}>Créer la première fiche</button>
            )}
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: isMobile ? '10px' : '14px'
          }}>
            {fichesFiltrees.map(fiche => {
              const isSelected = selection.includes(fiche.id)
              const isSousFiche = !!fiche.is_sub_fiche
              const fc = fiche.cout_portion > 0 && fiche.prix_ttc
                ? (fiche.cout_portion / (fiche.prix_ttc / 1.10) * 100).toFixed(1)
                : null
              const fcColor = fc ? (fc < 28 ? '#16A34A' : fc < 35 ? '#D97706' : '#DC2626') : null
              const fcBg = fc ? (fc < 28 ? '#DCFCE7' : fc < 35 ? '#FEF3C7' : '#FEE2E2') : null

              return (
                <div key={fiche.id}
                  onClick={() => modeArchive ? toggleSelection(fiche.id) : router.push(`/fiches/${fiche.id}`)}
                  style={{
                    background: isSelected ? (showArchives ? '#FEF3C7' : '#FEE2E2') : c.blanc,
                    borderRadius: '12px',
                    border: `0.5px solid ${isSelected ? (showArchives ? '#FDE68A' : '#FECACA') : c.bordure}`,
                    cursor: 'pointer', overflow: 'hidden',
                    display: 'flex', flexDirection: isMobile ? 'row' : 'column',
                    transition: 'all 0.15s', position: 'relative'
                  }}
                  onMouseEnter={e => { if (!isSelected) { e.currentTarget.style.borderColor = c.accent; e.currentTarget.style.boxShadow = `0 2px 12px ${c.accent}20` } }}
                  onMouseLeave={e => { if (!isSelected) { e.currentTarget.style.borderColor = c.bordure; e.currentTarget.style.boxShadow = 'none' } }}
                >
                  {modeArchive && (
                    <div style={{ position: 'absolute', top: '10px', right: '10px', zIndex: 10 }}>
                      <input type="checkbox" checked={isSelected}
                        onChange={() => toggleSelection(fiche.id)}
                        onClick={e => e.stopPropagation()}
                        style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#DC2626' }}
                      />
                    </div>
                  )}
                  {fiche.photo_url && (
                    <img src={fiche.photo_url} alt={fiche.nom} style={{
                      width: isMobile ? '100px' : '100%',
                      height: isMobile ? '100px' : '160px',
                      objectFit: 'cover', flexShrink: 0,
                      opacity: modeArchive && !isSelected ? 0.6 : 1
                    }} />
                  )}
                  <div style={{ padding: isMobile ? '12px' : '16px', flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                      <div style={{ fontSize: isMobile ? '14px' : '15px', fontWeight: '500', color: c.texte, paddingRight: modeArchive ? '24px' : '0' }}>
                        {fiche.nom}
                      </div>
                      {/* Badge catégorie dynamique */}
                      {fiche.categories_plats ? (
                        <span style={{
                          background: isSousFiche ? '#EDE9FE' : c.accentClair,
                          color: isSousFiche ? '#4C1D95' : c.accent,
                          borderRadius: '20px',
                          padding: '2px 8px',
                          fontSize: '10px',
                          fontWeight: '500',
                          flexShrink: 0,
                          marginLeft: '6px'
                        }}>
                          {fiche.categories_plats.emoji} {fiche.categories_plats.nom}
                        </span>
                      ) : fiche.categorie ? (
                        <span style={{
                          background: isSousFiche ? '#EDE9FE' : c.accentClair,
                          color: isSousFiche ? '#4C1D95' : c.accent,
                          borderRadius: '20px',
                          padding: '2px 8px',
                          fontSize: '10px',
                          fontWeight: '500',
                          flexShrink: 0,
                          marginLeft: '6px'
                        }}>
                          {fiche.categorie}
                        </span>
                      ) : null}
                    </div>
                    <div style={{ display: 'flex', gap: '6px', fontSize: '12px', color: c.texteMuted, flexWrap: 'wrap', alignItems: 'center' }}>
                      {/* Badge lieu dynamique */}
                      {fiche.lieux && (
                        <span style={{ background: '#FAECE7', color: '#993C1D', borderRadius: '20px', padding: '1px 7px', fontSize: '10px', fontWeight: '500' }}>
                          {fiche.lieux.emoji} {fiche.lieux.nom}
                        </span>
                      )}
                      {fiche.saison && <span style={{ fontSize: '11px' }}>{fiche.saison}</span>}
                      {fiche.nb_portions && <span>{fiche.nb_portions} portions</span>}
                      {fiche.prix_ttc && <span style={{ fontWeight: '500', color: c.texte }}>{Number(fiche.prix_ttc).toFixed(2)} €</span>}
                      {fc && <span style={{ background: fcBg, color: fcColor, borderRadius: '20px', padding: '1px 7px', fontSize: '11px', fontWeight: '500' }}>{fc}%</span>}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
