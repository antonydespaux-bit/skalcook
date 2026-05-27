'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import * as XLSX from 'xlsx'
import { supabase, getClientId } from '../../../../lib/supabase'
import { useIsMobile } from '../../../../lib/useIsMobile'
import { useTheme } from '../../../../lib/useTheme'
import Navbar from '../../../../components/Navbar'
import BackButton from '../../../../components/BackButton'

// ─── Helpers parsing ─────────────────────────────────────────────────────────

// Année tolérante : "26" / "026" / "2026" → 2026
function normalizeYear(raw) {
  const n = parseInt(String(raw).replace(/\D/g, ''), 10)
  if (!Number.isFinite(n)) return null
  if (n >= 1000) return n            // déjà 4 chiffres
  if (n >= 100) return 2000 + (n % 100)  // "026" → 2026
  return n < 50 ? 2000 + n : 1900 + n     // "26" → 2026, "97" → 1997
}

// Parse une cellule Date xlsx (Date object) ou string FR → ISO YYYY-MM-DD | null
function parseDateCell(cell) {
  if (cell == null || cell === '') return null
  if (cell instanceof Date && !Number.isNaN(cell.getTime())) {
    const y = cell.getFullYear()
    const m = String(cell.getMonth() + 1).padStart(2, '0')
    const d = String(cell.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  const s = String(cell)
  const m = s.match(/(\d{1,2})[\/\-\.\s](\d{1,2})[\/\-\.\s](\d{2,4})/)
  if (!m) return null
  const day = parseInt(m[1], 10)
  const month = parseInt(m[2], 10)
  const year = normalizeYear(m[3])
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

// Extrait un N° facture après "FAC", "FAC:", "F:", "N°", etc.
function extractNumeroFacture(cellStr) {
  if (!cellStr) return null
  const s = String(cellStr)
  const m = s.match(/(?:FAC|F|N°|N\.|REF|FACT)[\s.:#°]*([A-Z0-9\-\/_]+)/i)
  return m ? m[1].trim() : null
}

// Parse montant FR : "1 234,56 €" / "1234.56" / number → number | null
function parseMontant(cell) {
  if (cell == null || cell === '') return null
  if (typeof cell === 'number' && Number.isFinite(cell)) return cell
  const s = String(cell)
    .replace(/[€$£\s]/g, '')
    .replace(',', '.')
  const n = parseFloat(s)
  return Number.isFinite(n) ? n : null
}

// Auto-détection d'une colonne par mot-clé dans l'en-tête (lowercase)
function detectColumn(headers, patterns) {
  for (let i = 0; i < headers.length; i++) {
    const h = String(headers[i] || '').toLowerCase()
    if (patterns.some(p => h.includes(p))) return i
  }
  return null
}

// ─── Composant ───────────────────────────────────────────────────────────────

export default function ImportExcelPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const section = searchParams.get('section') === 'bar' ? 'bar' : 'cuisine'
  const isBarMode = section === 'bar'
  const isMobile = useIsMobile()
  const { c } = useTheme()

  const [authReady, setAuthReady] = useState(false)
  const [clientId, setClientId] = useState(null)

  // 'upload' | 'mapping' | 'review' | 'saving' | 'done'
  const [step, setStep] = useState('upload')
  const [error, setError] = useState('')

  // Fichier
  const [fileName, setFileName] = useState('')
  const [sheets, setSheets] = useState([])         // [{ name, rows }]
  const [sheetIdx, setSheetIdx] = useState(0)
  const fileInputRef = useRef(null)
  const [isDragOver, setIsDragOver] = useState(false)

  // Mapping
  const [colFournisseur, setColFournisseur] = useState(null)
  const [colDate, setColDate] = useState(null)
  const [colTotalHt, setColTotalHt] = useState(null)
  const [colNumero, setColNumero] = useState(null) // optionnel
  const [dateMode, setDateMode] = useState('combined') // 'combined' | 'separated'
  const [fournisseurPrefix, setFournisseurPrefix] = useState('') // ex. "FOOD" → retiré du nom

  // Parsing & preview
  const [parsedRows, setParsedRows] = useState([]) // [{ fournisseur, date, numero, totalHt, valid, errors, checked }]
  const [numerosEnBase, setNumerosEnBase] = useState(new Set())

  // Résultat
  const [importResult, setImportResult] = useState(null)

  // ── Auth ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (cancelled) return
      if (!session) { router.replace('/'); return }
      const cid = await getClientId()
      if (cancelled) return
      setClientId(cid)
      setAuthReady(true)
    })()
    return () => { cancelled = true }
  }, [router])

  // ── Étape 1 : Upload fichier ─────────────────────────────────────────────
  const handleFile = useCallback(async (file) => {
    if (!file) return
    setError('')
    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array', cellDates: true })
      const sheetsData = wb.SheetNames.map((name) => {
        const ws = wb.Sheets[name]
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true })
        return { name, rows }
      })
      const firstWithData = sheetsData.findIndex(s => s.rows.length > 1)
      const idx = firstWithData >= 0 ? firstWithData : 0
      setFileName(file.name)
      setSheets(sheetsData)
      setSheetIdx(idx)
      setStep('mapping')
      // Auto-détection
      autoDetect(sheetsData[idx]?.rows ?? [])
    } catch (err) {
      setError(`Lecture du fichier impossible : ${err.message}`)
    }
  }, [])

  const autoDetect = (rows) => {
    if (!rows.length) return
    const headers = (rows[0] || []).map(v => v == null ? '' : String(v))
    const fIdx = detectColumn(headers, ['fournisseur', 'four.', 'supplier'])
    const dIdx = detectColumn(headers, ['date'])
    const htIdx = detectColumn(headers, ['ht', 'montant', 'total'])
    const nIdx = detectColumn(headers, ['n°', 'numero', 'numéro', 'facture', 'fac'])
    setColFournisseur(fIdx)
    setColDate(dIdx)
    setColTotalHt(htIdx)
    setColNumero(nIdx)
    // Si la colonne date contient déjà du texte type "01/05 FAC...", on devine "combined"
    if (dIdx != null && rows.length > 1) {
      const sample = rows[1]?.[dIdx]
      if (typeof sample === 'string' && /FAC|F:|N°|FACT/i.test(sample)) {
        setDateMode('combined')
      }
    }
  }

  // ── Étape 2 : Mapping → preview parsé ────────────────────────────────────
  const currentRows = useMemo(
    () => sheets[sheetIdx]?.rows ?? [],
    [sheets, sheetIdx]
  )
  const headers = useMemo(
    () => (currentRows[0] || []).map((v, i) => v == null || v === '' ? `Col ${i + 1}` : String(v)),
    [currentRows]
  )
  const previewRows = useMemo(() => currentRows.slice(1, 6), [currentRows])

  const goReview = async () => {
    if (colFournisseur == null || colDate == null || colTotalHt == null) {
      setError('Sélectionne au moins les colonnes Fournisseur, Date et Montant HT.')
      return
    }
    setError('')

    // Parse toutes les lignes (skip header row 0)
    const parsed = []
    for (let i = 1; i < currentRows.length; i++) {
      const row = currentRows[i]
      if (!row || row.every(v => v == null || v === '')) continue

      const errs = []
      let fournisseur = String(row[colFournisseur] ?? '').trim()
      // Retire le préfixe (case-insensitive) s'il est présent en début de chaîne
      const pref = fournisseurPrefix.trim()
      if (pref && fournisseur.toLowerCase().startsWith(pref.toLowerCase())) {
        fournisseur = fournisseur.slice(pref.length).trim()
      }
      if (!fournisseur) errs.push('Fournisseur manquant')

      const dateCell = row[colDate]
      const date = parseDateCell(dateCell)
      if (!date) errs.push('Date illisible')

      let numero = null
      if (dateMode === 'combined') {
        numero = extractNumeroFacture(dateCell)
      } else if (colNumero != null) {
        const raw = row[colNumero]
        numero = raw == null ? null : String(raw).trim() || null
      }

      const totalHt = parseMontant(row[colTotalHt])
      if (totalHt == null) errs.push('Montant HT invalide')

      parsed.push({
        sourceIdx: i,
        fournisseur,
        date,
        numero,
        totalHt,
        valid: errs.length === 0,
        errors: errs,
        checked: errs.length === 0,
      })
    }

    if (parsed.length === 0) {
      setError('Aucune ligne exploitable trouvée dans la feuille.')
      return
    }

    // Doublons déjà en base : on récupère les numéros de facture présents
    const numeros = parsed.map(p => p.numero).filter(Boolean)
    let enBase = new Set()
    if (numeros.length && clientId) {
      const { data } = await supabase
        .from('achats_factures')
        .select('numero_facture')
        .eq('client_id', clientId)
        .is('deleted_at', null)
        .in('numero_facture', numeros)
      enBase = new Set((data || []).map(r => (r.numero_facture || '').toLowerCase()))
    }
    setNumerosEnBase(enBase)
    setParsedRows(parsed)
    setStep('review')
  }

  // Doublons internes au fichier (même n° apparaît plusieurs fois)
  const numerosInternes = useMemo(() => {
    const counts = {}
    for (const p of parsedRows) {
      if (!p.numero) continue
      const k = p.numero.toLowerCase()
      counts[k] = (counts[k] || 0) + 1
    }
    return new Set(Object.entries(counts).filter(([, n]) => n > 1).map(([k]) => k))
  }, [parsedRows])

  const stats = useMemo(() => {
    const total = parsedRows.length
    const errors = parsedRows.filter(p => !p.valid).length
    const inDb = parsedRows.filter(p => p.numero && numerosEnBase.has(p.numero.toLowerCase())).length
    const checked = parsedRows.filter(p => p.checked).length
    return { total, errors, inDb, checked }
  }, [parsedRows, numerosEnBase])

  const toggleRow = (idx) => {
    setParsedRows(prev => prev.map((p, i) => i === idx ? { ...p, checked: !p.checked } : p))
  }

  const toggleAll = (checked) => {
    setParsedRows(prev => prev.map(p => p.valid ? { ...p, checked } : p))
  }

  // ── Étape 3 : Import ─────────────────────────────────────────────────────
  const handleImport = async () => {
    if (!clientId) return
    const rowsToImport = parsedRows
      .filter(p => p.checked && p.valid)
      .map(p => ({
        fournisseur: p.fournisseur,
        dateFacture: p.date,
        numeroFacture: p.numero || null,
        totalHt: p.totalHt,
      }))

    if (rowsToImport.length === 0) {
      setError('Aucune ligne cochée à importer.')
      return
    }

    setStep('saving')
    setError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/achats/import-excel-headers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ clientId, rows: rowsToImport, section }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
      setImportResult({ imported: json.imported })
      setStep('done')
    } catch (err) {
      setError(`Import échoué : ${err.message}`)
      setStep('review')
    }
  }

  // ── Styles partagés ──────────────────────────────────────────────────────
  if (!authReady) {
    return (
      <div style={{ minHeight: '100vh', background: c.fond, display: 'flex', alignItems: 'center', justifyContent: 'center', color: c.texteMuted, fontSize: 14 }}>
        Chargement…
      </div>
    )
  }

  const card = {
    background: c.blanc, borderRadius: 12, border: `0.5px solid ${c.bordure}`,
    padding: isMobile ? 16 : 24, marginBottom: 16,
  }
  const btnPrimary = {
    padding: '9px 16px', borderRadius: 8, fontSize: 13, border: 'none',
    background: c.accent, color: c.texte, cursor: 'pointer', fontWeight: 500,
  }
  const btnSecondary = {
    padding: '9px 16px', borderRadius: 8, fontSize: 13,
    border: `1px solid ${c.bordure}`, background: c.blanc, color: c.texte, cursor: 'pointer',
  }
  const select = {
    padding: '7px 10px', borderRadius: 8, fontSize: 13,
    border: `1px solid ${c.bordure}`, background: c.blanc, color: c.texte, outline: 'none',
  }
  const th = {
    padding: '10px 12px', textAlign: 'left', fontWeight: 600, fontSize: 11,
    color: c.texteMuted, textTransform: 'uppercase',
    borderBottom: `1px solid ${c.bordure}`, whiteSpace: 'nowrap',
  }
  const td = { padding: '10px 12px', fontSize: 13, color: c.texte, borderBottom: `1px solid ${c.bordure}` }

  return (
    <div style={{ minHeight: '100vh', background: c.fond }}>
      <Navbar section={section} />
      <div style={{ padding: isMobile ? 16 : 24, maxWidth: 1100, margin: '0 auto' }}>
        <BackButton onClick={() => router.push(isBarMode ? '/bar/achats' : '/controle-gestion/achats')} label="Retour aux achats" />

        <h1 style={{ margin: '12px 0 4px', fontSize: isMobile ? 22 : 26, fontWeight: 600, color: c.texte, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          Importer un Excel de factures
          {isBarMode && (
            <span style={{ display: 'inline-block', background: '#F5F3FF', color: '#5B21B6', fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 20, letterSpacing: 0.3 }}>
              BAR
            </span>
          )}
        </h1>
        <p style={{ margin: '0 0 20px', fontSize: 14, color: c.texteMuted }}>
          Import en masse des pieds de factures (fournisseur, date, total HT). Une ligne fictive « Facture (import Excel) » sera créée par facture.
        </p>

        {error && (
          <div style={{ background: '#FEE2E2', color: '#991B1B', padding: '10px 14px', borderRadius: 8, fontSize: 13, marginBottom: 16 }}>
            {error}
          </div>
        )}

        {/* ── Étape 1 : Upload ─────────────────────────────────────────── */}
        {step === 'upload' && (
          <div style={card}>
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setIsDragOver(true) }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={(e) => {
                e.preventDefault()
                setIsDragOver(false)
                const file = e.dataTransfer.files?.[0]
                if (file) handleFile(file)
              }}
              style={{
                border: `2px dashed ${isDragOver ? c.accent : c.bordure}`,
                borderRadius: 12, padding: '48px 24px', textAlign: 'center', cursor: 'pointer',
                background: isDragOver ? c.accentClair : 'transparent',
                transition: 'all 0.15s',
              }}
            >
              <div style={{ fontSize: 36, marginBottom: 8 }}>📊</div>
              <div style={{ fontSize: 15, fontWeight: 500, color: c.texte, marginBottom: 4 }}>
                Glisse ton fichier .xlsx ou clique pour parcourir
              </div>
              <div style={{ fontSize: 13, color: c.texteMuted }}>
                Le format des colonnes sera détecté à l&apos;étape suivante.
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                style={{ display: 'none' }}
                onChange={(e) => handleFile(e.target.files?.[0])}
              />
            </div>
          </div>
        )}

        {/* ── Étape 2 : Mapping des colonnes ───────────────────────────── */}
        {step === 'mapping' && (
          <>
            <div style={card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 13, color: c.texteMuted }}>Fichier</div>
                  <div style={{ fontSize: 14, fontWeight: 500, color: c.texte }}>{fileName}</div>
                </div>
                {sheets.length > 1 && (
                  <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: c.texteMuted }}>
                    Feuille
                    <select
                      value={sheetIdx}
                      onChange={(e) => { const i = Number(e.target.value); setSheetIdx(i); autoDetect(sheets[i]?.rows ?? []) }}
                      style={select}
                    >
                      {sheets.map((s, i) => <option key={i} value={i}>{s.name} ({Math.max(0, s.rows.length - 1)} lignes)</option>)}
                    </select>
                  </label>
                )}
              </div>

              <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 600, color: c.texte }}>
                Aperçu (5 premières lignes)
              </h3>
              <div style={{ overflowX: 'auto', border: `1px solid ${c.bordure}`, borderRadius: 8 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: c.fond }}>
                      {headers.map((h, i) => (
                        <th key={i} style={{ ...th, fontSize: 10 }}>
                          {h}
                          <div style={{ fontSize: 9, color: c.texteMuted, fontWeight: 400, textTransform: 'none' }}>col. {i + 1}</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((r, i) => (
                      <tr key={i}>
                        {headers.map((_, j) => (
                          <td key={j} style={{ ...td, fontSize: 12 }}>
                            {r[j] instanceof Date ? r[j].toLocaleDateString('fr-FR') : (r[j] == null ? '' : String(r[j]))}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div style={card}>
              <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 600, color: c.texte }}>Mapper les colonnes</h3>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14 }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span style={{ fontSize: 12, color: c.texteMuted, fontWeight: 500 }}>Fournisseur *</span>
                  <select value={colFournisseur ?? ''} onChange={(e) => setColFournisseur(e.target.value === '' ? null : Number(e.target.value))} style={select}>
                    <option value="">— Choisir —</option>
                    {headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
                  </select>
                  <input
                    type="text"
                    value={fournisseurPrefix}
                    onChange={(e) => setFournisseurPrefix(e.target.value)}
                    placeholder='Préfixe à retirer (ex. "FOOD")'
                    style={{ ...select, marginTop: 4 }}
                  />
                  <span style={{ fontSize: 11, color: c.texteMuted }}>
                    Si renseigné, sera retiré du début du nom (ex. « FOOD Vergers » → « Vergers »).
                  </span>
                </label>

                <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span style={{ fontSize: 12, color: c.texteMuted, fontWeight: 500 }}>Montant HT *</span>
                  <select value={colTotalHt ?? ''} onChange={(e) => setColTotalHt(e.target.value === '' ? null : Number(e.target.value))} style={select}>
                    <option value="">— Choisir —</option>
                    {headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
                  </select>
                </label>

                <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span style={{ fontSize: 12, color: c.texteMuted, fontWeight: 500 }}>Date *</span>
                  <select value={colDate ?? ''} onChange={(e) => setColDate(e.target.value === '' ? null : Number(e.target.value))} style={select}>
                    <option value="">— Choisir —</option>
                    {headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
                  </select>
                </label>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span style={{ fontSize: 12, color: c.texteMuted, fontWeight: 500 }}>Contenu de la colonne Date</span>
                  <div style={{ display: 'flex', gap: 12, fontSize: 13, color: c.texte }}>
                    <label style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
                      <input type="radio" name="dateMode" checked={dateMode === 'combined'} onChange={() => setDateMode('combined')} />
                      Date + N° facture mélangés
                    </label>
                    <label style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
                      <input type="radio" name="dateMode" checked={dateMode === 'separated'} onChange={() => setDateMode('separated')} />
                      Date seule
                    </label>
                  </div>
                </div>

                {dateMode === 'separated' && (
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <span style={{ fontSize: 12, color: c.texteMuted, fontWeight: 500 }}>N° facture (colonne dédiée, optionnel)</span>
                    <select value={colNumero ?? ''} onChange={(e) => setColNumero(e.target.value === '' ? null : Number(e.target.value))} style={select}>
                      <option value="">— Aucune —</option>
                      {headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
                    </select>
                  </label>
                )}
              </div>

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
                <button onClick={() => { setStep('upload'); setSheets([]); setFileName('') }} style={btnSecondary}>← Changer de fichier</button>
                <button onClick={goReview} style={btnPrimary}>Continuer →</button>
              </div>
            </div>
          </>
        )}

        {/* ── Étape 3 : Review ─────────────────────────────────────────── */}
        {step === 'review' && (
          <>
            <div style={{ ...card, display: 'flex', flexWrap: 'wrap', gap: 24, justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: 11, color: c.texteMuted, textTransform: 'uppercase', fontWeight: 600 }}>À importer</div>
                  <div style={{ fontSize: 22, fontWeight: 600, color: c.texte }}>{stats.checked} / {stats.total}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: c.texteMuted, textTransform: 'uppercase', fontWeight: 600 }}>Déjà en base</div>
                  <div style={{ fontSize: 22, fontWeight: 600, color: '#B45309' }}>{stats.inDb}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: c.texteMuted, textTransform: 'uppercase', fontWeight: 600 }}>Erreurs</div>
                  <div style={{ fontSize: 22, fontWeight: 600, color: '#B91C1C' }}>{stats.errors}</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button onClick={() => toggleAll(true)} style={btnSecondary}>Tout cocher</button>
                <button onClick={() => toggleAll(false)} style={btnSecondary}>Tout décocher</button>
                <button onClick={() => setStep('mapping')} style={btnSecondary}>← Mapping</button>
                <button onClick={handleImport} style={btnPrimary} disabled={stats.checked === 0}>
                  Importer {stats.checked} facture{stats.checked > 1 ? 's' : ''}
                </button>
              </div>
            </div>

            <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: c.fond }}>
                      <th style={{ ...th, width: 32 }}></th>
                      <th style={th}>Ligne</th>
                      <th style={th}>Fournisseur</th>
                      <th style={th}>Date</th>
                      <th style={th}>N° facture</th>
                      <th style={{ ...th, textAlign: 'right' }}>Total HT</th>
                      <th style={th}>Statut</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedRows.map((p, i) => {
                      const inDb = p.numero && numerosEnBase.has(p.numero.toLowerCase())
                      const internalDup = p.numero && numerosInternes.has(p.numero.toLowerCase())
                      let rowBg = 'transparent'
                      if (!p.valid) rowBg = '#FEE2E2'
                      else if (inDb) rowBg = '#FEF3C7'      // jaune : déjà en base
                      else if (internalDup) rowBg = '#FFEDD5' // orange : doublon dans le fichier
                      return (
                        <tr key={i} style={{ background: rowBg, opacity: p.valid ? 1 : 0.7 }}>
                          <td style={td}>
                            <input
                              type="checkbox"
                              checked={p.checked}
                              disabled={!p.valid}
                              onChange={() => toggleRow(i)}
                            />
                          </td>
                          <td style={{ ...td, color: c.texteMuted, fontSize: 12 }}>{p.sourceIdx + 1}</td>
                          <td style={{ ...td, fontWeight: 500 }}>{p.fournisseur || '—'}</td>
                          <td style={td}>{p.date ? new Date(p.date).toLocaleDateString('fr-FR') : <span style={{ color: '#B91C1C' }}>illisible</span>}</td>
                          <td style={{ ...td, fontFamily: 'monospace', fontSize: 12 }}>
                            {p.numero || <span style={{ color: c.texteMuted }}>—</span>}
                          </td>
                          <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                            {p.totalHt != null
                              ? `${p.totalHt.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
                              : <span style={{ color: '#B91C1C' }}>—</span>}
                          </td>
                          <td style={{ ...td, fontSize: 12 }}>
                            {!p.valid && <span style={{ color: '#B91C1C' }}>⚠ {p.errors.join(', ')}</span>}
                            {p.valid && inDb && <span style={{ color: '#B45309' }}>Déjà en base</span>}
                            {p.valid && !inDb && internalDup && <span style={{ color: '#9A3412' }}>Doublon dans le fichier</span>}
                            {p.valid && !inDb && !internalDup && <span style={{ color: '#15803D' }}>✓ Nouveau</span>}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* ── Étape 4 : Saving ─────────────────────────────────────────── */}
        {step === 'saving' && (
          <div style={{ ...card, textAlign: 'center', padding: 48 }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
            <div style={{ fontSize: 15, color: c.texte }}>Import en cours…</div>
          </div>
        )}

        {/* ── Étape 5 : Done ───────────────────────────────────────────── */}
        {step === 'done' && importResult && (
          <div style={{ ...card, textAlign: 'center', padding: 48 }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>✅</div>
            <div style={{ fontSize: 18, fontWeight: 600, color: c.texte, marginBottom: 6 }}>
              {importResult.imported} facture{importResult.imported > 1 ? 's' : ''} importée{importResult.imported > 1 ? 's' : ''}
            </div>
            <div style={{ fontSize: 13, color: c.texteMuted, marginBottom: 20 }}>
              Tu peux les retrouver et les compléter dans la liste des achats.
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              <button onClick={() => router.push('/controle-gestion/achats')} style={btnPrimary}>Voir la liste</button>
              <button onClick={() => {
                setStep('upload'); setSheets([]); setFileName(''); setParsedRows([])
                setColFournisseur(null); setColDate(null); setColTotalHt(null); setColNumero(null)
                setImportResult(null)
              }} style={btnSecondary}>Importer un autre fichier</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
