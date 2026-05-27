'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import * as XLSX from 'xlsx'
import { supabase, getClientId } from '../../../lib/supabase'
import { useIsMobile } from '../../../lib/useIsMobile'
import { useTheme } from '../../../lib/useTheme'
import Navbar from '../../../components/Navbar'

function fmtPrix(n) {
  if (n == null || Number.isNaN(Number(n))) return '—'
  return Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
}

function fmtDate(s) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

export default function MercurialePage() {
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
  const [dateDebut, setDateDebut] = useState('')
  const [dateFin, setDateFin] = useState('')
  const [multiFournOnly, setMultiFournOnly] = useState(false)
  // Section ciblée par la mercuriale : cuisine ou bar. Ingrédients et achats
  // sont distincts entre les deux — il faut donc choisir.
  const [section, setSection] = useState('cuisine')

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
      const res = await fetch(`/api/achats/mercuriale?${params.toString()}`, {
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
  }, [clientId, dateDebut, dateFin, section])

  useEffect(() => { if (authReady && clientId) load() }, [authReady, clientId, load])

  // ── Presets de période ────────────────────────────────────────────────────
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

  // ─── Filtres ──────────────────────────────────────────────────────────────
  const filteredRows = rows.filter(row => {
    const matchSearch = !search.trim() || row.ingredient_nom.toLowerCase().includes(search.toLowerCase())
    const matchFourn = filterFourn === 'all' || row.cols[filterFourn] !== undefined
    const matchMulti = !multiFournOnly || Object.keys(row.cols).length >= 2
    return matchSearch && matchFourn && matchMulti
  })

  // ─── Export Excel ─────────────────────────────────────────────────────────
  const handleExport = useCallback(() => {
    if (!filteredRows.length) return
    setExporting(true)
    try {
      const fournsExport = filterFourn === 'all' ? fournisseurs : [filterFourn]

      // Feuille 1 : Comparatif (format large, comme à l'écran)
      // Une ligne par ingrédient, une colonne par fournisseur (dernier prix).
      const wideRows = filteredRows.map((row) => {
        const r = {
          'Ingrédient': row.ingredient_nom,
          'Unité': row.unite ?? '',
          'Unités hétérogènes': row.units_mixed ? `Oui (${row.all_units.join(', ')})` : '',
        }
        let bestPrix = null
        let bestFourn = ''
        for (const f of fournsExport) {
          const col = row.cols[f]
          if (col) {
            r[f] = col.prix_last
            if (bestPrix === null || col.prix_last < bestPrix) {
              bestPrix = col.prix_last
              bestFourn = f
            }
          } else {
            r[f] = ''
          }
        }
        r['Meilleur fournisseur'] = bestFourn
        r['Meilleur prix']        = bestPrix ?? ''
        return r
      })

      // Feuille 2 : Détail (format long, une ligne par couple ingrédient × fournisseur)
      const longRows = []
      for (const row of filteredRows) {
        for (const f of fournsExport) {
          const col = row.cols[f]
          if (!col) continue
          longRows.push({
            'Ingrédient':     row.ingredient_nom,
            'Unité':          col.unite ?? row.unite ?? '',
            'Fournisseur':    f,
            'Dernier prix':   col.prix_last,
            'Moyenne':        col.prix_moy,
            'Dernier achat':  col.date_last,
            'Nb achats':      col.nb_achats,
            'Meilleur prix':  col.is_best ? 'Oui' : '',
          })
        }
      }

      const wb = XLSX.utils.book_new()

      const wsWide = XLSX.utils.json_to_sheet(wideRows)
      // Largeurs : ingrédient large, unité étroite, puis colonnes fournisseurs
      // groupées (réduites par défaut, dépliables via le bouton +/− Excel).
      const wideCols = [{ wch: 30 }, { wch: 8 }, { wch: 22 }]
      for (let i = 0; i < fournsExport.length; i++) {
        wideCols.push({ wch: 16, level: 1, hidden: true })
      }
      wideCols.push({ wch: 24 }, { wch: 12 })
      wsWide['!cols'] = wideCols
      XLSX.utils.book_append_sheet(wb, wsWide, 'Comparatif')

      const wsLong = XLSX.utils.json_to_sheet(longRows)
      wsLong['!cols'] = [
        { wch: 30 }, { wch: 8 }, { wch: 24 }, { wch: 14 },
        { wch: 12 }, { wch: 14 }, { wch: 10 }, { wch: 14 },
      ]
      XLSX.utils.book_append_sheet(wb, wsLong, 'Détail')

      // Nom de fichier : période si filtrée, sinon date du jour
      const today = new Date().toISOString().slice(0, 10)
      const suffix = dateDebut || dateFin
        ? `${dateDebut || 'debut'}_${dateFin || today}`
        : today
      XLSX.writeFile(wb, `mercuriale_${suffix}.xlsx`)
    } catch (err) {
      setError(`Export impossible : ${err.message}`)
    } finally {
      setExporting(false)
    }
  }, [filteredRows, fournisseurs, filterFourn, dateDebut, dateFin])

  // ─── Rendu ────────────────────────────────────────────────────────────────
  if (!authReady) {
    return (
      <div style={{ minHeight: '100vh', background: c.fond, display: 'flex', alignItems: 'center', justifyContent: 'center', color: c.texteMuted, fontSize: 14 }}>
        Chargement…
      </div>
    )
  }

  const fournisseursAffiches = filterFourn === 'all' ? fournisseurs : [filterFourn]

  return (
    <div style={{ minHeight: '100vh', background: c.fond }}>
      <Navbar />
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: isMobile ? '20px 16px' : '32px 32px' }}>

        {/* ── En-tête ── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 24 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: isMobile ? 22 : 28, fontWeight: 700, color: c.texte }}>Mercuriale</h1>
            <p style={{ margin: '4px 0 0', fontSize: 14, color: c.texteMuted }}>
              Comparaison des prix d&apos;achat par fournisseur — historique des factures
            </p>
          </div>
          <button
            onClick={handleExport}
            disabled={exporting || filteredRows.length === 0}
            title={filteredRows.length === 0 ? 'Rien à exporter' : 'Exporter le comparatif en Excel (2 feuilles : Comparatif + Détail)'}
            style={{
              padding: '8px 14px', borderRadius: 8, fontSize: 13,
              border: `1px solid ${c.bordure}`, background: c.blanc, color: c.texte,
              cursor: exporting || filteredRows.length === 0 ? 'not-allowed' : 'pointer',
              opacity: exporting || filteredRows.length === 0 ? 0.6 : 1,
            }}
          >
            {exporting ? 'Export…' : '⬇ Exporter Excel'}
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
          <button
            onClick={() => setMultiFournOnly(v => !v)}
            title="Afficher uniquement les ingrédients achetés chez au moins 2 fournisseurs"
            style={{
              padding: '8px 12px', borderRadius: 8, fontSize: 13, cursor: 'pointer',
              border: `1px solid ${multiFournOnly ? c.accent : c.bordure}`,
              background: multiFournOnly ? c.accentClair : c.blanc,
              color: c.texte, whiteSpace: 'nowrap',
            }}
          >
            {multiFournOnly ? '☑' : '☐'} Multi-fournisseurs seulement
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
                  <p style={{ margin: 0, fontWeight: 600, fontSize: 14, color: c.texte, display: 'flex', alignItems: 'center', gap: 6 }}>
                    {row.ingredient_nom}
                    {row.units_mixed && (
                      <span
                        title={`Unités différentes selon le fournisseur : ${row.all_units.join(', ')}. Les prix ne sont pas directement comparables.`}
                        style={{ fontSize: 11, background: '#FEF3C7', color: '#92400E', padding: '1px 6px', borderRadius: 4, fontWeight: 500 }}
                      >⚠️ unités</span>
                    )}
                  </p>
                  <p style={{ margin: '2px 0 0', fontSize: 12, color: c.texteMuted }}>{row.unite}</p>
                </div>
                {fournisseursAffiches.map(fourn => {
                  const col = row.cols[fourn]
                  if (!col) return null
                  const nbFournsAvecPrix = fournisseursAffiches.filter(f => row.cols[f]).length
                  return (
                    <div key={fourn} style={{ padding: '10px 14px', borderBottom: `1px solid ${c.bordure}` }}>
                      <p style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 600, color: c.texte }}>{fourn}</p>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                        <span style={{ fontSize: 15, fontWeight: 700, color: col.is_best && nbFournsAvecPrix > 1 ? '#16A34A' : c.texte }}>
                          {fmtPrix(col.prix_last)}
                          {col.is_best && nbFournsAvecPrix > 1 && (
                            <span style={{ marginLeft: 4, fontSize: 10, background: '#DCFCE7', color: '#16A34A', padding: '1px 5px', borderRadius: 4 }}>✓ meilleur prix</span>
                          )}
                        </span>
                        <span style={{ fontSize: 12, color: c.texteMuted }}>moy. {fmtPrix(col.prix_moy)}</span>
                      </div>
                      <p style={{ margin: '2px 0 0', fontSize: 11, color: c.texteMuted }}>
                        Dernier achat : {fmtDate(col.date_last)} · {col.nb_achats} achat{col.nb_achats > 1 ? 's' : ''}
                      </p>
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
                      <th key={fourn} style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600, color: c.texteMuted, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', minWidth: 200, borderLeft: `1px solid ${c.bordure}` }}>
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
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4, fontSize: 10, color: c.texteMuted, textAlign: 'center' }}>
                          <span>Dernier prix</span>
                          <span>Moyenne</span>
                          <span>Dernier achat</span>
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
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          {row.ingredient_nom}
                          {row.units_mixed && (
                            <span
                              title={`Unités différentes selon le fournisseur : ${row.all_units.join(', ')}. Les prix ne sont pas directement comparables.`}
                              style={{ fontSize: 10, background: '#FEF3C7', color: '#92400E', padding: '1px 5px', borderRadius: 3, fontWeight: 500 }}
                            >⚠️ unités</span>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'center', color: c.texteMuted, fontSize: 12 }}>
                        {row.unite}
                      </td>
                      {fournisseursAffiches.map(fourn => {
                        const col = row.cols[fourn]
                        const nbFournsAvecPrix = fournisseursAffiches.filter(f => row.cols[f]).length

                        return (
                          <td key={fourn} style={{ padding: '8px 12px', borderLeft: `1px solid ${c.bordure}`, verticalAlign: 'middle' }}>
                            {!col ? (
                              <span style={{ color: c.bordure, fontSize: 18, display: 'block', textAlign: 'center' }}>—</span>
                            ) : (
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4, alignItems: 'center' }}>
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
      </div>
    </div>
  )
}
