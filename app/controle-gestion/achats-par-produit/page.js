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
  return Number(n).toLocaleString('fr-FR', { maximumFractionDigits: 3 })
}

function fmtEur(n) {
  if (n == null || Number.isNaN(Number(n))) return '—'
  return Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
}

function fmtDate(s) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

// "12 kg · 3 caisses" — une quantité par unité rencontrée sur les factures.
function unitesLabel(unites) {
  if (!unites?.length) return '—'
  return unites.map((u) => `${fmtQte(u.quantite)}${u.unite ? ` ${u.unite}` : ''}`).join(' · ')
}

// Bornes du mois courant (période par défaut : ce rapport est orienté période).
function moisCourant() {
  const today = new Date()
  const iso = (d) => d.toISOString().slice(0, 10)
  return {
    debut: iso(new Date(today.getFullYear(), today.getMonth(), 1)),
    fin: iso(today),
  }
}

export default function AchatsParProduitPage() {
  const router = useRouter()
  const isMobile = useIsMobile()
  const { c } = useTheme()

  const [authReady, setAuthReady] = useState(false)
  const [clientId, setClientId] = useState(null)
  const [rows, setRows] = useState([])
  const [fournisseurs, setFournisseurs] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [exporting, setExporting] = useState(false)

  // ── Filtres ────────────────────────────────────────────────────────────────
  const [search, setSearch] = useState('')
  const [filterFourn, setFilterFourn] = useState('all')
  const [section, setSection] = useState('cuisine')
  const [horsCatalogueOnly, setHorsCatalogueOnly] = useState(false)
  const [dateDebut, setDateDebut] = useState(() => moisCourant().debut)
  const [dateFin, setDateFin] = useState(() => moisCourant().fin)

  // ── Sélection multi-produits ─────────────────────────────────────────────────
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
    if (!clientId) return
    setLoading(true)
    setError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const params = new URLSearchParams({ client_id: clientId, section })
      if (dateDebut) params.set('date_debut', dateDebut)
      if (dateFin)   params.set('date_fin',   dateFin)
      const res = await fetch(`/api/achats/par-produit?${params.toString()}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || 'Erreur chargement des achats par produit')
      setRows(result.rows ?? [])
      setFournisseurs(result.fournisseurs ?? [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [clientId, dateDebut, dateFin, section])

  useEffect(() => { if (authReady && clientId) load() }, [authReady, clientId, load])

  // ── Presets de période ──────────────────────────────────────────────────────
  const applyPreset = useCallback((preset) => {
    const today = new Date()
    const iso = (d) => d.toISOString().slice(0, 10)
    if (preset === 'mois') {
      setDateDebut(iso(new Date(today.getFullYear(), today.getMonth(), 1)))
      setDateFin(iso(today))
    } else if (preset === 'mois-precedent') {
      setDateDebut(iso(new Date(today.getFullYear(), today.getMonth() - 1, 1)))
      setDateFin(iso(new Date(today.getFullYear(), today.getMonth(), 0)))
    } else if (preset === '30j') {
      const d = new Date(today); d.setDate(d.getDate() - 30)
      setDateDebut(iso(d)); setDateFin(iso(today))
    } else if (preset === '90j') {
      const d = new Date(today); d.setDate(d.getDate() - 90)
      setDateDebut(iso(d)); setDateFin(iso(today))
    } else if (preset === 'annee') {
      setDateDebut(`${today.getFullYear()}-01-01`); setDateFin(iso(today))
    } else {
      setDateDebut(''); setDateFin('')
    }
  }, [])

  // ─── Filtres client ────────────────────────────────────────────────────────
  const filteredRows = useMemo(() => rows.filter((row) => {
    const matchSearch = !search.trim() || row.nom.toLowerCase().includes(search.toLowerCase())
    const matchFourn = filterFourn === 'all' || (row.fournisseurs || []).includes(filterFourn)
    const matchCat = !horsCatalogueOnly || !row.rattache
    const matchSel = !selectionOnly || selected.size === 0 || selected.has(row.key)
    return matchSearch && matchFourn && matchCat && matchSel
  }), [rows, search, filterFourn, horsCatalogueOnly, selectionOnly, selected])

  const totalHt = useMemo(
    () => filteredRows.reduce((s, r) => s + (Number(r.montant_ht) || 0), 0),
    [filteredRows],
  )

  // ─── Sélection ──────────────────────────────────────────────────────────────
  const toggleSelect = useCallback((key) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const allFilteredSelected = filteredRows.length > 0 && filteredRows.every((r) => selected.has(r.key))
  const toggleSelectAll = useCallback(() => {
    setSelected((prev) => {
      const next = new Set(prev)
      const everySelected = filteredRows.length > 0 && filteredRows.every((r) => next.has(r.key))
      if (everySelected) filteredRows.forEach((r) => next.delete(r.key))
      else filteredRows.forEach((r) => next.add(r.key))
      return next
    })
  }, [filteredRows])

  const clearSelection = useCallback(() => { setSelected(new Set()); setSelectionOnly(false) }, [])

  // Lignes retenues pour l'export : la sélection si elle existe, sinon le filtre courant.
  const selectedRows = useMemo(
    () => (selected.size > 0 ? filteredRows.filter((r) => selected.has(r.key)) : filteredRows),
    [filteredRows, selected],
  )
  const selectionTotalHt = useMemo(
    () => filteredRows.filter((r) => selected.has(r.key)).reduce((s, r) => s + (Number(r.montant_ht) || 0), 0),
    [filteredRows, selected],
  )

  // ─── Export Excel ─────────────────────────────────────────────────────────
  const handleExport = useCallback(() => {
    if (!selectedRows.length) return
    setExporting(true)
    try {
      const exportRows = selectedRows.map((row) => ({
        'Produit':        row.nom,
        'Hors catalogue': row.rattache ? '' : 'Oui',
        'Quantité(s)':    unitesLabel(row.unites),
        'Nb lignes':      row.nb_lignes,
        'Montant HT':     row.montant_ht,
        'Part %':         totalHt > 0 ? Math.round((row.montant_ht / totalHt) * 1000) / 10 : 0,
        'Fournisseur(s)': (row.fournisseurs || []).join(', '),
        'Dernier achat':  row.date_derniere,
      }))

      const ws = XLSX.utils.json_to_sheet(exportRows)
      ws['!cols'] = [
        { wch: 32 }, { wch: 13 }, { wch: 20 }, { wch: 9 },
        { wch: 12 }, { wch: 8 }, { wch: 28 }, { wch: 13 },
      ]
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Achats par produit')
      const today = new Date().toISOString().slice(0, 10)
      const suffix = dateDebut || dateFin ? `${dateDebut || 'debut'}_${dateFin || today}` : today
      XLSX.writeFile(wb, `achats_par_produit_${suffix}.xlsx`)
    } catch (err) {
      setError(`Export impossible : ${err.message}`)
    } finally {
      setExporting(false)
    }
  }, [selectedRows, totalHt, dateDebut, dateFin])

  // ─── Rendu ────────────────────────────────────────────────────────────────
  if (!authReady) {
    return (
      <div style={{ minHeight: '100vh', background: c.fond, display: 'flex', alignItems: 'center', justifyContent: 'center', color: c.texteMuted, fontSize: 14 }}>
        Chargement…
      </div>
    )
  }

  const badgeHorsCatalogue = (
    <span
      title="Ligne de facture non rattachée à un ingrédient du catalogue — regroupée par libellé."
      style={{ fontSize: 10, background: '#FEF3C7', color: '#92400E', padding: '1px 5px', borderRadius: 3, fontWeight: 500, whiteSpace: 'nowrap' }}
    >hors catalogue</span>
  )

  return (
    <div style={{ minHeight: '100vh', background: c.fond }}>
      <Navbar section={section === 'bar' ? 'bar' : 'cuisine'} />
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: isMobile ? '20px 16px' : '32px 32px' }}>

        <BackButton
          fallback="/controle-gestion/achats"
          label="← Retour aux achats"
          style={{ border: `1px solid ${c.bordure}`, color: c.texte, background: c.blanc, marginBottom: 16 }}
        />

        {/* ── En-tête ── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 24 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: isMobile ? 22 : 28, fontWeight: 700, color: c.texte }}>Achats par produit</h1>
            <p style={{ margin: '4px 0 0', fontSize: 14, color: c.texteMuted }}>
              Quantités achetées par produit sur la période — d&apos;après les factures saisies
            </p>
          </div>
          <button
            onClick={handleExport}
            disabled={exporting || selectedRows.length === 0}
            title={selectedRows.length === 0 ? 'Rien à exporter' : (selected.size > 0 ? `Exporter les ${selected.size} produits sélectionnés` : 'Exporter en Excel')}
            style={{
              padding: '8px 14px', borderRadius: 8, fontSize: 13,
              border: `1px solid ${c.bordure}`, background: c.blanc, color: c.texte,
              cursor: exporting || selectedRows.length === 0 ? 'not-allowed' : 'pointer',
              opacity: exporting || selectedRows.length === 0 ? 0.6 : 1,
            }}
          >
            {exporting ? 'Export…' : (selected.size > 0 ? `⬇ Exporter (${selected.size})` : '⬇ Exporter Excel')}
          </button>
        </div>

        {error && (
          <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 14, color: '#DC2626' }}>
            {error}
          </div>
        )}

        {/* ── Sélecteur Section ── */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <span style={{ fontSize: 12, color: c.texteMuted }}>Section</span>
          {[
            { k: 'cuisine', label: 'Cuisine' },
            { k: 'bar',     label: 'Bar' },
          ].map((p) => {
            const actif = section === p.k
            return (
              <button
                key={p.k}
                onClick={() => setSection(p.k)}
                style={{
                  padding: '6px 12px', borderRadius: 8, fontSize: 12,
                  border: `1px solid ${actif ? c.accent : c.bordure}`,
                  background: actif ? c.accentClair : c.blanc,
                  color: c.texte, cursor: 'pointer',
                }}
              >
                {p.label}
              </button>
            )
          })}
        </div>

        {/* ── Filtres ── */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="🔍 Rechercher un produit…"
            style={{
              flex: 1, minWidth: 200, padding: '8px 12px', borderRadius: 8,
              border: `1px solid ${c.bordure}`, background: c.blanc,
              color: c.texte, fontSize: 14, outline: 'none',
            }}
          />
          <select
            value={filterFourn}
            onChange={(e) => setFilterFourn(e.target.value)}
            style={{
              padding: '8px 12px', borderRadius: 8, border: `1px solid ${c.bordure}`,
              background: c.blanc, color: c.texte, fontSize: 14, outline: 'none',
            }}
          >
            <option value="all">Tous les fournisseurs</option>
            {fournisseurs.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
          <button
            onClick={() => setHorsCatalogueOnly((v) => !v)}
            title="Afficher uniquement les lignes non rattachées à un ingrédient du catalogue"
            style={{
              padding: '8px 12px', borderRadius: 8, fontSize: 13, cursor: 'pointer',
              border: `1px solid ${horsCatalogueOnly ? c.accent : c.bordure}`,
              background: horsCatalogueOnly ? c.accentClair : c.blanc,
              color: c.texte, whiteSpace: 'nowrap',
            }}
          >
            {horsCatalogueOnly ? '☑' : '☐'} Hors catalogue seulement
          </button>
        </div>

        {/* ── Filtre période ── */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 20 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: c.texteMuted }}>
            Période — du
            <input
              type="date"
              value={dateDebut}
              onChange={(e) => setDateDebut(e.target.value)}
              style={{ padding: '7px 10px', borderRadius: 8, fontSize: 13, border: `1px solid ${c.bordure}`, background: c.blanc, color: c.texte, outline: 'none' }}
            />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: c.texteMuted }}>
            au
            <input
              type="date"
              value={dateFin}
              onChange={(e) => setDateFin(e.target.value)}
              style={{ padding: '7px 10px', borderRadius: 8, fontSize: 13, border: `1px solid ${c.bordure}`, background: c.blanc, color: c.texte, outline: 'none' }}
            />
          </label>
          {[
            { k: 'mois',           label: 'Ce mois' },
            { k: 'mois-precedent', label: 'Mois préc.' },
            { k: '30j',            label: '30 j' },
            { k: '90j',            label: '90 j' },
            { k: 'annee',          label: 'Année' },
          ].map((p) => (
            <button
              key={p.k}
              onClick={() => applyPreset(p.k)}
              style={{ padding: '6px 10px', borderRadius: 8, fontSize: 12, border: `1px solid ${c.bordure}`, background: c.blanc, color: c.texte, cursor: 'pointer' }}
            >
              {p.label}
            </button>
          ))}
          {(dateDebut || dateFin) && (
            <button
              onClick={() => applyPreset('clear')}
              style={{ padding: '6px 10px', borderRadius: 8, fontSize: 12, border: `1px solid ${c.bordure}`, background: 'transparent', color: c.texteMuted, cursor: 'pointer' }}
            >
              ✕ Effacer
            </button>
          )}
        </div>

        {/* ── Barre de sélection ── */}
        {selected.size > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, marginBottom: 16, padding: '10px 14px', borderRadius: 10, border: `1px solid ${c.accent}`, background: c.accentClair }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: c.texte }}>
              {selected.size} produit{selected.size > 1 ? 's' : ''} sélectionné{selected.size > 1 ? 's' : ''}
            </span>
            <span style={{ fontSize: 13, color: c.texteMuted }}>{fmtEur(selectionTotalHt)} HT</span>
            <button
              onClick={() => setSelectionOnly((v) => !v)}
              style={{
                padding: '5px 10px', borderRadius: 8, fontSize: 12, cursor: 'pointer',
                border: `1px solid ${selectionOnly ? c.accent : c.bordure}`,
                background: selectionOnly ? c.blanc : 'transparent', color: c.texte,
              }}
            >
              {selectionOnly ? '☑' : '☐'} Sélection seulement
            </button>
            <button
              onClick={clearSelection}
              style={{ padding: '5px 10px', borderRadius: 8, fontSize: 12, border: `1px solid ${c.bordure}`, background: 'transparent', color: c.texteMuted, cursor: 'pointer', marginLeft: 'auto' }}
            >
              ✕ Vider la sélection
            </button>
          </div>
        )}

        {/* ── Tableau ── */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: c.texteMuted, fontSize: 14 }}>Chargement…</div>
        ) : filteredRows.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: c.texteMuted, fontSize: 14 }}>
            {rows.length === 0
              ? 'Aucun achat sur cette période — saisissez ou importez des factures pour voir les volumes.'
              : 'Aucun résultat pour ce filtre.'}
          </div>
        ) : isMobile ? (
          /* ── Mobile : cards ── */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {filteredRows.map((row) => {
              const isSel = selected.has(row.key)
              return (
              <div
                key={row.key}
                onClick={() => toggleSelect(row.key)}
                style={{ background: isSel ? c.accentClair : c.blanc, border: `1px solid ${isSel ? c.accent : c.bordure}`, borderRadius: 10, padding: '12px 14px', cursor: 'pointer' }}
              >
                <p style={{ margin: 0, fontWeight: 600, fontSize: 14, color: c.texte, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <input
                    type="checkbox"
                    checked={isSel}
                    onChange={() => toggleSelect(row.key)}
                    onClick={(e) => e.stopPropagation()}
                    style={{ cursor: 'pointer', width: 15, height: 15 }}
                  />
                  {row.nom}
                  {!row.rattache && badgeHorsCatalogue}
                </p>
                <p style={{ margin: '6px 0 0', fontSize: 15, fontWeight: 700, color: c.texte }}>
                  {unitesLabel(row.unites)}
                </p>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 12, color: c.texteMuted }}>
                  <span>{fmtEur(row.montant_ht)} HT{totalHt > 0 ? ` · ${Math.round((row.montant_ht / totalHt) * 100)} %` : ''}</span>
                  <span>{row.nb_lignes} ligne{row.nb_lignes > 1 ? 's' : ''}</span>
                </div>
                <p style={{ margin: '4px 0 0', fontSize: 11, color: c.texteMuted }}>
                  {(row.fournisseurs || []).join(', ') || '—'} · dernier : {fmtDate(row.date_derniere)}
                </p>
              </div>
              )
            })}
            <div style={{ padding: '4px 2px', color: c.texteMuted, fontSize: 12 }}>
              {filteredRows.length} produit{filteredRows.length > 1 ? 's' : ''} · {fmtEur(totalHt)} HT
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
                      <input
                        type="checkbox"
                        checked={allFilteredSelected}
                        onChange={toggleSelectAll}
                        title="Tout sélectionner / désélectionner"
                        style={{ cursor: 'pointer', width: 15, height: 15 }}
                      />
                    </th>
                    {[
                      { label: 'Produit', align: 'left', min: 220 },
                      { label: 'Quantité(s)', align: 'left', min: 140 },
                      { label: 'Nb lignes', align: 'center', min: 70 },
                      { label: 'Montant HT', align: 'right', min: 100 },
                      { label: 'Part', align: 'right', min: 60 },
                      { label: 'Fournisseur(s)', align: 'left', min: 160 },
                      { label: 'Dernier achat', align: 'center', min: 90 },
                    ].map((col) => (
                      <th key={col.label} style={{ padding: '10px 16px', textAlign: col.align, fontWeight: 600, color: c.texteMuted, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', minWidth: col.min }}>
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row, idx) => {
                    const isSel = selected.has(row.key)
                    const bg = isSel ? c.accentClair : (idx % 2 === 0 ? c.blanc : c.fond)
                    return (
                    <tr key={row.key} onClick={() => toggleSelect(row.key)} style={{ borderBottom: `1px solid ${c.bordure}`, background: bg, cursor: 'pointer' }}>
                      <td style={{ padding: '10px 8px 10px 16px', textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={isSel}
                          onChange={() => toggleSelect(row.key)}
                          onClick={(e) => e.stopPropagation()}
                          style={{ cursor: 'pointer', width: 15, height: 15 }}
                        />
                      </td>
                      <td style={{ padding: '10px 16px', fontWeight: 500, color: c.texte }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          {row.nom}
                          {!row.rattache && badgeHorsCatalogue}
                        </div>
                      </td>
                      <td style={{ padding: '10px 16px', color: c.texte, fontWeight: 600 }}>
                        {unitesLabel(row.unites)}
                      </td>
                      <td style={{ padding: '10px 16px', textAlign: 'center', color: c.texteMuted }}>
                        {row.nb_lignes}
                      </td>
                      <td style={{ padding: '10px 16px', textAlign: 'right', color: c.texte, fontWeight: 600 }}>
                        {fmtEur(row.montant_ht)}
                      </td>
                      <td style={{ padding: '10px 16px', textAlign: 'right', color: c.texteMuted }}>
                        {totalHt > 0 ? `${Math.round((row.montant_ht / totalHt) * 100)} %` : '—'}
                      </td>
                      <td style={{ padding: '10px 16px', color: c.texteMuted, fontSize: 12 }}>
                        {(row.fournisseurs || []).join(', ') || '—'}
                      </td>
                      <td style={{ padding: '10px 16px', textAlign: 'center', color: c.texteMuted, fontSize: 12 }}>
                        {fmtDate(row.date_derniere)}
                      </td>
                    </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: `2px solid ${c.bordure}`, background: c.fond }}>
                    <td />
                    <td style={{ padding: '10px 16px', fontWeight: 700, color: c.texte }}>Total</td>
                    <td />
                    <td style={{ padding: '10px 16px', textAlign: 'center', color: c.texteMuted }}>
                      {filteredRows.reduce((s, r) => s + r.nb_lignes, 0)}
                    </td>
                    <td style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 700, color: c.texte }}>
                      {fmtEur(totalHt)}
                    </td>
                    <td colSpan={3} />
                  </tr>
                </tfoot>
              </table>
            </div>
            <div style={{ padding: '10px 16px', borderTop: `1px solid ${c.bordure}`, color: c.texteMuted, fontSize: 12 }}>
              {filteredRows.length} produit{filteredRows.length > 1 ? 's' : ''} · {fournisseurs.length} fournisseur{fournisseurs.length > 1 ? 's' : ''}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
