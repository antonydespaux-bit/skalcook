'use client'

import { useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { fromIsoDate, isoWeekStart, formatEur, formatEur2, formatNombre } from '../../../lib/caAnalyses'

// ── Tableau croisé guidé (TCD façon Excel) sur le CA ────────────────────────
// L'utilisateur choisit Lignes / Colonnes / Mesure. Le moteur agrège au bon
// grain : la « Catégorie » (Food/Alcool/Soft/Autre) éclate le CA, mais les
// couverts restent au niveau (jour × lieu × service) → la Catégorie n'est
// proposée que pour les mesures CA (sinon les couverts seraient faux).

const MOIS = ['Janv.', 'Févr.', 'Mars', 'Avr.', 'Mai', 'Juin', 'Juil.', 'Août', 'Sept.', 'Oct.', 'Nov.', 'Déc.']
const JOURS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']
const CAT_ORDER = { Food: '1', Alcool: '2', Soft: '3', Autre: '4' }

const isoJds = (iso) => { const w = fromIsoDate(iso).getDay(); return w === 0 ? 7 : w }

const DIMENSIONS = {
  annee:    { label: 'Année', ordinal: true, get: (r) => r.jour.slice(0, 4), sort: (r) => r.jour.slice(0, 4) },
  mois:     { label: 'Mois', ordinal: true, get: (r) => `${MOIS[Number(r.jour.slice(5, 7)) - 1]} ${r.jour.slice(0, 4)}`, sort: (r) => r.jour.slice(0, 7) },
  semaine:  { label: 'Semaine', ordinal: true, get: (r) => { const k = isoWeekStart(r.jour); return `Sem. ${k.slice(8)}/${k.slice(5, 7)}` }, sort: (r) => isoWeekStart(r.jour) },
  jourSem:  { label: 'Jour de semaine', ordinal: true, get: (r) => JOURS[isoJds(r.jour) - 1], sort: (r) => String(isoJds(r.jour)) },
  date:     { label: 'Date', ordinal: true, get: (r) => `${r.jour.slice(8)}/${r.jour.slice(5, 7)}/${r.jour.slice(0, 4)}`, sort: (r) => r.jour },
  lieu:     { label: 'Lieu', ordinal: false, get: (r, ctx) => ctx.lieuxLabels.get(r.lieu_service_id) || r.lieu_service_id || '—' },
  service:  { label: 'Service', ordinal: true, get: (r) => (r.service === 'lunch' ? 'Déjeuner' : 'Dîner'), sort: (r) => (r.service === 'lunch' ? '1' : '2') },
  categorie:{ label: 'Catégorie', ordinal: false, special: true },
}
const ROW_DIMS = ['lieu', 'service', 'categorie', 'mois', 'semaine', 'jourSem', 'date', 'annee']
const COL_DIMS = ['annee', 'service', 'lieu', 'categorie', 'mois', 'jourSem']

const MEASURES = {
  caTtc:    { label: 'CA TTC', additive: true, fmt: formatEur, get: (a) => a.ca },
  caHt:     { label: 'CA HT', additive: true, fmt: formatEur, get: (a) => a.caHt },
  couverts: { label: 'Couverts', additive: true, fmt: formatNombre, get: (a) => a.couverts, noCat: true },
  tm:       { label: 'Ticket moyen', additive: false, fmt: formatEur2, get: (a) => (a.couverts > 0 ? a.ca / a.couverts : null), noCat: true },
}

function rowContribs(r, catActive) {
  if (!catActive) {
    const ca = (+r.ca_food || 0) + (+r.ca_bev_20 || 0) + (+r.ca_bev_10 || 0) + (+r.ca_autre || 0)
    const caHt = (+r.ca_food || 0) / 1.10 + (+r.ca_bev_20 || 0) / 1.20 + (+r.ca_bev_10 || 0) / 1.10 + (+r.ca_autre || 0) / 1.10
    return [{ cat: null, ca, caHt, couverts: +r.couverts || 0 }]
  }
  const out = []
  const push = (cat, v, tva) => { if (v) out.push({ cat, ca: v, caHt: v / tva, couverts: 0 }) }
  push('Food', +r.ca_food || 0, 1.10); push('Alcool', +r.ca_bev_20 || 0, 1.20)
  push('Soft', +r.ca_bev_10 || 0, 1.10); push('Autre', +r.ca_autre || 0, 1.10)
  return out
}

const emptyCell = () => ({ ca: 0, caHt: 0, couverts: 0 })
const addInto = (a, b) => { a.ca += b.ca; a.caHt += b.caHt; a.couverts += b.couverts }

// Moteur pur : renvoie la matrice prête à afficher.
export function buildPivot(rows, { rowDims, colDim, measure, lieuxLabels }) {
  const catActive = rowDims.includes('categorie') || colDim === 'categorie'
  const ctx = { lieuxLabels }
  const getVal = (dk, r, cat) => (dk === 'categorie' ? cat : DIMENSIONS[dk].get(r, ctx))
  const getSort = (dk, r, cat) => {
    if (dk === 'categorie') return CAT_ORDER[cat] || '9'
    const d = DIMENSIONS[dk]; return d.sort ? d.sort(r) : null
  }

  const rowMap = new Map()   // rowKey -> { parts, sort, cols: Map(colKey -> raw), total: raw }
  const colMap = new Map()   // colKey -> { sort, total: raw }
  const grand = emptyCell()

  for (const r of rows) {
    for (const ct of rowContribs(r, catActive)) {
      const parts = rowDims.map((dk) => getVal(dk, r, ct.cat))
      const rsort = rowDims.map((dk) => getSort(dk, r, ct.cat))
      const rowKey = parts.join(' ▮ ')
      const colKey = colDim ? getVal(colDim, r, ct.cat) : '__val__'
      const csort = colDim ? getSort(colDim, r, ct.cat) : ''

      if (!rowMap.has(rowKey)) rowMap.set(rowKey, { parts, sort: rsort, cols: new Map(), total: emptyCell() })
      const rec = rowMap.get(rowKey)
      if (!rec.cols.has(colKey)) rec.cols.set(colKey, emptyCell())
      addInto(rec.cols.get(colKey), ct)
      addInto(rec.total, ct)

      if (!colMap.has(colKey)) colMap.set(colKey, { sort: csort, total: emptyCell() })
      addInto(colMap.get(colKey).total, ct)
      addInto(grand, ct)
    }
  }

  const m = MEASURES[measure]
  const mval = (raw) => m.get(raw)

  // Ordre des colonnes
  let colKeys = [...colMap.keys()]
  if (colDim) {
    const ordinal = DIMENSIONS[colDim].ordinal
    colKeys.sort((a, b) => ordinal
      ? String(colMap.get(a).sort).localeCompare(String(colMap.get(b).sort))
      : (mval(colMap.get(b).total) || 0) - (mval(colMap.get(a).total) || 0))
  }

  // Ordre des lignes
  const allOrdinal = rowDims.every((dk) => DIMENSIONS[dk].ordinal)
  const rowsArr = [...rowMap.entries()].map(([key, rec]) => ({ key, ...rec }))
  rowsArr.sort((a, b) => allOrdinal
    ? a.sort.join('▮').localeCompare(b.sort.join('▮'))
    : (mval(b.total) || 0) - (mval(a.total) || 0))

  // Max pour la heatmap (sur les cellules, mesure additive)
  let maxCell = 0
  if (m.additive) {
    for (const r of rowsArr) for (const ck of colKeys) {
      const v = mval(r.cols.get(ck) || emptyCell()) || 0
      if (v > maxCell) maxCell = v
    }
  }

  return {
    rowDims, colDim, measure,
    colKeys: colKeys.map((k) => ({ key: k, label: colDim ? k : m.label, total: mval(colMap.get(k).total) })),
    rows: rowsArr.map((r) => ({
      parts: r.parts,
      cells: colKeys.map((ck) => mval(r.cols.get(ck) || emptyCell())),
      total: mval(r.total),
    })),
    grand: mval(grand),
    additive: m.additive,
    maxCell,
    fmt: m.fmt,
  }
}

// ── Composant ───────────────────────────────────────────────────────────────

export default function PivotView({ c, isMobile, rows, lieuxLabels, multiYear }) {
  const [rowDims, setRowDims] = useState(['lieu'])
  // Si les données couvrent 2 ans (comparaison N-1 active), on met « Année »
  // en colonnes par défaut → tableau croisé YoY explicite (sinon le défaut
  // additionnerait silencieusement les deux années).
  const [colDim, setColDim] = useState(multiYear ? 'annee' : 'service')
  const [measure, setMeasure] = useState('caTtc')
  const [display, setDisplay] = useState('valeur') // 'valeur' | 'pct'

  const catBlocked = MEASURES[measure].noCat
  // Si la mesure interdit la catégorie, on la retire des sélections.
  const effRowDims = catBlocked ? rowDims.filter((d) => d !== 'categorie') : rowDims
  const effColDim = catBlocked && colDim === 'categorie' ? null : colDim

  const pivot = useMemo(
    () => buildPivot(rows || [], { rowDims: effRowDims.length ? effRowDims : ['lieu'], colDim: effColDim, measure, lieuxLabels }),
    [rows, effRowDims, effColDim, measure, lieuxLabels]
  )

  const toggleRow = (dk) => {
    setRowDims((cur) => cur.includes(dk) ? cur.filter((d) => d !== dk) : [...cur, dk])
  }

  const showPct = display === 'pct' && pivot.additive
  const cellText = (v) => {
    if (v == null) return '—'
    if (showPct) return pivot.grand ? `${((v / pivot.grand) * 100).toFixed(1)} %` : '—'
    return pivot.fmt(v)
  }

  const handleExport = () => {
    const aoa = []
    aoa.push([...effRowDims.map((d) => DIMENSIONS[d].label), ...pivot.colKeys.map((c2) => c2.label), 'Total'])
    for (const r of pivot.rows) {
      aoa.push([...r.parts, ...r.cells.map((v) => v ?? ''), r.total ?? ''])
    }
    aoa.push(['Total', ...Array(effRowDims.length - 1).fill(''), ...pivot.colKeys.map((c2) => c2.total ?? ''), pivot.grand ?? ''])
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Tableau croisé')
    XLSX.writeFile(wb, 'tableau-croise.xlsx')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Configuration */}
      <div style={cardStyle(c, isMobile)}>
        <ConfigRow c={c} label="Lignes">
          {ROW_DIMS.map((dk) => {
            const disabled = dk === 'categorie' && catBlocked
            const active = effRowDims.includes(dk)
            return <Chip key={dk} c={c} active={active} disabled={disabled}
              onClick={() => !disabled && toggleRow(dk)} label={DIMENSIONS[dk].label} />
          })}
        </ConfigRow>

        <ConfigRow c={c} label="Colonnes">
          <select value={effColDim || ''} onChange={(e) => setColDim(e.target.value || null)} style={selectStyle(c)}>
            <option value="">— Aucune —</option>
            {COL_DIMS.map((dk) => {
              const disabled = dk === 'categorie' && catBlocked
              return <option key={dk} value={dk} disabled={disabled}>{DIMENSIONS[dk].label}</option>
            })}
          </select>
        </ConfigRow>

        <ConfigRow c={c} label="Mesure">
          <select value={measure} onChange={(e) => setMeasure(e.target.value)} style={selectStyle(c)}>
            {Object.entries(MEASURES).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
          </select>
          <div style={{ flex: 1 }} />
          {pivot.additive && (
            <Segmented c={c} value={display} onChange={setDisplay}
              options={[['valeur', 'Valeur'], ['pct', '% du total']]} />
          )}
          <button onClick={handleExport} style={exportBtn(c)}>📥 Excel</button>
        </ConfigRow>
        {catBlocked && (
          <div style={{ fontSize: 11.5, color: c.texteMuted, marginTop: 4 }}>
            La catégorie est désactivée pour « {MEASURES[measure].label} » (les couverts ne se décomposent pas par catégorie).
          </div>
        )}
        {multiYear && (
          <div style={{ fontSize: 11.5, color: c.texteMuted, marginTop: catBlocked ? 2 : 4 }}>
            Données 2026 + 2025 (comparaison active) — gardez « Année » en lignes ou colonnes pour distinguer les deux années.
          </div>
        )}
      </div>

      {/* Tableau */}
      <div style={{ ...cardStyle(c, isMobile), padding: 0, overflow: 'hidden' }}>
        {pivot.rows.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: c.texteMuted, fontSize: 13 }}>
            Aucune donnée sur la période / les filtres sélectionnés.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  {effRowDims.map((dk) => <Th key={dk} c={c} left>{DIMENSIONS[dk].label}</Th>)}
                  {pivot.colKeys.map((ck) => <Th key={ck.key} c={c}>{ck.label}</Th>)}
                  {effColDim && <Th c={c} strong>Total</Th>}
                </tr>
              </thead>
              <tbody>
                {pivot.rows.map((r, i) => (
                  <tr key={i}>
                    {r.parts.map((p, j) => <Td key={j} c={c} left strong={j === 0}>{p}</Td>)}
                    {r.cells.map((v, j) => (
                      <Td key={j} c={c} heat={heatBg(c, v, pivot.maxCell, showPct)}>{cellText(v)}</Td>
                    ))}
                    {effColDim && <Td c={c} strong>{cellText(r.total)}</Td>}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: `2px solid ${c.bordure}` }}>
                  <Td c={c} left strong>Total</Td>
                  {effRowDims.slice(1).map((_, j) => <Td key={j} c={c}></Td>)}
                  {pivot.colKeys.map((ck, j) => <Td key={j} c={c} strong>{cellText(ck.total)}</Td>)}
                  {effColDim && <Td c={c} strong>{cellText(pivot.grand)}</Td>}
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Sous-composants ─────────────────────────────────────────────────────────

function ConfigRow({ c, label, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
      <span style={{ width: 70, fontSize: 12, color: c.texteMuted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4, flexShrink: 0 }}>{label}</span>
      {children}
    </div>
  )
}

function Chip({ c, active, disabled, onClick, label }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      padding: '6px 12px', borderRadius: 16, fontSize: 12.5,
      border: `1px solid ${active ? c.accent : c.bordure}`,
      background: active ? c.accent : c.blanc,
      color: disabled ? c.texteMuted : active ? c.texte : c.texteMuted,
      cursor: disabled ? 'not-allowed' : 'pointer', fontWeight: active ? 600 : 500,
      opacity: disabled ? 0.45 : 1,
    }}>{label}</button>
  )
}

