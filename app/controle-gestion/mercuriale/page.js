'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, getClientId } from '../../../lib/supabase'
import { useIsMobile } from '../../../lib/useIsMobile'
import { useTheme } from '../../../lib/useTheme'
import { useRole } from '../../../lib/useRole'
import Navbar from '../../../components/Navbar'

function fmtPrix(n) {
  if (n == null || Number.isNaN(Number(n))) return '—'
  return Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
}

function fmtDate(s) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

// ── Panier (step 2 ready) ─────────────────────────────────────────────────────
// panier = { [fournisseur]: [ { ingredient_id, ingredient_nom, unite, prix_ref, quantite } ] }
function panierCount(panier) {
  return Object.values(panier).flat().length
}

export default function MercurialePage() {
  const router = useRouter()
  const isMobile = useIsMobile()
  const { c } = useTheme()
  const { role, loading: roleLoading } = useRole()

  const [authReady, setAuthReady] = useState(false)
  const [clientId, setClientId] = useState(null)
  const [rows, setRows] = useState([])
  const [fournisseurs, setFournisseurs] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // ── Filtres ────────────────────────────────────────────────────────────────
  const [search, setSearch] = useState('')
  const [filterFourn, setFilterFourn] = useState('all')

  // ── Panier (step 2 : prêt côté UI) ────────────────────────────────────────
  const [panier, setPanier] = useState({}) // { fournisseur: [{...}] }
  const [addingFor, setAddingFor] = useState(null) // { ingredientId, fourn }
  const [addQty, setAddQty] = useState('')

  // ── Article hors mercuriale ────────────────────────────────────────────────
  const [showLibre, setShowLibre] = useState(false)
  const [libreForm, setLibreForm] = useState({ fourn: '', designation: '', quantite: '', unite: '', prix_ref: '' })

  // ─── Auth ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (cancelled) return
        if (!session) { router.replace('/'); return }
        const cid = await getClientId()
        if (cancelled) return
        setClientId(cid)
        setAuthReady(true)
      } catch {
        if (!cancelled) router.replace('/')
      }
    })()
    return () => { cancelled = true }
  }, [router])

  useEffect(() => {
    if (!roleLoading && role !== 'admin' && role !== 'directeur') {
      router.replace('/dashboard')
    }
  }, [role, roleLoading, router])

  // ─── Chargement ───────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!clientId) return
    setLoading(true)
    setError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`/api/achats/mercuriale?clientId=${clientId}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || 'Erreur chargement mercuriale')
      setRows(result.rows ?? [])
      setFournisseurs(result.fournisseurs ?? [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [clientId])

  useEffect(() => { if (authReady && clientId) load() }, [authReady, clientId, load])

  // ─── Panier ───────────────────────────────────────────────────────────────
  const handleAddToPanier = useCallback((row, fourn) => {
    const col = row.cols[fourn]
    if (!col) return
    setAddingFor({ ingredientId: row.ingredient_id, fourn })
    setAddQty('')
  }, [])

  const confirmAddToPanier = useCallback((row, fourn) => {
    const qty = parseFloat(addQty.replace(',', '.'))
    if (!qty || qty <= 0) { setAddingFor(null); return }
    const col = row.cols[fourn]
    setPanier(prev => {
      const existing = prev[fourn] ?? []
      const idx = existing.findIndex(x => x.ingredient_id === row.ingredient_id)
      const item = {
        ingredient_id:  row.ingredient_id,
        ingredient_nom: row.ingredient_nom,
        unite:          col.unite || row.unite,
        prix_ref:       col.prix_last,
        quantite:       qty,
        fournisseur_id: col.fournisseur_id,
      }
      const updated = idx >= 0
        ? existing.map((x, i) => i === idx ? item : x)
        : [...existing, item]
      return { ...prev, [fourn]: updated }
    })
    setAddingFor(null)
    setAddQty('')
  }, [addQty])

  const removeFromPanier = useCallback((fourn, ingredientId) => {
    setPanier(prev => {
      const updated = (prev[fourn] ?? []).filter(x => x.ingredient_id !== ingredientId)
      if (!updated.length) {
        const next = { ...prev }
        delete next[fourn]
        return next
      }
      return { ...prev, [fourn]: updated }
    })
  }, [])

  const confirmAddLibre = useCallback((overrideForm) => {
    const form = overrideForm ?? libreForm
    const fourn = form.fourn === '__nouveau__' ? (form.fournCustom?.trim() || '') : form.fourn
    const { designation, quantite, unite, prix_ref } = form
    if (!fourn || !designation.trim() || !quantite) return
    const qty = parseFloat(String(quantite).replace(',', '.'))
    if (!qty || qty <= 0) return
    const prix = prix_ref ? parseFloat(String(prix_ref).replace(',', '.')) : null
    const item = {
      ingredient_id:  `libre_${Date.now()}`,
      ingredient_nom: designation.trim(),
      unite:          unite.trim() || '—',
      prix_ref:       prix ?? 0,
      quantite:       qty,
      fournisseur_id: null,
      libre:          true,
    }
    setPanier(prev => ({ ...prev, [fourn]: [...(prev[fourn] ?? []), item] }))
    setLibreForm({ fourn: '', designation: '', quantite: '', unite: '', prix_ref: '' })
    setShowLibre(false)
  }, [libreForm])

  // ─── Filtres ──────────────────────────────────────────────────────────────
  const filteredRows = rows.filter(row => {
    const matchSearch = !search.trim() || row.ingredient_nom.toLowerCase().includes(search.toLowerCase())
    const matchFourn = filterFourn === 'all' || row.cols[filterFourn] !== undefined
    return matchSearch && matchFourn
  })

  // ─── Rendu ────────────────────────────────────────────────────────────────
  if (!authReady) {
    return (
      <div style={{ minHeight: '100vh', background: c.fond, display: 'flex', alignItems: 'center', justifyContent: 'center', color: c.texteMuted, fontSize: 14 }}>
        Chargement…
      </div>
    )
  }

  const nbArticlesPanier = panierCount(panier)
  const fournisseursAffiches = filterFourn === 'all' ? fournisseurs : [filterFourn]

  return (
    <div style={{ minHeight: '100vh', background: c.fond }}>
      <Navbar />
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: isMobile ? '20px 16px' : '32px 32px' }}>

        {/* ── En-tête ── */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 24 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: isMobile ? 22 : 28, fontWeight: 700, color: c.texte }}>Mercuriale</h1>
            <p style={{ margin: '4px 0 0', fontSize: 14, color: c.texteMuted }}>
              Prix des ingrédients par fournisseur — historique des achats
            </p>
          </div>
          {/* Zone panier — step 2 ready */}
          <button
            onClick={() => {/* step 2 : ouvre le récap commandes */}}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 16px', borderRadius: 8, fontSize: 14, fontWeight: 500,
              background: nbArticlesPanier > 0 ? c.vert : c.fond,
              color: nbArticlesPanier > 0 ? '#fff' : c.texteMuted,
              border: `1px solid ${nbArticlesPanier > 0 ? c.vert : c.bordure}`,
              cursor: nbArticlesPanier > 0 ? 'pointer' : 'default',
              transition: 'all .2s',
            }}
            title={nbArticlesPanier === 0 ? 'Ajoutez des articles au panier pour créer une commande' : undefined}
          >
            🛒 {nbArticlesPanier > 0 ? `${nbArticlesPanier} article${nbArticlesPanier > 1 ? 's' : ''}` : 'Panier vide'}
            {nbArticlesPanier > 0 && <span style={{ fontSize: 12 }}>→ Valider</span>}
          </button>
        </div>

        {error && (
          <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 14, color: '#DC2626' }}>
            {error}
          </div>
        )}

        {/* ── Filtres ── */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="🔍 Rechercher un ingrédient…"
            style={{
              flex: 1, minWidth: 200, padding: '8px 12px', borderRadius: 8,
              border: `1px solid ${c.bordure}`, background: c.blanc,
              color: c.texte, fontSize: 14, outline: 'none',
            }}
          />
          <select
            value={filterFourn}
            onChange={e => setFilterFourn(e.target.value)}
            style={{
              padding: '8px 12px', borderRadius: 8, border: `1px solid ${c.bordure}`,
              background: c.blanc, color: c.texte, fontSize: 14, outline: 'none',
            }}
          >
            <option value="all">Tous les fournisseurs</option>
            {fournisseurs.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>

        {/* ── Panier récap (si articles) ── */}
        {nbArticlesPanier > 0 && (
          <div style={{ marginBottom: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {Object.entries(panier).map(([fourn, items]) => (
              <div key={fourn} style={{ background: '#F0FDF4', border: '1px solid #86EFAC', borderRadius: 10, padding: '12px 16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <p style={{ margin: 0, fontWeight: 600, fontSize: 14, color: '#166534' }}>🧺 {fourn}</p>
                  <span style={{ fontSize: 13, color: '#166534', fontWeight: 500 }}>
                    Total estimé : {fmtPrix(items.reduce((s, x) => s + x.prix_ref * x.quantite, 0))}
                  </span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {items.map(item => (
                    <div key={item.ingredient_id} style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      background: '#fff', border: '1px solid #86EFAC', borderRadius: 6,
                      padding: '4px 10px', fontSize: 13,
                    }}>
                      <span style={{ color: '#166534', fontWeight: 500 }}>{item.ingredient_nom}</span>
                      <span style={{ color: '#4B5563' }}>· {item.quantite} {item.unite}</span>
                      <span style={{ color: '#6B7280' }}>({fmtPrix(item.prix_ref)}/{item.unite})</span>
                      <button
                        onClick={() => removeFromPanier(fourn, item.ingredient_id)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', fontSize: 14, padding: '0 2px', lineHeight: 1 }}
                      >×</button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Tableau mercuriale ── */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: c.texteMuted, fontSize: 14 }}>Chargement…</div>
        ) : filteredRows.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: c.texteMuted, fontSize: 14 }}>
            {rows.length === 0
              ? 'Aucune donnée — importez des factures avec des ingrédients liés pour voir la mercuriale.'
              : 'Aucun résultat pour ce filtre.'}
          </div>
        ) : isMobile ? (
          /* ── Mobile : cards ── */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {filteredRows.map(row => (
              <div key={row.ingredient_id} style={{ background: c.blanc, border: `1px solid ${c.bordure}`, borderRadius: 10, overflow: 'hidden' }}>
                <div style={{ padding: '10px 14px', borderBottom: `1px solid ${c.bordure}`, background: c.fond }}>
                  <p style={{ margin: 0, fontWeight: 600, fontSize: 14, color: c.texte }}>{row.ingredient_nom}</p>
                  <p style={{ margin: '2px 0 0', fontSize: 12, color: c.texteMuted }}>{row.unite}</p>
                </div>
                {fournisseursAffiches.map(fourn => {
                  const col = row.cols[fourn]
                  if (!col) return null
                  const isAdding = addingFor?.ingredientId === row.ingredient_id && addingFor?.fourn === fourn
                  const inPanier = (panier[fourn] ?? []).find(x => x.ingredient_id === row.ingredient_id)
                  return (
                    <div key={fourn} style={{ padding: '10px 14px', borderBottom: `1px solid ${c.bordure}` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                        <div>
                          <p style={{ margin: '0 0 2px', fontSize: 13, fontWeight: 600, color: c.texte }}>{fourn}</p>
                          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                            <span style={{ fontSize: 15, fontWeight: 700, color: col.is_best ? '#16A34A' : c.texte }}>
                              {fmtPrix(col.prix_last)}
                              {col.is_best && fournisseursAffiches.filter(f => row.cols[f]).length > 1 && (
                                <span style={{ marginLeft: 4, fontSize: 10, background: '#DCFCE7', color: '#16A34A', padding: '1px 5px', borderRadius: 4 }}>✓ meilleur prix</span>
                              )}
                            </span>
                            <span style={{ fontSize: 12, color: c.texteMuted }}>moy. {fmtPrix(col.prix_moy)}</span>
                          </div>
                          <p style={{ margin: '2px 0 0', fontSize: 11, color: c.texteMuted }}>
                            Dernier achat : {fmtDate(col.date_last)} · {col.nb_achats} achat{col.nb_achats > 1 ? 's' : ''}
                          </p>
                        </div>
                        {isAdding ? (
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            <input
                              autoFocus
                              type="number" min="0" step="0.1"
                              value={addQty}
                              onChange={e => setAddQty(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter') confirmAddToPanier(row, fourn); if (e.key === 'Escape') setAddingFor(null) }}
                              placeholder={`qté (${col.unite || row.unite})`}
                              style={{ width: 90, padding: '6px 8px', borderRadius: 6, border: `1px solid ${c.bordure}`, fontSize: 13 }}
                            />
                            <button onClick={() => confirmAddToPanier(row, fourn)} style={{ padding: '6px 10px', background: c.vert, color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>✓</button>
                            <button onClick={() => setAddingFor(null)} style={{ padding: '6px 8px', background: 'transparent', border: `1px solid ${c.bordure}`, borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>✕</button>
                          </div>
                        ) : (
                          <button
                            onClick={() => handleAddToPanier(row, fourn)}
                            style={{
                              padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: 'pointer',
                              background: inPanier ? '#DCFCE7' : c.fond,
                              color: inPanier ? '#16A34A' : c.texte,
                              border: `1px solid ${inPanier ? '#86EFAC' : c.bordure}`,
                            }}
                          >{inPanier ? `✓ ${inPanier.quantite} ${inPanier.unite}` : '+ Panier'}</button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        ) : (
          /* ── Desktop : tableau ── */
          <div style={{ background: c.blanc, border: `1px solid ${c.bordure}`, borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: c.fond, borderBottom: `2px solid ${c.bordure}` }}>
                    <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, color: c.texteMuted, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', minWidth: 200, position: 'sticky', left: 0, background: c.fond, zIndex: 1 }}>
                      Ingrédient
                    </th>
                    <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600, color: c.texteMuted, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', minWidth: 60 }}>
                      Unité
                    </th>
                    {fournisseursAffiches.map(fourn => (
                      <th key={fourn} style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600, color: c.texteMuted, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', minWidth: 220, borderLeft: `1px solid ${c.bordure}` }}>
                        {fourn}
                      </th>
                    ))}
                  </tr>
                  {/* Sous-en-têtes colonnes fournisseurs */}
                  <tr style={{ background: c.fond, borderBottom: `1px solid ${c.bordure}` }}>
                    <td style={{ padding: '4px 16px', position: 'sticky', left: 0, background: c.fond }} />
                    <td style={{ padding: '4px 12px' }} />
                    {fournisseursAffiches.map(fourn => (
                      <td key={fourn} style={{ padding: '4px 12px', borderLeft: `1px solid ${c.bordure}` }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 4, fontSize: 10, color: c.texteMuted, textAlign: 'center' }}>
                          <span>Dernier prix</span>
                          <span>Moyenne</span>
                          <span>Dernier achat</span>
                          <span></span>
                        </div>
                      </td>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row, idx) => (
                    <tr key={row.ingredient_id} style={{ borderBottom: `1px solid ${c.bordure}`, background: idx % 2 === 0 ? c.blanc : c.fond }}>
                      {/* Nom ingrédient — sticky */}
                      <td style={{ padding: '10px 16px', fontWeight: 500, color: c.texte, position: 'sticky', left: 0, background: idx % 2 === 0 ? c.blanc : c.fond, zIndex: 1 }}>
                        {row.ingredient_nom}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'center', color: c.texteMuted, fontSize: 12 }}>
                        {row.unite}
                      </td>
                      {fournisseursAffiches.map(fourn => {
                        const col = row.cols[fourn]
                        const isAdding = addingFor?.ingredientId === row.ingredient_id && addingFor?.fourn === fourn
                        const inPanier = (panier[fourn] ?? []).find(x => x.ingredient_id === row.ingredient_id)
                        const nbFournsAvecPrix = fournisseursAffiches.filter(f => row.cols[f]).length

                        return (
                          <td key={fourn} style={{ padding: '8px 12px', borderLeft: `1px solid ${c.bordure}`, verticalAlign: 'middle' }}>
                            {!col ? (
                              <span style={{ color: c.bordure, fontSize: 18, display: 'block', textAlign: 'center' }}>—</span>
                            ) : isAdding ? (
                              <div style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'center' }}>
                                <input
                                  autoFocus
                                  type="number" min="0" step="0.1"
                                  value={addQty}
                                  onChange={e => setAddQty(e.target.value)}
                                  onKeyDown={e => { if (e.key === 'Enter') confirmAddToPanier(row, fourn); if (e.key === 'Escape') setAddingFor(null) }}
                                  placeholder={col.unite || row.unite}
                                  style={{ width: 80, padding: '4px 8px', borderRadius: 6, border: `1px solid ${c.bordure}`, fontSize: 13, textAlign: 'center' }}
                                />
                                <button onClick={() => confirmAddToPanier(row, fourn)} style={{ padding: '4px 8px', background: c.vert, color: '#fff', border: 'none', borderRadius: 5, cursor: 'pointer', fontSize: 13 }}>✓</button>
                                <button onClick={() => setAddingFor(null)} style={{ padding: '4px 6px', background: 'transparent', border: `1px solid ${c.bordure}`, borderRadius: 5, cursor: 'pointer', fontSize: 13, color: c.texteMuted }}>✕</button>
                              </div>
                            ) : (
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 4, alignItems: 'center' }}>
                                <span style={{ textAlign: 'center', fontWeight: 600, color: col.is_best && nbFournsAvecPrix > 1 ? '#16A34A' : c.texte }}>
                                  {fmtPrix(col.prix_last)}
                                  {col.is_best && nbFournsAvecPrix > 1 && (
                                    <span style={{ display: 'block', fontSize: 9, background: '#DCFCE7', color: '#16A34A', padding: '1px 4px', borderRadius: 3, marginTop: 2 }}>meilleur</span>
                                  )}
                                </span>
                                <span style={{ textAlign: 'center', color: c.texteMuted }}>
                                  {fmtPrix(col.prix_moy)}
                                  <span style={{ display: 'block', fontSize: 10, color: c.texteMuted }}>{col.nb_achats} achat{col.nb_achats > 1 ? 's' : ''}</span>
                                </span>
                                <span style={{ textAlign: 'center', color: c.texteMuted, fontSize: 11 }}>{fmtDate(col.date_last)}</span>
                                <button
                                  onClick={() => handleAddToPanier(row, fourn)}
                                  title="Ajouter au panier de commande"
                                  style={{
                                    padding: '4px 8px', borderRadius: 5, fontSize: 11, cursor: 'pointer', fontWeight: 500,
                                    background: inPanier ? '#DCFCE7' : c.fond,
                                    color: inPanier ? '#16A34A' : c.texte,
                                    border: `1px solid ${inPanier ? '#86EFAC' : c.bordure}`,
                                    whiteSpace: 'nowrap',
                                  }}
                                >{inPanier ? `✓ ${inPanier.quantite}` : '+ Panier'}</button>
                              </div>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ padding: '10px 16px', borderTop: `1px solid ${c.bordure}`, color: c.texteMuted, fontSize: 12 }}>
              {filteredRows.length} ingrédient{filteredRows.length > 1 ? 's' : ''} · {fournisseurs.length} fournisseur{fournisseurs.length > 1 ? 's' : ''}
            </div>
          </div>
        )}

        {/* ── Article hors mercuriale ── */}
        <div style={{ marginTop: 20 }}>
          {!showLibre ? (
            <button
              onClick={() => { setShowLibre(true); setLibreForm(f => ({ ...f, fourn: fournisseurs[0] ?? '' })) }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 16px', borderRadius: 8, fontSize: 13, cursor: 'pointer',
                background: 'transparent', border: `1px dashed ${c.bordure}`,
                color: c.texteMuted, width: '100%', justifyContent: 'center',
              }}
            >
              + Ajouter un article hors mercuriale
            </button>
          ) : (
            <div style={{ background: c.blanc, border: `1px solid ${c.bordure}`, borderRadius: 10, padding: 16 }}>
              <p style={{ margin: '0 0 12px', fontWeight: 600, fontSize: 14, color: c.texte }}>Article hors mercuriale</p>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 2fr 1fr 1fr 1fr', gap: 10, alignItems: 'end' }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: c.texteMuted }}>
                  Fournisseur *
                  <select
                    value={libreForm.fourn}
                    onChange={e => setLibreForm(f => ({ ...f, fourn: e.target.value }))}
                    style={{ padding: '7px 10px', borderRadius: 7, border: `1px solid ${c.bordure}`, background: c.blanc, color: c.texte, fontSize: 13 }}
                  >
                    <option value="">— choisir —</option>
                    {fournisseurs.map(fn => <option key={fn} value={fn}>{fn}</option>)}
                    <option value="__nouveau__">+ Autre fournisseur…</option>
                  </select>
                  {libreForm.fourn === '__nouveau__' && (
                    <input
                      autoFocus
                      placeholder="Nom du fournisseur"
                      value={libreForm.fournCustom ?? ''}
                      onChange={e => setLibreForm(f => ({ ...f, fournCustom: e.target.value }))}
                      style={{ marginTop: 4, padding: '7px 10px', borderRadius: 7, border: `1px solid ${c.bordure}`, background: c.blanc, color: c.texte, fontSize: 13 }}
                    />
                  )}
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: c.texteMuted }}>
                  Désignation *
                  <input
                    placeholder="Nom du produit"
                    value={libreForm.designation}
                    onChange={e => setLibreForm(f => ({ ...f, designation: e.target.value }))}
                    style={{ padding: '7px 10px', borderRadius: 7, border: `1px solid ${c.bordure}`, background: c.blanc, color: c.texte, fontSize: 13 }}
                  />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: c.texteMuted }}>
                  Quantité *
                  <input
                    type="number" min="0" step="0.1"
                    placeholder="ex. 5"
                    value={libreForm.quantite}
                    onChange={e => setLibreForm(f => ({ ...f, quantite: e.target.value }))}
                    style={{ padding: '7px 10px', borderRadius: 7, border: `1px solid ${c.bordure}`, background: c.blanc, color: c.texte, fontSize: 13 }}
                  />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: c.texteMuted }}>
                  Unité
                  <input
                    placeholder="kg, L, pce…"
                    value={libreForm.unite}
                    onChange={e => setLibreForm(f => ({ ...f, unite: e.target.value }))}
                    style={{ padding: '7px 10px', borderRadius: 7, border: `1px solid ${c.bordure}`, background: c.blanc, color: c.texte, fontSize: 13 }}
                  />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: c.texteMuted }}>
                  Prix réf. (€)
                  <input
                    type="number" min="0" step="0.01"
                    placeholder="optionnel"
                    value={libreForm.prix_ref}
                    onChange={e => setLibreForm(f => ({ ...f, prix_ref: e.target.value }))}
                    style={{ padding: '7px 10px', borderRadius: 7, border: `1px solid ${c.bordure}`, background: c.blanc, color: c.texte, fontSize: 13 }}
                  />
                </label>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
                <button
                  onClick={() => confirmAddLibre()}
                  style={{ padding: '8px 20px', background: c.vert, color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 13, fontWeight: 500 }}
                >
                  + Ajouter au panier
                </button>
                <button
                  onClick={() => { setShowLibre(false); setLibreForm({ fourn: '', designation: '', quantite: '', unite: '', prix_ref: '' }) }}
                  style={{ padding: '8px 14px', background: 'transparent', border: `1px solid ${c.bordure}`, borderRadius: 7, cursor: 'pointer', fontSize: 13, color: c.texteMuted }}
                >
                  Annuler
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
