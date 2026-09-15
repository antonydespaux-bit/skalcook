'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import * as XLSX from 'xlsx'
import { supabase, getClientId } from '../../../lib/supabase'
import { useIsMobile } from '../../../lib/useIsMobile'
import { useTheme } from '../../../lib/useTheme'
import Navbar from '../../../components/Navbar'
import BackButton from '../../../components/BackButton'

function fmtQte(n) {
  if (n == null || Number.isNaN(Number(n))) return '—'
  return Number(n).toLocaleString('fr-FR', { maximumFractionDigits: 2 })
}
function fmtEur(n) {
  if (n == null || Number.isNaN(Number(n))) return '—'
  return Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
}
function fmtSignedEur(n) {
  if (n == null || Number.isNaN(Number(n))) return '—'
  const s = n > 0 ? '+' : ''
  return s + fmtEur(n)
}
function fmtDate(s) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

// Mois complet précédent (meilleure fenêtre par défaut pour un rapprochement).
function moisPrecedent() {
  const t = new Date()
  const iso = (d) => d.toISOString().slice(0, 10)
  return {
    debut: iso(new Date(t.getFullYear(), t.getMonth() - 1, 1)),
    fin: iso(new Date(t.getFullYear(), t.getMonth(), 0)),
  }
}

export default function EcartsConsoPage() {
  const router = useRouter()
  const isMobile = useIsMobile()
  const { c } = useTheme()

  const [authReady, setAuthReady] = useState(false)
  const [clientId, setClientId] = useState(null)
  const [rows, setRows] = useState([])
  const [meta, setMeta] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [exporting, setExporting] = useState(false)

  const [search, setSearch] = useState('')
  const [dateDebut, setDateDebut] = useState(() => moisPrecedent().debut)
  const [dateFin, setDateFin] = useState(() => moisPrecedent().fin)
  // Filtres d'affichage : 'tous' | 'reconciliables' | 'depassements'
  const [vue, setVue] = useState('reconciliables')

  const [selected, setSelected] = useState(() => new Set())
  const [selectionOnly, setSelectionOnly] = useState(false)

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

  // ─── Chargement ───────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!clientId || !dateDebut || !dateFin) return
    setLoading(true)
    setError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const params = new URLSearchParams({ client_id: clientId, date_debut: dateDebut, date_fin: dateFin })
      const res = await fetch(`/api/ecarts-conso?${params.toString()}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || 'Erreur chargement des écarts')
      setRows(result.rows ?? [])
      setMeta(result.meta ?? null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [clientId, dateDebut, dateFin])

  useEffect(() => { if (authReady && clientId) load() }, [authReady, clientId, load])

  const applyPreset = useCallback((preset) => {
    const today = new Date()
    const iso = (d) => d.toISOString().slice(0, 10)
    if (preset === 'mois') {
      setDateDebut(iso(new Date(today.getFullYear(), today.getMonth(), 1))); setDateFin(iso(today))
    } else if (preset === 'mois-precedent') {
      const m = moisPrecedent(); setDateDebut(m.debut); setDateFin(m.fin)
    } else if (preset === '90j') {
      const d = new Date(today); d.setDate(d.getDate() - 90); setDateDebut(iso(d)); setDateFin(iso(today))
    } else if (preset === 'annee') {
      setDateDebut(`${today.getFullYear()}-01-01`); setDateFin(iso(today))
    }
  }, [])

  // ─── Filtres ────────────────────────────────────────────────────────────────
  const filteredRows = useMemo(() => rows.filter((r) => {
    const matchSearch = !search.trim() || r.nom.toLowerCase().includes(search.toLowerCase())
    const matchVue =
      vue === 'tous' ? true
      : vue === 'reconciliables' ? r.reconciliable
      : /* depassements */ r.reconciliable && r.sens === 'depassement'
    const matchSel = !selectionOnly || selected.size === 0 || selected.has(r.ingredient_id)
    return matchSearch && matchVue && matchSel
  }), [rows, search, vue, selectionOnly, selected])

  // Total du surcoût (écarts € positifs = dépassements) sur les lignes rapprochées.
  const totalDepassementEur = useMemo(
    () => filteredRows.reduce((s, r) => s + (r.reconciliable && r.ecart_valeur_ht > 0 ? r.ecart_valeur_ht : 0), 0),
    [filteredRows],
  )
  const totalEcartEur = useMemo(
    () => filteredRows.reduce((s, r) => s + (r.reconciliable ? (Number(r.ecart_valeur_ht) || 0) : 0), 0),
    [filteredRows],
  )

  // ─── Sélection ────────────────────────────────────────────────────────────
  const toggleSelect = useCallback((id) => {
    setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }, [])
  const allFilteredSelected = filteredRows.length > 0 && filteredRows.every((r) => selected.has(r.ingredient_id))
  const toggleSelectAll = useCallback(() => {
    setSelected((prev) => {
      const n = new Set(prev)
      const every = filteredRows.length > 0 && filteredRows.every((r) => n.has(r.ingredient_id))
      filteredRows.forEach((r) => (every ? n.delete(r.ingredient_id) : n.add(r.ingredient_id)))
      return n
    })
  }, [filteredRows])
  const clearSelection = useCallback(() => { setSelected(new Set()); setSelectionOnly(false) }, [])
  const exportRows = useMemo(
    () => (selected.size > 0 ? filteredRows.filter((r) => selected.has(r.ingredient_id)) : filteredRows),
    [filteredRows, selected],
  )

  // ─── Export Excel ─────────────────────────────────────────────────────────
  const handleExport = useCallback(() => {
    if (!exportRows.length) return
    setExporting(true)
    try {
      const data = exportRows.map((r) => ({
        'Ingrédient':      r.nom,
        'Théorique':       r.theo_qty,
        'Unité théo.':     r.theo_unite,
        'Acheté':          r.achat_qty,
        'Unité achat':     r.achat_unite,
        'Δ stock':         r.stock_delta,
        'Conso réelle':    r.conso_reelle,
        'Écart':           r.ecart_qty,
        'Écart %':         r.ecart_pct,
        'Écart €':         r.ecart_valeur_ht,
        'Statut':          r.reconciliable ? (r.sens === 'depassement' ? 'Dépassement' : r.sens === 'economie' ? 'Économie' : 'OK') : (r.note || 'Non rapproché'),
        'Montant acheté HT': r.montant_achat_ht,
      }))
      const ws = XLSX.utils.json_to_sheet(data)
      ws['!cols'] = [{ wch: 32 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 9 }, { wch: 11 }, { wch: 10 }, { wch: 8 }, { wch: 10 }, { wch: 28 }, { wch: 14 }]
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Écarts conso')
      XLSX.writeFile(wb, `ecarts_conso_${dateDebut}_${dateFin}.xlsx`)
    } catch (err) {
      setError(`Export impossible : ${err.message}`)
    } finally {
      setExporting(false)
    }
  }, [exportRows, dateDebut, dateFin])

  // ─── Couleurs d'écart ───────────────────────────────────────────────────────
  const ecartStyle = (r) => {
    if (!r.reconciliable) return { color: c.texteMuted }
    if (r.sens === 'depassement') return { color: '#DC2626', fontWeight: 700 }
    if (r.sens === 'economie') return { color: '#2563EB', fontWeight: 600 }
    return { color: '#16A34A', fontWeight: 600 }
  }

  if (!authReady) {
    return (
      <div style={{ minHeight: '100vh', background: c.fond, display: 'flex', alignItems: 'center', justifyContent: 'center', color: c.texteMuted, fontSize: 14 }}>
        Chargement…
      </div>
    )
  }

  const noteBadge = (r) => (
    <span title={r.note || ''} style={{ fontSize: 10, background: c.fond, color: c.texteMuted, padding: '1px 6px', borderRadius: 4, border: `1px solid ${c.bordure}`, whiteSpace: 'nowrap' }}>
      {r.est_sous_fiche ? 'sous-fiche' : r.note?.startsWith('Unités') ? 'unités ≠' : r.note?.startsWith('Aucune vente') ? 'pas vendu' : r.note?.startsWith('Aucun achat') ? 'pas acheté' : 'non rapproché'}
    </span>
  )

  return (
    <div style={{ minHeight: '100vh', background: c.fond }}>
      <Navbar />
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: isMobile ? '20px 16px' : '32px 32px' }}>

        <BackButton
          fallback="/controle-gestion/achats"
          label="← Retour aux achats"
          style={{ border: `1px solid ${c.bordure}`, color: c.texte, background: c.blanc, marginBottom: 16 }}
        />

        {/* ── En-tête ── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: isMobile ? 22 : 28, fontWeight: 700, color: c.texte }}>Écarts de consommation</h1>
            <p style={{ margin: '4px 0 0', fontSize: 14, color: c.texteMuted }}>
              Théorique (ventes × fiches) vs réel (achats {meta?.stock_utilise ? '± stock' : ''}) — dépassements, perte, vol
            </p>
          </div>
          <button
            onClick={handleExport}
            disabled={exporting || exportRows.length === 0}
            title={exportRows.length === 0 ? 'Rien à exporter' : (selected.size > 0 ? `Exporter les ${selected.size} sélectionnés` : 'Exporter en Excel')}
            style={{
              padding: '8px 14px', borderRadius: 8, fontSize: 13,
              border: `1px solid ${c.bordure}`, background: c.blanc, color: c.texte,
              cursor: exporting || exportRows.length === 0 ? 'not-allowed' : 'pointer',
              opacity: exporting || exportRows.length === 0 ? 0.6 : 1,
            }}
          >
            {exporting ? 'Export…' : (selected.size > 0 ? `⬇ Exporter (${selected.size})` : '⬇ Exporter Excel')}
          </button>
        </div>

        {/* ── Bandeau méthode / avertissement ── */}
        <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#92400E', lineHeight: 1.5 }}>
          <strong>Comment lire :</strong> écart = consommation réelle − théorique.{' '}
          {meta?.stock_utilise
            ? `Variation de stock incluse (inventaires du ${fmtDate(meta.inventaire_debut?.date)} et du ${fmtDate(meta.inventaire_fin?.date)}).`
            : 'Sans deux inventaires encadrant la période, le calcul suppose le stock stable — fiable surtout sur un mois complet.'}
          {' '}Un écart n’est chiffré que si les unités sont convertibles ; sous-fiches et lignes non appariées sont affichées à part.
        </div>

        {error && (
          <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 14, color: '#DC2626' }}>
            {error}
          </div>
        )}

        {/* ── Filtres période ── */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: c.texteMuted }}>
            Du
            <input type="date" value={dateDebut} onChange={(e) => setDateDebut(e.target.value)}
              style={{ padding: '7px 10px', borderRadius: 8, fontSize: 13, border: `1px solid ${c.bordure}`, background: c.blanc, color: c.texte, outline: 'none' }} />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: c.texteMuted }}>
            au
            <input type="date" value={dateFin} onChange={(e) => setDateFin(e.target.value)}
              style={{ padding: '7px 10px', borderRadius: 8, fontSize: 13, border: `1px solid ${c.bordure}`, background: c.blanc, color: c.texte, outline: 'none' }} />
          </label>
          {[
            { k: 'mois-precedent', label: 'Mois préc.' },
            { k: 'mois',           label: 'Ce mois' },
            { k: '90j',            label: '90 j' },
            { k: 'annee',          label: 'Année' },
          ].map((p) => (
            <button key={p.k} onClick={() => applyPreset(p.k)}
              style={{ padding: '6px 10px', borderRadius: 8, fontSize: 12, border: `1px solid ${c.bordure}`, background: c.blanc, color: c.texte, cursor: 'pointer' }}>
              {p.label}
            </button>
          ))}
        </div>

        {/* ── Filtres vue + recherche ── */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔍 Rechercher un ingrédient…"
            style={{ flex: 1, minWidth: 200, padding: '8px 12px', borderRadius: 8, border: `1px solid ${c.bordure}`, background: c.blanc, color: c.texte, fontSize: 14, outline: 'none' }} />
          {[
            { k: 'reconciliables', label: 'Rapprochés' },
            { k: 'depassements',   label: 'Dépassements' },
            { k: 'tous',           label: 'Tout' },
          ].map((v) => {
            const actif = vue === v.k
            return (
              <button key={v.k} onClick={() => setVue(v.k)}
                style={{ padding: '8px 12px', borderRadius: 8, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap',
                  border: `1px solid ${actif ? c.accent : c.bordure}`, background: actif ? c.accentClair : c.blanc, color: c.texte }}>
                {v.label}
              </button>
            )
          })}
        </div>

        {/* ── Barre de sélection ── */}
        {selected.size > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, marginBottom: 16, padding: '10px 14px', borderRadius: 10, border: `1px solid ${c.accent}`, background: c.accentClair }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: c.texte }}>{selected.size} sélectionné{selected.size > 1 ? 's' : ''}</span>
            <button onClick={() => setSelectionOnly((v) => !v)}
              style={{ padding: '5px 10px', borderRadius: 8, fontSize: 12, cursor: 'pointer', border: `1px solid ${selectionOnly ? c.accent : c.bordure}`, background: selectionOnly ? c.blanc : 'transparent', color: c.texte }}>
              {selectionOnly ? '☑' : '☐'} Sélection seulement
            </button>
            <button onClick={clearSelection}
              style={{ padding: '5px 10px', borderRadius: 8, fontSize: 12, border: `1px solid ${c.bordure}`, background: 'transparent', color: c.texteMuted, cursor: 'pointer', marginLeft: 'auto' }}>
              ✕ Vider
            </button>
          </div>
        )}

        {/* ── Contenu ── */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: c.texteMuted, fontSize: 14 }}>Chargement…</div>
        ) : filteredRows.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: c.texteMuted, fontSize: 14 }}>
            {rows.length === 0
              ? 'Aucune donnée — il faut des ventes ET des achats sur la période pour calculer des écarts.'
              : 'Aucun résultat pour ce filtre.'}
          </div>
        ) : isMobile ? (
          /* ── Mobile : cards ── */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {filteredRows.map((r) => {
              const isSel = selected.has(r.ingredient_id)
              return (
                <div key={r.ingredient_id} onClick={() => toggleSelect(r.ingredient_id)}
                  style={{ background: isSel ? c.accentClair : c.blanc, border: `1px solid ${isSel ? c.accent : c.bordure}`, borderRadius: 10, padding: '12px 14px', cursor: 'pointer' }}>
                  <p style={{ margin: 0, fontWeight: 600, fontSize: 14, color: c.texte, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    {r.nom}
                    {!r.reconciliable && noteBadge(r)}
                  </p>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 13, color: c.texteMuted }}>
                    <span>Théo : <strong style={{ color: c.texte }}>{fmtQte(r.theo_qty)} {r.theo_qty != null ? r.theo_unite : ''}</strong></span>
                    <span>Réel : <strong style={{ color: c.texte }}>{fmtQte(r.reconciliable ? r.conso_reelle : r.achat_qty)} {r.achat_qty != null ? r.achat_unite : ''}</strong></span>
                  </div>
                  {r.reconciliable && (
                    <div style={{ marginTop: 6, fontSize: 14 }}>
                      Écart : <strong style={ecartStyle(r)}>{r.ecart_qty > 0 ? '+' : ''}{fmtQte(r.ecart_qty)} {r.unite}{r.ecart_pct != null ? ` (${r.ecart_pct > 0 ? '+' : ''}${r.ecart_pct} %)` : ''}</strong>
                      {r.ecart_valeur_ht != null && <span style={{ ...ecartStyle(r), marginLeft: 8 }}>{fmtSignedEur(r.ecart_valeur_ht)}</span>}
                    </div>
                  )}
                </div>
              )
            })}
            <div style={{ padding: '4px 2px', color: c.texteMuted, fontSize: 12 }}>
              {filteredRows.length} ingrédient{filteredRows.length > 1 ? 's' : ''} · surcoût dépassements {fmtEur(totalDepassementEur)}
            </div>
          </div>
        ) : (
          /* ── Desktop : tableau ── */
          <div style={{ background: c.blanc, border: `1px solid ${c.bordure}`, borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: c.fond, borderBottom: `2px solid ${c.bordure}` }}>
                    <th style={{ padding: '10px 8px 10px 16px', textAlign: 'center', width: 36 }}>
                      <input type="checkbox" checked={allFilteredSelected} onChange={toggleSelectAll} title="Tout sélectionner" style={{ cursor: 'pointer', width: 15, height: 15 }} />
                    </th>
                    {[
                      { label: 'Ingrédient', align: 'left', min: 220 },
                      { label: 'Théorique', align: 'right', min: 90 },
                      { label: 'Acheté', align: 'right', min: 90 },
                      ...(meta?.stock_utilise ? [{ label: 'Δ stock', align: 'right', min: 80 }] : []),
                      { label: 'Conso réelle', align: 'right', min: 100 },
                      { label: 'Écart', align: 'right', min: 120 },
                      { label: 'Écart €', align: 'right', min: 90 },
                    ].map((col) => (
                      <th key={col.label} style={{ padding: '10px 16px', textAlign: col.align, fontWeight: 600, color: c.texteMuted, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', minWidth: col.min }}>
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((r, idx) => {
                    const isSel = selected.has(r.ingredient_id)
                    const bg = isSel ? c.accentClair : (idx % 2 === 0 ? c.blanc : c.fond)
                    return (
                      <tr key={r.ingredient_id} onClick={() => toggleSelect(r.ingredient_id)} style={{ borderBottom: `1px solid ${c.bordure}`, background: bg, cursor: 'pointer' }}>
                        <td style={{ padding: '10px 8px 10px 16px', textAlign: 'center' }}>
                          <input type="checkbox" checked={isSel} onChange={() => toggleSelect(r.ingredient_id)} onClick={(e) => e.stopPropagation()} style={{ cursor: 'pointer', width: 15, height: 15 }} />
                        </td>
                        <td style={{ padding: '10px 16px', fontWeight: 500, color: c.texte }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            {r.nom}
                            {!r.reconciliable && noteBadge(r)}
                          </div>
                        </td>
                        <td style={{ padding: '10px 16px', textAlign: 'right', color: r.theo_qty != null ? c.texte : c.texteMuted }}>
                          {r.theo_qty != null ? `${fmtQte(r.theo_qty)} ${r.theo_unite}` : '—'}
                        </td>
                        <td style={{ padding: '10px 16px', textAlign: 'right', color: r.achat_qty != null ? c.texte : c.texteMuted }}>
                          {r.achat_qty != null ? `${fmtQte(r.achat_qty)} ${r.achat_unite}` : '—'}
                        </td>
                        {meta?.stock_utilise && (
                          <td style={{ padding: '10px 16px', textAlign: 'right', color: c.texteMuted }}>
                            {r.stock_delta != null ? `${r.stock_delta > 0 ? '+' : ''}${fmtQte(r.stock_delta)}` : '—'}
                          </td>
                        )}
                        <td style={{ padding: '10px 16px', textAlign: 'right', color: r.conso_reelle != null ? c.texte : c.texteMuted }}>
                          {r.conso_reelle != null ? `${fmtQte(r.conso_reelle)} ${r.unite}` : '—'}
                        </td>
                        <td style={{ padding: '10px 16px', textAlign: 'right', ...ecartStyle(r) }}>
                          {r.reconciliable
                            ? `${r.ecart_qty > 0 ? '+' : ''}${fmtQte(r.ecart_qty)} ${r.unite}${r.ecart_pct != null ? ` · ${r.ecart_pct > 0 ? '+' : ''}${r.ecart_pct}%` : ''}`
                            : '—'}
                        </td>
                        <td style={{ padding: '10px 16px', textAlign: 'right', ...ecartStyle(r) }}>
                          {r.reconciliable && r.ecart_valeur_ht != null ? fmtSignedEur(r.ecart_valeur_ht) : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: `2px solid ${c.bordure}`, background: c.fond }}>
                    <td />
                    <td style={{ padding: '10px 16px', fontWeight: 700, color: c.texte }}>Total</td>
                    <td colSpan={meta?.stock_utilise ? 4 : 3} style={{ padding: '10px 16px', textAlign: 'right', color: c.texteMuted, fontSize: 12 }}>
                      Surcoût dépassements
                    </td>
                    <td style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 700, color: '#DC2626' }}>
                      {fmtSignedEur(totalEcartEur)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <div style={{ padding: '10px 16px', borderTop: `1px solid ${c.bordure}`, color: c.texteMuted, fontSize: 12, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <span>{filteredRows.length} ingrédient{filteredRows.length > 1 ? 's' : ''} affiché{filteredRows.length > 1 ? 's' : ''}</span>
              <span>Surcoût des dépassements : <strong style={{ color: '#DC2626' }}>{fmtEur(totalDepassementEur)}</strong> HT</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