function Segmented({ c, value, onChange, options }) {
  return (
    <div style={{ display: 'inline-flex', background: c.fond, borderRadius: 9, padding: 3, gap: 2, border: `1px solid ${c.bordure}` }}>
      {options.map(([val, label]) => (
        <button key={val} onClick={() => onChange(val)} style={{
          padding: '5px 12px', borderRadius: 7, fontSize: 12.5, fontWeight: value === val ? 600 : 500,
          border: 'none', cursor: 'pointer',
          background: value === val ? c.blanc : 'transparent',
          color: value === val ? c.texte : c.texteMuted,
        }}>{label}</button>
      ))}
    </div>
  )
}

function Th({ c, left, strong, children }) {
  return (
    <th style={{
      textAlign: left ? 'left' : 'right', padding: '10px 14px',
      color: strong ? c.texte : c.texteMuted, fontWeight: strong ? 700 : 500,
      fontSize: 11.5, textTransform: 'uppercase', letterSpacing: 0.4,
      borderBottom: `1px solid ${c.bordure}`, whiteSpace: 'nowrap',
      background: c.fond, position: 'sticky', top: 0,
    }}>{children}</th>
  )
}

function Td({ c, left, strong, heat, children }) {
  return (
    <td style={{
      textAlign: left ? 'left' : 'right', padding: '9px 14px',
      borderBottom: `1px solid ${c.bordure}`, whiteSpace: 'nowrap',
      fontWeight: strong ? 600 : 400, color: c.texte,
      background: heat || 'transparent',
    }}>{children}</td>
  )
}

function heatBg(c, v, max, showPct) {
  if (showPct || !v || !max || max <= 0) return null
  const t = Math.max(0, Math.min(1, v / max))
  return `${c.accent}${Math.round(t * 38).toString(16).padStart(2, '0')}` // accent à faible opacité ∝ valeur
}

function cardStyle(c, isMobile) {
  return { background: c.blanc, border: `1px solid ${c.bordure}`, borderRadius: 14, padding: isMobile ? 14 : 18 }
}
function selectStyle(c) {
  return { padding: '8px 11px', borderRadius: 9, border: `1px solid ${c.bordure}`, background: c.blanc, color: c.texte, fontFamily: 'inherit', fontSize: 13, cursor: 'pointer' }
}
function exportBtn(c) {
  return { background: 'transparent', border: `1px solid ${c.bordure}`, color: c.texteMuted, borderRadius: 8, padding: '7px 12px', fontSize: 12, cursor: 'pointer' }
}
