'use client'
import { useState, useEffect } from 'react'
import { supabase, getParametres, getClientId } from '../../../lib/supabase'
import { useRouter, useParams } from 'next/navigation'
import { theme, Logo } from '../../../lib/theme.jsx'
import { useTheme } from '../../../lib/useTheme'
import { useIsMobile } from '../../../lib/useIsMobile'
import { log } from '../../../lib/useLog'
import { ALLERGENES } from '../../../lib/allergenes'

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
        body { background: white !important; margin: 0; padding: 0; }
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
      .select(`*, carte_sections(id, titre, ordre, carte_items(id, nom, description, supplement, ordre, fiche_id, fiches(id, nom, cout_portion, allergenes)))`)
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
            supplement: i.supplement ? String(i.supplement) : ''
          }))
      }))
    setSections(sortedSections.length > 0 ? sortedSections : [{ _id: genId(), titre: '', items: [{ _id: genId(), ficheId: '', description: '', supplement: '' }] }])
    setLoading(false)
  }

  // ── Section/Item helpers (same as nouveau) ──

  const addSection = () => setSections([...sections, { _id: genId(), titre: '', items: [{ _id: genId(), ficheId: '', description: '', supplement: '' }] }])
  const removeSection = (sIdx) => { if (sections.length <= 1) return; setSections(sections.filter((_, i) => i !== sIdx)) }
  const updateSection = (sIdx, field, value) => { const copy = [...sections]; copy[sIdx] = { ...copy[sIdx], [field]: value }; setSections(copy) }
  const addItem = (sIdx) => { const copy = [...sections]; copy[sIdx].items = [...copy[sIdx].items, { _id: genId(), ficheId: '', description: '', supplement: '' }]; setSections(copy) }
  const removeItem = (sIdx, iIdx) => { const copy = [...sections]; if (copy[sIdx].items.length <= 1) return; copy[sIdx].items = copy[sIdx].items.filter((_, i) => i !== iIdx); setSections(copy) }
  const updateItem = (sIdx, iIdx, field, value) => { const copy = [...sections]; copy[sIdx].items = [...copy[sIdx].items]; copy[sIdx].items[iIdx] = { ...copy[sIdx].items[iIdx], [field]: value }; setSections(copy) }

  // ── Calculs ──

  const getFiche = (ficheId) => fiches.find(f => f.id === ficheId)

  const getAllItems = (src) => {
    if (src === 'edit') return sections.flatMap(s => s.items)
    if (!carte) return []
    return (carte.carte_sections || []).flatMap(s => s.carte_items || [])
  }

  const calculs = (src) => {
    const items = getAllItems(src)
    const isSrc = src === 'edit'

    const coutBase = items
      .filter(i => {
        const sup = isSrc ? Number(i.supplement) : Number(i.supplement)
        return !sup || sup === 0
      })
      .reduce((s, i) => {
        const cp = isSrc ? (getFiche(i.ficheId)?.cout_portion || 0) : (i.fiches?.cout_portion || 0)
        return s + cp
      }, 0)

    const coutTotal = items.reduce((s, i) => {
      const cp = isSrc ? (getFiche(i.ficheId)?.cout_portion || 0) : (i.fiches?.cout_portion || 0)
      return s + cp
    }, 0)

    const totalSupp = items.reduce((s, i) => s + (Number(i.supplement) || 0), 0)

    const prix = isSrc ? (parseFloat(prixBase) || 0) : (Number(carte?.prix_base) || 0)
    const fcBase = prix > 0 && coutBase > 0 ? (coutBase / (prix / 1.10) * 100).toFixed(1) : null
    const fcSupp = (prix + totalSupp) > 0 && coutTotal > 0 ? (coutTotal / ((prix + totalSupp) / 1.10) * 100).toFixed(1) : null

    return { coutBase, coutTotal, totalSupp, fcBase, fcSupp }
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
      <div style={{ fontSize: '14px', color: c.texteMuted }}>Chargement...</div>
    </div>
  )

  const calc = calculs(editing ? 'edit' : 'view')
  const allergenesIds = collectAllergenes()
  const today = new Date().toLocaleDateString('fr-FR')

  return (
    <div style={{ minHeight: '100vh', background: c.fond }}>

      {/* ── HEADER (no-print) ── */}
      <div className="no-print" style={{
        background: c.principal, borderBottom: `0.5px solid ${c.accent}40`,
        padding: '0 24px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', height: '56px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Logo height={30} couleur="white" nom={nomEtablissement} onClick={() => router.push('/fiches')} />
          <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '13px' }}>|</span>
          <button onClick={() => router.push('/cartes')} style={{
            background: 'transparent', border: '0.5px solid rgba(255,255,255,0.2)',
            borderRadius: '8px', padding: '6px 12px', fontSize: '13px',
            cursor: 'pointer', color: 'rgba(255,255,255,0.7)'
          }}>&larr; Cartes</button>
          <span style={{ fontSize: '15px', fontWeight: '500', color: 'white' }}>{carte.nom}</span>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
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
          <div style={{ background: '#FCEBEB', color: '#A32D2D', borderRadius: '8px', padding: '12px 16px', fontSize: '13px', marginBottom: '20px' }}>
            {error}
          </div>
        )}

        {/* ── Mode Vue ── */}
        {!editing && (
          <>
            {/* Info */}
            <div style={{ background: 'white', borderRadius: '12px', padding: '20px', border: `0.5px solid ${c.bordure}`, marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                <div>
                  <div style={{ fontSize: '20px', fontWeight: '500', color: c.texte }}>{carte.nom}</div>
                  {carte.saison && <span style={{ background: c.accentClair, color: c.principal, borderRadius: '20px', padding: '2px 10px', fontSize: '11px', fontWeight: '500' }}>{carte.saison}</span>}
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
                {(section.carte_items || []).sort((a, b) => a.ordre - b.ordre).map(item => {
                  const hasSup = Number(item.supplement) > 0
                  if (!vueSupp && hasSup) return null
                  return (
                    <div key={item.id} style={{
                      marginBottom: '14px', paddingBottom: '14px',
                      borderBottom: `0.5px solid ${c.bordure}`
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ fontSize: '14px', fontWeight: '500', color: c.texte }}>
                          {item.nom}
                          {hasSup && <span style={{ color: '#D97706', fontSize: '12px', marginLeft: '8px' }}>(Suppl. {Number(item.supplement).toFixed(0)} &euro;)</span>}
                        </div>
                        <div style={{ fontSize: '12px', color: c.texteMuted }}>
                          {(item.fiches?.cout_portion || 0).toFixed(2)} &euro;
                        </div>
                      </div>
                      {item.description && (
                        <div style={{ fontSize: '12px', color: c.texteMuted, fontStyle: 'italic', marginTop: '4px', lineHeight: '1.6' }}>
                          {item.description}
                        </div>
                      )}
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

            {/* Récap food cost */}
            <div style={{ background: 'white', borderRadius: '12px', padding: '20px', border: `0.5px solid ${c.bordure}`, display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: '11px', color: c.texteMuted, fontWeight: '500', textTransform: 'uppercase' }}>Co&ucirc;t base</div>
                <div style={{ fontSize: '22px', fontWeight: '500', marginTop: '4px', color: c.texte }}>{calc.coutBase.toFixed(2)} &euro;</div>
              </div>
              {calc.totalSupp > 0 && (
                <div>
                  <div style={{ fontSize: '11px', color: '#D97706', fontWeight: '500', textTransform: 'uppercase' }}>Co&ucirc;t total</div>
                  <div style={{ fontSize: '22px', fontWeight: '500', marginTop: '4px', color: '#D97706' }}>{calc.coutTotal.toFixed(2)} &euro;</div>
                </div>
              )}
              {calc.fcBase && (() => {
                const s = fcColor(calc.fcBase)
                return (
                  <div style={{ background: s.bg, borderRadius: '8px', padding: '14px' }}>
                    <div style={{ fontSize: '11px', fontWeight: '500', textTransform: 'uppercase', color: s.color }}>FC base</div>
                    <div style={{ fontSize: '22px', fontWeight: '500', marginTop: '4px', color: s.color }}>{calc.fcBase} %</div>
                  </div>
                )
              })()}
              {calc.fcSupp && calc.totalSupp > 0 && (() => {
                const s = fcColor(calc.fcSupp)
                return (
                  <div style={{ background: s.bg, borderRadius: '8px', padding: '14px' }}>
                    <div style={{ fontSize: '11px', fontWeight: '500', textTransform: 'uppercase', color: s.color }}>FC + suppl.</div>
                    <div style={{ fontSize: '22px', fontWeight: '500', marginTop: '4px', color: s.color }}>{calc.fcSupp} %</div>
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
              <div style={{ fontSize: '13px', fontWeight: '500', color: c.texteMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '16px' }}>Informations</div>
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
                  const hasSup = Number(item.supplement) > 0
                  return (
                    <div key={item._id} style={{ background: hasSup ? '#FFF7ED' : c.fond, borderRadius: '8px', padding: '12px', marginBottom: '8px', border: `0.5px solid ${hasSup ? '#FDBA7440' : c.bordure}` }}>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
                        <select value={item.ficheId} onChange={e => updateItem(sIdx, iIdx, 'ficheId', e.target.value)} style={{ flex: 1, padding: '8px 10px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, fontSize: '13px', background: 'white', outline: 'none', color: c.texte }}>
                          <option value="">-- Choisir une fiche --</option>
                          {fiches.map(f => <option key={f.id} value={f.id}>{f.nom} {f.categorie ? `(${f.categorie})` : ''}</option>)}
                        </select>
                        <input type="number" value={item.supplement} onChange={e => updateItem(sIdx, iIdx, 'supplement', e.target.value)} placeholder="Suppl. €" step="0.01" min="0" style={{ width: '100px', padding: '8px 10px', borderRadius: '8px', border: `0.5px solid ${hasSup ? '#FDBA74' : c.bordure}`, fontSize: '13px', outline: 'none', color: c.texte, boxSizing: 'border-box' }} />
                        {section.items.length > 1 && <button onClick={() => removeItem(sIdx, iIdx)} style={{ background: 'transparent', border: 'none', color: '#A32D2D', fontSize: '16px', cursor: 'pointer' }}>&times;</button>}
                      </div>
                      <textarea value={item.description} onChange={e => updateItem(sIdx, iIdx, 'description', e.target.value)} placeholder="Description gastronomique" rows={1} style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, fontSize: '12px', outline: 'none', resize: 'vertical', fontFamily: 'inherit', fontStyle: 'italic', color: c.texteMuted, boxSizing: 'border-box' }} />
                      {fiche && <div style={{ fontSize: '11px', color: c.texteMuted, marginTop: '4px' }}>Co&ucirc;t : <strong>{(fiche.cout_portion || 0).toFixed(2)} &euro;</strong>{hasSup && <span style={{ color: '#D97706', marginLeft: '8px' }}>Suppl. +{Number(item.supplement).toFixed(0)} &euro;</span>}</div>}
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
                <div style={{ fontSize: '11px', color: c.texteMuted, fontWeight: '500', textTransform: 'uppercase' }}>Co&ucirc;t base</div>
                <div style={{ fontSize: '22px', fontWeight: '500', marginTop: '4px', color: c.texte }}>{calc.coutBase.toFixed(2)} &euro;</div>
              </div>
              {calc.fcBase && (() => { const s = fcColor(calc.fcBase); return (<div style={{ background: s.bg, borderRadius: '8px', padding: '14px' }}><div style={{ fontSize: '11px', fontWeight: '500', textTransform: 'uppercase', color: s.color }}>FC base</div><div style={{ fontSize: '22px', fontWeight: '500', marginTop: '4px', color: s.color }}>{calc.fcBase} %</div></div>) })()}
              {calc.fcSupp && calc.totalSupp > 0 && (() => { const s = fcColor(calc.fcSupp); return (<div style={{ background: s.bg, borderRadius: '8px', padding: '14px' }}><div style={{ fontSize: '11px', fontWeight: '500', textTransform: 'uppercase', color: s.color }}>FC + suppl.</div><div style={{ fontSize: '22px', fontWeight: '500', marginTop: '4px', color: s.color }}>{calc.fcSupp} %</div></div>) })()}
            </div>
          </>
        )}
      </div>

      {/* ── VERSION IMPRESSION ── */}
      <div className="print-only" style={{ fontFamily: 'Georgia, serif', color: '#2C1810', background: 'white', padding: '0', width: '100%' }}>

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
              const hasSup = Number(item.supplement) > 0
              const nextHasSup = arr[idx + 1] && Number(arr[idx + 1].supplement) > 0
              return (
                <div key={item.id} style={{ textAlign: 'center', marginBottom: nextHasSup || hasSup ? '4px' : '16px' }}>
                  {hasSup && <div style={{ fontSize: '11px', color: '#8B7355', fontStyle: 'italic', marginBottom: '4px' }}>ou</div>}
                  <div style={{ fontSize: '14px', color: '#2C1810', fontWeight: '500' }}>
                    {item.nom}
                    {hasSup && <span style={{ fontSize: '11px', color: '#8B7355', fontStyle: 'italic' }}> (Suppl. {Number(item.supplement).toFixed(0)}&euro;)</span>}
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

        {/* Allergènes */}
        {allergenesIds.length > 0 && (
          <div style={{ marginTop: '20px', fontSize: '9px', color: '#8B7355', textAlign: 'center', fontFamily: 'sans-serif' }}>
            Allergènes présents : {allergenesIds.map(id => { const a = ALLERGENES.find(a => a.id === id); return a ? a.label : null }).filter(Boolean).join(', ')}
          </div>
        )}

        {/* Footer */}
        <div style={{ borderTop: '1px solid #e8e4dc', paddingTop: '12px', marginTop: '16px', display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: '#8B7355', fontFamily: 'sans-serif' }}>
          <span>{nomEtablissement}</span>
          <span>{carte.nom} — Imprimé le {today}</span>
        </div>
      </div>
    </div>
  )
}
