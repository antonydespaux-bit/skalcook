'use client'
import { useState, useEffect } from 'react'
import { supabase, getParametres, getClientId } from '../../../lib/supabase'
import { useRouter } from 'next/navigation'
import { theme, Logo } from '../../../lib/theme.jsx'
import { useTheme } from '../../../lib/useTheme'
import { useIsMobile } from '../../../lib/useIsMobile'
import { log } from '../../../lib/useLog'

const genId = () => crypto.randomUUID()

export default function NouvelleCarte() {
  const { nomEtablissement } = useTheme()
  const isMobile = useIsMobile()
  const [nom, setNom] = useState('')
  const [saison, setSaison] = useState('Printemps 2026')
  const [prixBase, setPrixBase] = useState('')
  const [description, setDescription] = useState('')
  const [sections, setSections] = useState([{ _id: genId(), titre: '', items: [{ _id: genId(), ficheId: '', description: '', supplement: '', relation: 'et' }] }])
  const [fiches, setFiches] = useState([])
  const [params, setParams] = useState({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()
  const c = theme.couleurs
  const saisons = theme.saisons

  useEffect(() => {
    checkUser()
    loadFiches()
    loadParams()
  }, [])

  const checkUser = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) router.push('/')
  }

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

  // ── Sections / Items helpers ──

  const addSection = () => {
    setSections([...sections, { _id: genId(), titre: '', items: [{ _id: genId(), ficheId: '', description: '', supplement: '', relation: 'et' }] }])
  }

  const removeSection = (sIdx) => {
    if (sections.length <= 1) return
    setSections(sections.filter((_, i) => i !== sIdx))
  }

  const updateSection = (sIdx, field, value) => {
    const copy = [...sections]
    copy[sIdx] = { ...copy[sIdx], [field]: value }
    setSections(copy)
  }

  const addItem = (sIdx) => {
    const copy = [...sections]
    copy[sIdx].items = [...copy[sIdx].items, { _id: genId(), ficheId: '', description: '', supplement: '', relation: 'et' }]
    setSections(copy)
  }

  const removeItem = (sIdx, iIdx) => {
    const copy = [...sections]
    if (copy[sIdx].items.length <= 1) return
    copy[sIdx].items = copy[sIdx].items.filter((_, i) => i !== iIdx)
    setSections(copy)
  }

  const updateItem = (sIdx, iIdx, field, value) => {
    const copy = [...sections]
    copy[sIdx].items = [...copy[sIdx].items]
    copy[sIdx].items[iIdx] = { ...copy[sIdx].items[iIdx], [field]: value }
    setSections(copy)
  }

  // ── Food cost ──

  const allItems = sections.flatMap(s => s.items)

  const getFiche = (ficheId) => fiches.find(f => f.id === ficheId)

  const coutBase = allItems
    .filter(i => i.relation !== 'ou')
    .reduce((s, i) => s + (getFiche(i.ficheId)?.cout_portion || 0), 0)

  const coutTotal = allItems
    .reduce((s, i) => s + (getFiche(i.ficheId)?.cout_portion || 0), 0)

  const totalSupplements = allItems
    .filter(i => i.relation === 'ou')
    .reduce((s, i) => s + (Number(i.supplement) || 0), 0)

  const prix = parseFloat(prixBase) || 0

  const fcBase = prix > 0 && coutBase > 0
    ? (coutBase / (prix / 1.10) * 100).toFixed(1)
    : null

  const fcAvecSupp = (prix + totalSupplements) > 0 && coutTotal > 0
    ? (coutTotal / ((prix + totalSupplements) / 1.10) * 100).toFixed(1)
    : null

  const seuilVert = parseFloat(params['seuil_vert_cuisine'] || 28)
  const seuilOrange = parseFloat(params['seuil_orange_cuisine'] || 35)

  const prixIndicatif = coutBase > 0
    ? (coutBase / (seuilVert / 100) * (1 + parseFloat(params['tva_restauration'] || 10) / 100)).toFixed(2)
    : null

  const fcColor = (fc) => {
    if (!fc) return { bg: c.fond, color: c.texteMuted }
    const n = parseFloat(fc)
    if (n < seuilVert) return { bg: '#EAF3DE', color: '#3B6D11' }
    if (n < seuilOrange) return { bg: '#FAEEDA', color: '#854F0B' }
    return { bg: '#FCEBEB', color: '#A32D2D' }
  }

  // ── Submit ──

  const handleSubmit = async () => {
    if (!nom) { setError('Le nom de la carte est obligatoire'); return }
    if (sections.some(s => !s.titre)) { setError('Chaque section doit avoir un titre'); return }
    setLoading(true)
    setError('')

    const clientId = await getClientId()
    if (!clientId) { setError('Session expirée'); setLoading(false); return }

    const { data: carte, error: errCarte } = await supabase
      .from('cartes')
      .insert([{
        nom, saison, description,
        prix_base: prixBase ? parseFloat(prixBase) : null,
        client_id: clientId
      }])
      .select()
      .single()

    if (errCarte) { setError('Erreur : ' + errCarte.message); setLoading(false); return }

    for (let sIdx = 0; sIdx < sections.length; sIdx++) {
      const s = sections[sIdx]
      const { data: sec, error: errSec } = await supabase
        .from('carte_sections')
        .insert([{ carte_id: carte.id, client_id: clientId, titre: s.titre, ordre: sIdx }])
        .select()
        .single()

      if (errSec) { setError('Erreur section : ' + errSec.message); setLoading(false); return }

      const itemsToInsert = s.items
        .filter(i => i.ficheId)
        .map((i, iIdx) => ({
          section_id: sec.id,
          carte_id: carte.id,
          client_id: clientId,
          fiche_id: i.ficheId,
          nom: getFiche(i.ficheId)?.nom || '',
          description: i.description || null,
          supplement: i.supplement ? parseFloat(i.supplement) : 0,
          relation: i.relation || 'et',
          ordre: iIdx
        }))

      if (itemsToInsert.length > 0) {
        const { error: errItems } = await supabase.from('carte_items').insert(itemsToInsert)
        if (errItems) { setError('Erreur items : ' + errItems.message); setLoading(false); return }
      }
    }

    await log({
      action: 'CREATION', entite: 'carte', entite_id: carte.id,
      entite_nom: nom, section: 'cuisine',
      details: `Saison: ${saison}, ${sections.length} sections`
    })

    router.push('/cartes')
  }

  // ── Render ──

  return (
    <div style={{ minHeight: '100vh', background: c.fond }}>

      {/* Header */}
      <div style={{
        background: c.principal,
        borderBottom: `0.5px solid ${c.accent}40`,
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
          }}>&larr; Retour</button>
          <span style={{ fontSize: '15px', fontWeight: '500', color: 'white' }}>Nouvelle carte</span>
        </div>
        <button onClick={handleSubmit} disabled={loading} style={{
          background: loading ? c.texteMuted : c.accent,
          color: 'white', border: 'none', borderRadius: '8px',
          padding: '8px 20px', fontSize: '13px', fontWeight: '600',
          cursor: loading ? 'not-allowed' : 'pointer'
        }}>
          {loading ? 'Enregistrement...' : 'Enregistrer la carte'}
        </button>
      </div>

      <div style={{ padding: isMobile ? '12px' : '24px', maxWidth: '900px', margin: '0 auto' }}>

        {error && (
          <div style={{ background: '#FCEBEB', color: '#A32D2D', borderRadius: '8px', padding: '12px 16px', fontSize: '13px', marginBottom: '20px' }}>
            {error}
          </div>
        )}

        {/* Informations */}
        <div style={{ background: 'white', borderRadius: '12px', padding: '24px', border: `0.5px solid ${c.bordure}`, marginBottom: '16px' }}>
          <div style={{ fontSize: '13px', fontWeight: '500', color: c.texteMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '16px' }}>
            Informations de la carte
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '16px' }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ fontSize: '12px', color: c.texteMuted, fontWeight: '500', display: 'block', marginBottom: '6px' }}>Nom de la carte *</label>
              <input type="text" value={nom} onChange={e => setNom(e.target.value)}
                placeholder="Ex : Menu Dégustation Printemps"
                style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, fontSize: '14px', outline: 'none', color: c.texte, boxSizing: 'border-box' }}
              />
            </div>
            <div>
              <label style={{ fontSize: '12px', color: c.texteMuted, fontWeight: '500', display: 'block', marginBottom: '6px' }}>Saison</label>
              <select value={saison} onChange={e => setSaison(e.target.value)} style={{
                width: '100%', padding: '10px 12px', borderRadius: '8px',
                border: `0.5px solid ${c.bordure}`, fontSize: '14px',
                background: 'white', outline: 'none', color: c.texte
              }}>
                {saisons.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: '12px', color: c.texteMuted, fontWeight: '500', display: 'block', marginBottom: '6px' }}>Prix de base TTC (&euro;)</label>
              <input type="number" value={prixBase} onChange={e => setPrixBase(e.target.value)}
                placeholder="Ex : 260" step="0.01"
                style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, fontSize: '14px', outline: 'none', color: c.texte, boxSizing: 'border-box' }}
              />
              {prixIndicatif && (
                <div style={{ fontSize: '11px', color: c.vert, marginTop: '4px' }}>
                  Prix indicatif ({seuilVert}% FC) : <strong>{prixIndicatif} &euro;</strong>
                </div>
              )}
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ fontSize: '12px', color: c.texteMuted, fontWeight: '500', display: 'block', marginBottom: '6px' }}>Description</label>
              <textarea value={description} onChange={e => setDescription(e.target.value)}
                placeholder="Description de la carte..." rows={2}
                style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, fontSize: '14px', outline: 'none', resize: 'vertical', fontFamily: 'inherit', color: c.texte, boxSizing: 'border-box' }}
              />
            </div>
          </div>
        </div>

        {/* Sections */}
        {sections.map((section, sIdx) => (
          <div key={section._id} style={{ background: 'white', borderRadius: '12px', padding: '20px', border: `0.5px solid ${c.bordure}`, marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <div style={{ flex: 1 }}>
                <input type="text" value={section.titre} onChange={e => updateSection(sIdx, 'titre', e.target.value)}
                  placeholder={`Titre de la section (ex : Entr\u00e9es, Poissons, Viandes...)`}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, fontSize: '14px', fontWeight: '500', outline: 'none', color: c.texte, boxSizing: 'border-box' }}
                />
              </div>
              <span style={{ fontSize: '11px', color: c.texteMuted }}>Section {sIdx + 1}</span>
              {sections.length > 1 && (
                <button onClick={() => removeSection(sIdx)} style={{
                  background: 'transparent', border: 'none', color: '#A32D2D',
                  fontSize: '18px', cursor: 'pointer', padding: '4px 8px'
                }}>&times;</button>
              )}
            </div>

            {section.items.map((item, iIdx) => {
              const fiche = getFiche(item.ficheId)
              const isOu = item.relation === 'ou'
              const hasSup = Number(item.supplement) > 0
              return (
                <div key={item._id}>
                  {/* Sélecteur et/ou (sauf premier item) */}
                  {iIdx > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'center', margin: '4px 0' }}>
                      <div style={{ display: 'flex', borderRadius: '6px', overflow: 'hidden', border: `1px solid ${c.bordure}` }}>
                        <button onClick={() => updateItem(sIdx, iIdx, 'relation', 'et')} style={{
                          padding: '3px 12px', fontSize: '11px', fontWeight: '600', cursor: 'pointer', border: 'none',
                          background: !isOu ? c.accent : 'white', color: !isOu ? 'white' : c.texteMuted
                        }}>ET</button>
                        <button onClick={() => updateItem(sIdx, iIdx, 'relation', 'ou')} style={{
                          padding: '3px 12px', fontSize: '11px', fontWeight: '600', cursor: 'pointer', border: 'none',
                          background: isOu ? '#D97706' : 'white', color: isOu ? 'white' : c.texteMuted
                        }}>OU</button>
                      </div>
                    </div>
                  )}
                  <div style={{
                    background: isOu ? '#FFF7ED' : c.fond, borderRadius: '8px', padding: '12px',
                    marginBottom: '4px', border: `0.5px solid ${isOu ? '#FDBA7440' : c.bordure}`
                  }}>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
                      <select value={item.ficheId} onChange={e => updateItem(sIdx, iIdx, 'ficheId', e.target.value)} style={{
                        flex: 1, padding: '8px 10px', borderRadius: '8px',
                        border: `0.5px solid ${c.bordure}`, fontSize: '13px',
                        background: 'white', outline: 'none', color: c.texte
                      }}>
                        <option value="">-- Choisir une fiche --</option>
                        {fiches.map(f => (
                          <option key={f.id} value={f.id}>{f.nom} {f.categorie ? `(${f.categorie})` : ''}</option>
                        ))}
                      </select>
                      {isOu && (
                        <div style={{ width: '100px' }}>
                          <input type="number" value={item.supplement} onChange={e => updateItem(sIdx, iIdx, 'supplement', e.target.value)}
                            placeholder="Suppl. €" step="0.01" min="0"
                            style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: `0.5px solid ${hasSup ? '#FDBA74' : c.bordure}`, fontSize: '13px', outline: 'none', color: c.texte, boxSizing: 'border-box' }}
                          />
                        </div>
                      )}
                      {section.items.length > 1 && (
                        <button onClick={() => removeItem(sIdx, iIdx)} style={{
                          background: 'transparent', border: 'none', color: '#A32D2D',
                          fontSize: '16px', cursor: 'pointer', padding: '2px 6px'
                        }}>×</button>
                      )}
                    </div>
                    <textarea value={item.description} onChange={e => updateItem(sIdx, iIdx, 'description', e.target.value)}
                      placeholder="Description gastronomique (optionnel)"
                      rows={1}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, fontSize: '12px', outline: 'none', resize: 'vertical', fontFamily: 'inherit', fontStyle: 'italic', color: c.texteMuted, boxSizing: 'border-box' }}
                    />
                    {fiche && (
                      <div style={{ fontSize: '11px', color: c.texteMuted, marginTop: '4px', display: 'flex', gap: '12px' }}>
                        <span>{isOu ? 'Alternative' : 'Inclus'} — coût : <strong>{(fiche.cout_portion || 0).toFixed(2)} €</strong></span>
                        {isOu && hasSup && <span style={{ color: '#D97706' }}>Suppl. : +{Number(item.supplement).toFixed(0)} €</span>}
                        {isOu && !hasSup && <span style={{ color: '#D97706' }}>Choix libre (sans supplément)</span>}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}

            <button onClick={() => addItem(sIdx)} style={{
              background: 'transparent', border: `1px dashed ${c.bordure}`,
              borderRadius: '8px', padding: '8px', width: '100%',
              fontSize: '12px', color: c.texteMuted, cursor: 'pointer', marginTop: '4px'
            }}>+ Ajouter un plat</button>
          </div>
        ))}

        <button onClick={addSection} style={{
          background: c.accentClair, border: `1px dashed ${c.accent}`,
          borderRadius: '12px', padding: '14px', width: '100%',
          fontSize: '13px', color: c.accent, cursor: 'pointer',
          fontWeight: '500', marginBottom: '16px'
        }}>+ Ajouter une section</button>

        {/* Récapitulatif */}
        <div style={{
          background: 'white', borderRadius: '12px', padding: '20px',
          border: `0.5px solid ${c.bordure}`, display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'flex-start'
        }}>
          <div>
            <div style={{ fontSize: '11px', color: c.texteMuted, fontWeight: '500', textTransform: 'uppercase' }}>Co&ucirc;t base</div>
            <div style={{ fontSize: '22px', fontWeight: '500', marginTop: '4px', color: c.texte }}>{coutBase.toFixed(2)} &euro;</div>
          </div>
          {totalSupplements > 0 && (
            <div>
              <div style={{ fontSize: '11px', color: '#D97706', fontWeight: '500', textTransform: 'uppercase' }}>Co&ucirc;t avec suppl.</div>
              <div style={{ fontSize: '22px', fontWeight: '500', marginTop: '4px', color: '#D97706' }}>{coutTotal.toFixed(2)} &euro;</div>
            </div>
          )}
          {fcBase && (() => {
            const s = fcColor(fcBase)
            return (
              <div style={{ background: s.bg, borderRadius: '8px', padding: '14px' }}>
                <div style={{ fontSize: '11px', fontWeight: '500', textTransform: 'uppercase', color: s.color }}>Food cost base</div>
                <div style={{ fontSize: '22px', fontWeight: '500', marginTop: '4px', color: s.color }}>{fcBase} %</div>
              </div>
            )
          })()}
          {fcAvecSupp && totalSupplements > 0 && (() => {
            const s = fcColor(fcAvecSupp)
            return (
              <div style={{ background: s.bg, borderRadius: '8px', padding: '14px' }}>
                <div style={{ fontSize: '11px', fontWeight: '500', textTransform: 'uppercase', color: s.color }}>FC + suppl.</div>
                <div style={{ fontSize: '22px', fontWeight: '500', marginTop: '4px', color: s.color }}>{fcAvecSupp} %</div>
              </div>
            )
          })()}
          {prixIndicatif && (
            <div style={{ background: c.vertClair, borderRadius: '8px', padding: '14px' }}>
              <div style={{ fontSize: '11px', color: c.vert, fontWeight: '500', textTransform: 'uppercase' }}>Prix indicatif TTC</div>
              <div style={{ fontSize: '22px', fontWeight: '500', marginTop: '4px', color: c.vert }}>{prixIndicatif} &euro;</div>
              <div style={{ fontSize: '10px', color: c.vert, opacity: 0.8 }}>Bas&eacute; sur {seuilVert}% FC</div>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
