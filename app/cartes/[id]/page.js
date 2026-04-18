'use client'
import { useState, useEffect } from 'react'
import { supabase, getParametres, getClientId } from '../../../lib/supabase'
import { useRouter, useParams } from 'next/navigation'
import { theme, Logo } from '../../../lib/theme.jsx'
import { useTheme } from '../../../lib/useTheme'
import { useIsMobile } from '../../../lib/useIsMobile'
import { log } from '../../../lib/useLog'
import { ALLERGENES } from '../../../lib/allergenes'
import ChefLoader from '../../../components/ChefLoader'
import { Alert , Badge } from '../../../components/ui'

const genId = () => crypto.randomUUID()

export default function CarteDetailPage() {
  const params_route = useParams()
  const router = useRouter()
  const { nomEtablissement, logoUrl } = useTheme()
  const isMobile = useIsMobile()
  const c = theme.couleurs
  const saisons = theme.saisons

  const [carte, setCarte] = useState(null)
  const [editing, setEditing] = useState(false)
  const [vueSupp, setVueSupp] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [fiches, setFiches] = useState([])
  const [params, setParams] = useState({})

  // ── Edit state ──
  const [nom, setNom] = useState('')
  const [saison, setSaison] = useState('')
  const [prixBase, setPrixBase] = useState('')
  const [description, setDescription] = useState('')
  const [sections, setSections] = useState([])

  useEffect(() => {
    const style = document.createElement('style')
    style.innerHTML = `
      @media print {
        .no-print { display: none !important; }
        .print-only { display: block !important; }
        .print-instructions { page-break-before: always; margin-top: 0 !important; }
        html { background: white !important; }
        body { background: white !important; margin: 0; padding: 0; }
        .carte-detail-print-root {
          background: white !important;
          min-height: auto !important;
          height: auto !important;
        }
        .carte-detail-print-root .print-only {
          background: white !important;
          min-height: auto !important;
        }
        .carte-print-body {
          padding-bottom: 30mm !important;
          box-sizing: border-box;
        }
        .carte-print-allergenes {
          margin-bottom: 8px !important;
        }
        .carte-print-footer {
          position: fixed !important;
          bottom: 0 !important;
          left: 0 !important;
          right: 0 !important;
          margin: 0 !important;
          background: #fff !important;
          border-top: 1px solid #e8e4dc !important;
          padding: 10px 15mm 12mm !important;
          box-sizing: border-box !important;
          display: flex !important;
          justify-content: space-between !important;
          font-size: 9px !important;
          color: #8B7355 !important;
          font-family: sans-serif !important;
        }
        @page { margin: 15mm 15mm 15mm 15mm; }
      }
      @media screen {
        .print-only { display: none !important; }
      }
    `
    document.head.appendChild(style)
    loadData()
    loadFiches()
    loadParams()
    return () => document.head.removeChild(style)
  }, [])

  const loadParams = async () => {
    const p = await getParametres()
    setParams(p)
  }

  const loadFiches = async () => {
    const clientId = await getClientId()
    if (!clientId) return
    const { data } = await supabase
      .from('fiches')
      .select('id, nom, categorie, cout_portion, prix_ttc, allergenes')
      .eq('client_id', clientId)
      .or('is_sub_fiche.is.null,is_sub_fiche.eq.false')
      .or('archive.is.null,archive.eq.false')
      .order('nom')
    setFiches(data || [])
  }

  const loadData = async () => {
    const clientId = await getClientId()
    if (!clientId) { router.push('/'); return }
    const { data } = await supabase
      .from('cartes')
      .select(`*, carte_sections(id, titre, ordre, carte_items(id, nom, description, supplement, relation, ordre, fiche_id, fiches(id, nom, cout_portion, allergenes)))`)
      .eq('id', params_route.id)
      .eq('client_id', clientId)
      .single()
    if (!data) { router.push('/cartes'); return }
    setCarte(data)
    setNom(data.nom)
    setSaison(data.saison || '')
    setPrixBase(data.prix_base ? String(data.prix_base) : '')
    setDescription(data.description || '')
    const sortedSections = (data.carte_sections || [])
      .sort((a, b) => a.ordre - b.ordre)
      .map(s => ({
        _id: s.id,
        dbId: s.id,
        titre: s.titre,
        items: (s.carte_items || [])
          .sort((a, b) => a.ordre - b.ordre)
          .map(i => ({
            _id: i.id,
            ficheId: i.fiche_id || '',
            description: i.description || '',
            supplement: i.supplement ? String(i.supplement) : '',
            relation: i.relation || 'et'
          }))
      }))
    setSections(sortedSections.length > 0 ? sortedSections : [{ _id: genId(), titre: '', items: [{ _id: genId(), ficheId: '', description: '', supplement: '', relation: 'et' }] }])
    setLoading(false)
  }

  // ── Section/Item helpers (same as nouveau) ──

  const addSection = () => setSections([...sections, { _id: genId(), titre: '', items: [{ _id: genId(), ficheId: '', description: '', supplement: '', relation: 'et' }] }])
  const removeSection = (sIdx) => { if (sections.length <= 1) return; setSections(sections.filter((_, i) => i !== sIdx)) }
  const updateSection = (sIdx, field, value) => { const copy = [...sections]; copy[sIdx] = { ...copy[sIdx], [field]: value }; setSections(copy) }
  const addItem = (sIdx) => { const copy = [...sections]; copy[sIdx].items = [...copy[sIdx].items, { _id: genId(), ficheId: '', description: '', supplement: '', relation: 'et' }]; setSections(copy) }
  const removeItem = (sIdx, iIdx) => { const copy = [...sections]; if (copy[sIdx].items.length <= 1) return; copy[sIdx].items = copy[sIdx].items.filter((_, i) => i !== iIdx); setSections(copy) }
  const updateItem = (sIdx, iIdx, field, value) => { const copy = [...sections]; copy[sIdx].items = [...copy[sIdx].items]; copy[sIdx].items[iIdx] = { ...copy[sIdx].items[iIdx], [field]: value }; setSections(copy) }

  // ── Calculs ──

  const getFiche = (ficheId) => fiches.find(f => f.id === ficheId)

  const getAllItems = (src) => {
    if (src === 'edit') return sections.flatMap(s => s.items)
    if (!carte) return []
    return (carte.carte_sections || []).flatMap(s => s.carte_items || [])
  }

  const calculs = (src, baseOnly = false) => {
    const isSrc = src === 'edit'
    const secs = isSrc ? sections : (carte?.carte_sections || []).sort((a, b) => a.ordre - b.ordre)

    let coutMatiere = 0, totalSupp = 0

    for (const section of secs) {
      const items = isSrc ? section.items : (section.carte_items || []).sort((a, b) => a.ordre - b.ordre)
      let groups = [], current = null
      for (const item of items) {
        const r = item.relation || 'et'
        if (r === 'et') {
          if (current) groups.push(current)
          current = { et: item, ous: [] }
        } else if (current) {
          current.ous.push(item)
        }
      }
      if (current) groups.push(current)

      for (const g of groups) {
        const etCost = isSrc ? (getFiche(g.et.ficheId)?.cout_portion || 0) : (g.et.fiches?.cout_portion || 0)
        if (g.ous.length === 0) {
          coutMatiere += etCost
        } else {
          const ouAvecSup = g.ous.find(o => Number(o.supplement) > 0)
          if (ouAvecSup) {
            if (baseOnly) {
              // Vue base : client ne prend pas le suppl. → coût du plat "et"
              coutMatiere += etCost
            } else {
              // Vue complète : on retient le coût du plat ou + supplément
              coutMatiere += isSrc ? (getFiche(ouAvecSup.ficheId)?.cout_portion || 0) : (ouAvecSup.fiches?.cout_portion || 0)
              totalSupp += Number(ouAvecSup.supplement)
            }
          } else {
            // ou sans supplément : moyenne des plats liés
            const costs = [etCost, ...g.ous.map(o => isSrc ? (getFiche(o.ficheId)?.cout_portion || 0) : (o.fiches?.cout_portion || 0))]
            coutMatiere += costs.reduce((a, b) => a + b, 0) / costs.length
          }
        }
      }
    }

    const prix = isSrc ? (parseFloat(prixBase) || 0) : (Number(carte?.prix_base) || 0)
    const prixTotal = prix + totalSupp
    const ratio = prixTotal > 0 && coutMatiere > 0 ? (coutMatiere / (prixTotal / 1.10) * 100).toFixed(1) : null

    return { coutMatiere, totalSupp, ratio }
  }

  const seuilVert = parseFloat(params['seuil_vert_cuisine'] || 28)
  const seuilOrange = parseFloat(params['seuil_orange_cuisine'] || 35)

  const fcColor = (fc) => {
    if (!fc) return { bg: c.fond, color: c.texteMuted }
    const n = parseFloat(fc)
    if (n < seuilVert) return { bg: '#EAF3DE', color: '#3B6D11' }
    if (n < seuilOrange) return { bg: '#FAEEDA', color: '#854F0B' }
    return { bg: '#FCEBEB', color: '#A32D2D' }
  }

  // ── Save ──

  const handleSave = async () => {
    if (!nom) { setError('Le nom est obligatoire'); return }
    if (sections.some(s => !s.titre)) { setError('Chaque section doit avoir un titre'); return }
    setSaving(true)
    setError('')
    const clientId = await getClientId()
    if (!clientId) { setSaving(false); return }

    await supabase.from('cartes').update({
      nom, saison, description,
      prix_base: prixBase ? parseFloat(prixBase) : null,
      updated_at: new Date().toISOString()
    }).eq('id', params_route.id).eq('client_id', clientId)

    // Delete old sections (cascade deletes items)
    await supabase.from('carte_sections').delete().eq('carte_id', params_route.id).eq('client_id', clientId)

    for (let sIdx = 0; sIdx < sections.length; sIdx++) {
      const s = sections[sIdx]
      const { data: sec } = await supabase
        .from('carte_sections')
        .insert([{ carte_id: params_route.id, client_id: clientId, titre: s.titre, ordre: sIdx }])
        .select()
        .single()
      if (!sec) continue
      const itemsToInsert = s.items
        .filter(i => i.ficheId)
        .map((i, iIdx) => ({
          section_id: sec.id,
          carte_id: params_route.id,
          client_id: clientId,
          fiche_id: i.ficheId,
          nom: getFiche(i.ficheId)?.nom || '',
          description: i.description || null,
          supplement: i.supplement ? parseFloat(i.supplement) : 0,
          relation: i.relation || 'et',
          ordre: iIdx
        }))
      if (itemsToInsert.length > 0) {
        await supabase.from('carte_items').insert(itemsToInsert)
      }
    }

    await log({
      action: 'MODIFICATION', entite: 'carte', entite_id: params_route.id,
      entite_nom: nom, section: 'cuisine'
    })

    await loadData()
    setSaving(false)
    setEditing(false)
  }

  const handleDelete = async () => {
    if (!confirm('Supprimer cette carte ?')) return
    const clientId = await getClientId()
    if (!clientId) return
    await supabase.from('cartes').delete().eq('id', params_route.id).eq('client_id', clientId)
    await log({ action: 'SUPPRESSION', entite: 'carte', entite_id: params_route.id, entite_nom: carte?.nom, section: 'cuisine' })
    router.push('/cartes')
  }

  // ── Allergènes collectés ──
  const collectAllergenes = () => {
    if (!carte) return []
    const ids = new Set()
    for (const s of carte.carte_sections || []) {
      for (const item of s.carte_items || []) {
        for (const aid of item.fiches?.allergenes || []) ids.add(aid)
      }
    }
    return [...ids]
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: c.fond }}>
      <ChefLoader />
    </div>
  )

  const calcViewBase = calculs('view', true)
  const calcViewFull = calculs('view', false)
  const calcEditBase = calculs('edit', true)
  const calcEditFull = calculs('edit', false)
  const calc = editing ? calcEditFull : (vueSupp ? calcViewFull : calcViewBase)
  const allergenesIds = collectAllergenes()

  return (
    <div className="carte-detail-print-root" style={{ minHeight: '100vh', background: c.fond }}>

      {/* ── HEADER (no-print) — flexWrap + ellipsis pour petits écrans ── */}
      <div className="no-print" style={{
        background: c.principal, borderBottom: `0.5px solid ${c.accent}40`,
        padding: isMobile ? '10px 12px' : '0 24px',
        display: 'flex', flexWrap: 'wrap', alignItems: 'center',
        justifyContent: 'space-between', gap: '10px', rowGap: '10px',
        minHeight: isMobile ? 'auto' : '56px',
        position: 'sticky', top: 0, zIndex: 100,
        boxSizing: 'border-box', maxWidth: '100%',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: isMobile ? 8 : 12,
          minWidth: 0, flex: '1 1 160px', maxWidth: '100%',
        }}>
          <div style={{ flexShrink: 0 }}>
            <Logo height={isMobile ? 26 : 30} couleur="white" nom={nomEtablissement} onClick={() => router.push('/fiches')} />
          </div>
          {!isMobile && <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '13px' }}>|</span>}
          <button type="button" onClick={() => router.push('/cartes')} style={{
            background: 'transparent', border: '0.5px solid rgba(255,255,255,0.2)',
            borderRadius: '8px', padding: isMobile ? '6px 10px' : '6px 12px', fontSize: isMobile ? '12px' : '13px',
            cursor: 'pointer', color: 'rgba(255,255,255,0.7)', flexShrink: 0,
          }}>&larr; Cartes</button>
          <span style={{
            fontSize: isMobile ? '14px' : '15px', fontWeight: '500', color: 'white',
            minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }} title={carte.nom}>{carte.nom}</span>
        </div>
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center',
          justifyContent: 'flex-end', flex: isMobile ? '1 1 100%' : '0 1 auto',
        }}>
          {!editing && (
            <>
              <button onClick={() => setVueSupp(!vueSupp)} style={{
                background: vueSupp ? '#D97706' : 'transparent',
                color: vueSupp ? 'white' : 'rgba(255,255,255,0.7)',
                border: '0.5px solid rgba(255,255,255,0.2)', borderRadius: '8px',
                padding: '6px 12px', fontSize: '12px', cursor: 'pointer'
              }}>{vueSupp ? 'Vue + suppl.' : 'Vue base'}</button>
              <button onClick={() => window.print()} style={{
                background: 'transparent', color: 'rgba(255,255,255,0.7)',
                border: '0.5px solid rgba(255,255,255,0.2)', borderRadius: '8px',
                padding: '6px 12px', fontSize: '12px', cursor: 'pointer'
              }}>Imprimer</button>
              <button onClick={() => setEditing(true)} style={{
                background: c.accent, color: 'white', border: 'none',
                borderRadius: '8px', padding: '6px 16px', fontSize: '13px',
                cursor: 'pointer', fontWeight: '600'
              }}>Modifier</button>
              <button onClick={handleDelete} style={{
                background: 'transparent', color: '#EF4444',
                border: '0.5px solid #EF444440', borderRadius: '8px',
                padding: '6px 12px', fontSize: '12px', cursor: 'pointer'
              }}>Supprimer</button>
            </>
          )}
          {editing && (
            <>
              <button onClick={() => { setEditing(false); loadData() }} style={{
                background: 'transparent', color: 'rgba(255,255,255,0.7)',
                border: '0.5px solid rgba(255,255,255,0.2)', borderRadius: '8px',
                padding: '6px 12px', fontSize: '12px', cursor: 'pointer'
              }}>Annuler</button>
              <button onClick={handleSave} disabled={saving} style={{
                background: saving ? c.texteMuted : c.accent,
                color: 'white', border: 'none', borderRadius: '8px',
                padding: '6px 16px', fontSize: '13px', fontWeight: '600',
                cursor: saving ? 'not-allowed' : 'pointer'
              }}>{saving ? 'Enregistrement...' : 'Enregistrer'}</button>
            </>
          )}
        </div>
      </div>

      {/* ── SCREEN VIEW (no-print) ── */}
      <div className="no-print" style={{ padding: isMobile ? '12px' : '24px', maxWidth: '900px', margin: '0 auto' }}>

        {error && (
          <Alert variant="error" style={{ marginBottom: '20px' }}>
            {error}
          </Alert>
        )}

        {/* ── Mode Vue ── */}
        {!editing && (
          <>
            {/* Info */}
            <div style={{ background: 'white', borderRadius: '12px', padding: '20px', border: `0.5px solid ${c.bordure}`, marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                <div>
                  <div style={{ fontSize: '20px', fontWeight: '500', color: c.texte }}>{carte.nom}</div>
                  {carte.saison && <Badge bg={c.accentClair} color={c.principal} size="sm">{carte.saison}</Badge>}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '10px', color: c.texteMuted, textTransform: 'uppercase' }}>{vueSupp ? 'Prix + suppl.' : 'Prix base'}</div>
                  <div style={{ fontSize: '24px', fontWeight: '500', color: c.texte }}>
                    {vueSupp
                      ? ((Number(carte.prix_base) || 0) + calc.totalSupp).toFixed(0)
                      : (Number(carte.prix_base) || 0).toFixed(0)} &euro;
                  </div>
                </div>
              </div>
              {carte.description && <div style={{ fontSize: '13px', color: c.texteMuted, fontStyle: 'italic' }}>{carte.description}</div>}
            </div>

            {/* Sections */}
            {(carte.carte_sections || []).sort((a, b) => a.ordre - b.ordre).map(section => (
              <div key={section.id} style={{ background: 'white', borderRadius: '12px', padding: '20px', border: `0.5px solid ${c.bordure}`, marginBottom: '12px' }}>
                <div style={{ fontSize: '11px', color: c.accent, textTransform: 'uppercase', letterSpacing: '2px', fontWeight: '600', marginBottom: '12px' }}>
                  {section.titre}
                </div>
                {(section.carte_items || []).sort((a, b) => a.ordre - b.ordre).map((item, idx) => {
                  const isOu = item.relation === 'ou'
                  const hasSup = Number(item.supplement) > 0
                  return (
                    <div key={item.id}>
                      {isOu && (
                        <div style={{ fontSize: '11px', color: '#D97706', fontStyle: 'italic', textAlign: 'center', margin: '2px 0' }}>ou</div>
                      )}
                      <div style={{
                        marginBottom: '6px', paddingBottom: '6px',
                        borderBottom: `0.5px solid ${c.bordure}`,
                        opacity: isOu && hasSup && !vueSupp ? 0.45 : 1
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ fontSize: '14px', fontWeight: isOu ? '400' : '500', color: c.texte }}>
                            {item.nom}
                            {isOu && hasSup && <span style={{ color: '#D97706', fontSize: '12px', marginLeft: '8px' }}>(Suppl. {Number(item.supplement).toFixed(0)} €)</span>}
                            {isOu && !hasSup && <span style={{ color: '#D97706', fontSize: '12px', marginLeft: '8px' }}>(au choix)</span>}
                          </div>
                          <div style={{ fontSize: '12px', color: c.texteMuted, flexShrink: 0 }}>
                            {(item.fiches?.cout_portion || 0).toFixed(2)} €
                          </div>
                        </div>
                        {item.description && (
                          <div style={{ fontSize: '12px', color: c.texteMuted, fontStyle: 'italic', marginTop: '4px', lineHeight: '1.6' }}>
                            {item.description}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            ))}

            {/* Allergènes */}
            {allergenesIds.length > 0 && (
              <div style={{ background: '#FCEBEB', borderRadius: '12px', padding: '14px', marginBottom: '12px', border: '0.5px solid #F09595' }}>
                <div style={{ fontSize: '10px', color: '#A32D2D', textTransform: 'uppercase', letterSpacing: '2px', fontWeight: '600', marginBottom: '6px' }}>Allergènes présents</div>
                <div style={{ fontSize: '12px', color: '#A32D2D', fontWeight: '500' }}>
                  {allergenesIds.map(id => { const a = ALLERGENES.find(a => a.id === id); return a ? `${a.emoji} ${a.label}` : null }).filter(Boolean).join('  •  ')}
                </div>
              </div>
            )}

            {/* Récap ratio */}
            <div style={{ background: 'white', borderRadius: '12px', padding: '20px', border: `0.5px solid ${c.bordure}`, display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: '11px', color: c.texteMuted, fontWeight: '500', textTransform: 'uppercase' }}>Co&ucirc;t mati&egrave;re</div>
                <div style={{ fontSize: '22px', fontWeight: '500', marginTop: '4px', color: c.texte }}>{calc.coutMatiere.toFixed(2)} &euro;</div>
              </div>
              {calc.totalSupp > 0 && (
                <div>
                  <div style={{ fontSize: '11px', color: '#D97706', fontWeight: '500', textTransform: 'uppercase' }}>Dont suppl. prix</div>
                  <div style={{ fontSize: '22px', fontWeight: '500', marginTop: '4px', color: '#D97706' }}>+{calc.totalSupp.toFixed(0)} &euro;</div>
                </div>
              )}
              {calc.ratio && (() => {
                const s = fcColor(calc.ratio)
                return (
                  <div style={{ background: s.bg, borderRadius: '8px', padding: '14px' }}>
                    <div style={{ fontSize: '11px', fontWeight: '500', textTransform: 'uppercase', color: s.color }}>Ratio</div>
                    <div style={{ fontSize: '22px', fontWeight: '500', marginTop: '4px', color: s.color }}>{calc.ratio} %</div>
                  </div>
                )
              })()}
            </div>
          </>
        )}

        {/* ── Mode Édition ── */}
        {editing && (
          <>
            {/* Informations */}
            <div style={{ background: 'white', borderRadius: '12px', padding: '24px', border: `0.5px solid ${c.bordure}`, marginBottom: '16px' }}>
              <div className="sk-label-muted" style={{ fontSize: '13px', color: c.texteMuted, marginBottom: '16px' }}>Informations</div>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '16px' }}>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ fontSize: '12px', color: c.texteMuted, fontWeight: '500', display: 'block', marginBottom: '6px' }}>Nom *</label>
                  <input type="text" value={nom} onChange={e => setNom(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, fontSize: '14px', outline: 'none', color: c.texte, boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: c.texteMuted, fontWeight: '500', display: 'block', marginBottom: '6px' }}>Saison</label>
                  <select value={saison} onChange={e => setSaison(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, fontSize: '14px', background: 'white', outline: 'none', color: c.texte }}>{saisons.map(s => <option key={s}>{s}</option>)}</select>
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: c.texteMuted, fontWeight: '500', display: 'block', marginBottom: '6px' }}>Prix base TTC</label>
                  <input type="number" value={prixBase} onChange={e => setPrixBase(e.target.value)} step="0.01" style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, fontSize: '14px', outline: 'none', color: c.texte, boxSizing: 'border-box' }} />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ fontSize: '12px', color: c.texteMuted, fontWeight: '500', display: 'block', marginBottom: '6px' }}>Description</label>
                  <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, fontSize: '14px', outline: 'none', resize: 'vertical', fontFamily: 'inherit', color: c.texte, boxSizing: 'border-box' }} />
                </div>
              </div>
            </div>

            {/* Sections éditables */}
            {sections.map((section, sIdx) => (
              <div key={section._id} style={{ background: 'white', borderRadius: '12px', padding: '20px', border: `0.5px solid ${c.bordure}`, marginBottom: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                  <input type="text" value={section.titre} onChange={e => updateSection(sIdx, 'titre', e.target.value)}
                    placeholder="Titre de la section" style={{ flex: 1, padding: '10px 12px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, fontSize: '14px', fontWeight: '500', outline: 'none', color: c.texte, boxSizing: 'border-box' }} />
                  <span style={{ fontSize: '11px', color: c.texteMuted }}>Section {sIdx + 1}</span>
                  {sections.length > 1 && (
                    <button onClick={() => removeSection(sIdx)} style={{ background: 'transparent', border: 'none', color: '#A32D2D', fontSize: '18px', cursor: 'pointer' }}>&times;</button>
                  )}
                </div>
                {section.items.map((item, iIdx) => {
                  const fiche = getFiche(item.ficheId)
                  const isOu = item.relation === 'ou'
                  const hasSup = Number(item.supplement) > 0
                  return (
                    <div key={item._id}>
                      {iIdx > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'center', margin: '4px 0' }}>
                          <div style={{ display: 'flex', borderRadius: '6px', overflow: 'hidden', border: `1px solid ${c.bordure}` }}>
                            <button onClick={() => updateItem(sIdx, iIdx, 'relation', 'et')} style={{ padding: '3px 12px', fontSize: '11px', fontWeight: '600', cursor: 'pointer', border: 'none', background: !isOu ? c.accent : 'white', color: !isOu ? 'white' : c.texteMuted }}>ET</button>
                            <button onClick={() => updateItem(sIdx, iIdx, 'relation', 'ou')} style={{ padding: '3px 12px', fontSize: '11px', fontWeight: '600', cursor: 'pointer', border: 'none', background: isOu ? '#D97706' : 'white', color: isOu ? 'white' : c.texteMuted }}>OU</button>
                          </div>
                        </div>
                      )}
                      <div style={{ background: isOu ? '#FFF7ED' : c.fond, borderRadius: '8px', padding: '12px', marginBottom: '4px', border: `0.5px solid ${isOu ? '#FDBA7440' : c.bordure}` }}>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
                          <select value={item.ficheId} onChange={e => updateItem(sIdx, iIdx, 'ficheId', e.target.value)} style={{ flex: 1, padding: '8px 10px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, fontSize: '13px', background: 'white', outline: 'none', color: c.texte }}>
                            <option value="">-- Choisir une fiche --</option>
                            {fiches.map(f => <option key={f.id} value={f.id}>{f.nom} {f.categorie ? `(${f.categorie})` : ''}</option>)}
                          </select>
                          {isOu && (
                            <input type="number" value={item.supplement} onChange={e => updateItem(sIdx, iIdx, 'supplement', e.target.value)} placeholder="Suppl. €" step="0.01" min="0" style={{ width: '100px', padding: '8px 10px', borderRadius: '8px', border: `0.5px solid ${hasSup ? '#FDBA74' : c.bordure}`, fontSize: '13px', outline: 'none', color: c.texte, boxSizing: 'border-box' }} />
                          )}
                          {section.items.length > 1 && <button onClick={() => removeItem(sIdx, iIdx)} style={{ background: 'transparent', border: 'none', color: '#A32D2D', fontSize: '16px', cursor: 'pointer' }}>×</button>}
                        </div>
                        <textarea value={item.description} onChange={e => updateItem(sIdx, iIdx, 'description', e.target.value)} placeholder="Description gastronomique" rows={1} style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, fontSize: '12px', outline: 'none', resize: 'vertical', fontFamily: 'inherit', fontStyle: 'italic', color: c.texteMuted, boxSizing: 'border-box' }} />
                        {fiche && <div style={{ fontSize: '11px', color: c.texteMuted, marginTop: '4px' }}>{isOu ? 'Alternative' : 'Inclus'} — coût : <strong>{(fiche.cout_portion || 0).toFixed(2)} €</strong>{isOu && hasSup && <span style={{ color: '#D97706', marginLeft: '8px' }}>Suppl. +{Number(item.supplement).toFixed(0)} €</span>}{isOu && !hasSup && <span style={{ color: '#D97706', marginLeft: '8px' }}>Choix libre</span>}</div>}
                      </div>
                    </div>
                  )
                })}
                <button onClick={() => addItem(sIdx)} style={{ background: 'transparent', border: `1px dashed ${c.bordure}`, borderRadius: '8px', padding: '8px', width: '100%', fontSize: '12px', color: c.texteMuted, cursor: 'pointer', marginTop: '4px' }}>+ Ajouter un plat</button>
              </div>
            ))}
            <button onClick={addSection} style={{ background: c.accentClair, border: `1px dashed ${c.accent}`, borderRadius: '12px', padding: '14px', width: '100%', fontSize: '13px', color: c.accent, cursor: 'pointer', fontWeight: '500', marginBottom: '16px' }}>+ Ajouter une section</button>

            {/* Récap édition */}
            <div style={{ background: 'white', borderRadius: '12px', padding: '20px', border: `0.5px solid ${c.bordure}`, display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: '11px', color: c.texteMuted, fontWeight: '500', textTransform: 'uppercase' }}>Co&ucirc;t mati&egrave;re</div>
                <div style={{ fontSize: '22px', fontWeight: '500', marginTop: '4px', color: c.texte }}>{calcEditFull.coutMatiere.toFixed(2)} &euro;</div>
              </div>
              {calcEditFull.totalSupp > 0 ? (
                <>
                  {calcEditBase.ratio && (() => { const s = fcColor(calcEditBase.ratio); return (<div style={{ background: s.bg, borderRadius: '8px', padding: '14px' }}><div style={{ fontSize: '11px', fontWeight: '500', textTransform: 'uppercase', color: s.color }}>Ratio base</div><div style={{ fontSize: '22px', fontWeight: '500', marginTop: '4px', color: s.color }}>{calcEditBase.ratio} %</div></div>) })()}
                  {calcEditFull.ratio && (() => { const s = fcColor(calcEditFull.ratio); return (<div style={{ background: s.bg, borderRadius: '8px', padding: '14px' }}><div style={{ fontSize: '11px', fontWeight: '500', textTransform: 'uppercase', color: s.color }}>Ratio + suppl.</div><div style={{ fontSize: '22px', fontWeight: '500', marginTop: '4px', color: s.color }}>{calcEditFull.ratio} %</div></div>) })()}
                </>
              ) : (
                calcEditFull.ratio && (() => { const s = fcColor(calcEditFull.ratio); return (<div style={{ background: s.bg, borderRadius: '8px', padding: '14px' }}><div style={{ fontSize: '11px', fontWeight: '500', textTransform: 'uppercase', color: s.color }}>Ratio</div><div style={{ fontSize: '22px', fontWeight: '500', marginTop: '4px', color: s.color }}>{calcEditFull.ratio} %</div></div>) })()
              )}
            </div>
          </>
        )}
      </div>

      {/* ── VERSION IMPRESSION ── */}
      <div className="print-only" style={{ fontFamily: 'Georgia, serif', color: '#2C1810', background: 'white', padding: '0', width: '100%' }}>

        <div className="carte-print-body">
        {/* En-tête */}
        <div style={{ textAlign: 'center', borderBottom: '1px solid #e8e4dc', paddingBottom: '20px', marginBottom: '24px' }}>
          {logoUrl
            ? <img src={logoUrl} alt={nomEtablissement} style={{ height: '50px', objectFit: 'contain', marginBottom: '12px' }} />
            : <div style={{ fontSize: '18px', fontWeight: '700', color: '#2C1810', marginBottom: '8px' }}>{nomEtablissement}</div>
          }
          <h1 style={{ fontSize: '28px', fontWeight: '400', color: '#2C1810', letterSpacing: '2px', marginBottom: '6px' }}>{carte.nom}</h1>
          {carte.description && <div style={{ fontSize: '12px', color: '#8B7355', fontStyle: 'italic' }}>{carte.description}</div>}
          {carte.saison && <div style={{ fontSize: '10px', color: '#8B7355', letterSpacing: '2px', textTransform: 'uppercase', marginTop: '6px' }}>{carte.saison}</div>}
        </div>

        {/* Sections */}
        {(carte.carte_sections || []).sort((a, b) => a.ordre - b.ordre).map(section => (
          <div key={section.id} style={{ marginBottom: '24px' }}>
            <div style={{ fontSize: '10px', letterSpacing: '3px', textTransform: 'uppercase', color: '#8B7355', marginBottom: '14px', fontFamily: 'sans-serif', fontWeight: '600', textAlign: 'center' }}>
              {section.titre}
            </div>
            {(section.carte_items || []).sort((a, b) => a.ordre - b.ordre).map((item, idx, arr) => {
              const isOu = item.relation === 'ou'
              const hasSup = Number(item.supplement) > 0
              const nextIsOu = arr[idx + 1]?.relation === 'ou'
              return (
                <div key={item.id} style={{ textAlign: 'center', marginBottom: nextIsOu || isOu ? '4px' : '16px' }}>
                  {isOu && <div style={{ fontSize: '11px', color: '#8B7355', fontStyle: 'italic', marginBottom: '4px' }}>ou</div>}
                  <div style={{ fontSize: '14px', color: '#2C1810', fontWeight: '500' }}>
                    {item.nom}
                    {isOu && hasSup && <span style={{ fontSize: '11px', color: '#8B7355', fontStyle: 'italic' }}> (Suppl. {Number(item.supplement).toFixed(0)}€)</span>}
                  </div>
                  {item.description && (
                    <div style={{ fontSize: '11px', color: '#8B7355', fontStyle: 'italic', lineHeight: '1.6', maxWidth: '500px', margin: '4px auto 0' }}>
                      {item.description}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ))}

        {/* Prix */}
        <div style={{ textAlign: 'center', borderTop: '1px solid #e8e4dc', paddingTop: '20px', marginTop: '8px' }}>
          <div style={{ fontSize: '22px', fontWeight: '400', color: '#2C1810', letterSpacing: '1px' }}>
            {Number(carte.prix_base || 0).toFixed(0)}&euro;
          </div>
        </div>

        {/* Allergènes (flux : juste au-dessus du trait du pied de page fixe à l’impression) */}
        {allergenesIds.length > 0 && (
          <div className="carte-print-allergenes" style={{ marginTop: '20px', fontSize: '9px', color: '#8B7355', textAlign: 'center', fontFamily: 'sans-serif' }}>
            Allergènes présents : {allergenesIds.map(id => { const a = ALLERGENES.find(a => a.id === id); return a ? a.label : null }).filter(Boolean).join(', ')}
          </div>
        )}
        </div>

        {/* Pied de page : fixe en bas de page à l’impression uniquement (styles dans @media print) */}
        <div className="carte-print-footer">
          <span>{nomEtablissement}</span>
          <span>{carte.nom}</span>
        </div>
      </div>
    </div>
  )
}
