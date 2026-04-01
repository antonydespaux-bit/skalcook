'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase, getClientId } from '../lib/supabase'
import { useTheme } from '../lib/useTheme'

const PREVIEW_KEYS = ['designation', 'sku', 'quantite', 'montant', 'prixUht', 'tva', 'fiche']
const PREVIEW_LABELS = {
  designation: 'Désignation',
  sku: 'SKU',
  quantite: 'Quantité',
  montant: 'Montant',
  prixUht: 'Prix U. HT',
  tva: 'TVA',
  fiche: 'Association fiche',
}

const NUMERIC_RIGHT_KEYS = new Set(['quantite', 'montant', 'prixUht', 'tva'])

const FUZZY_SUGGEST_MIN = 0.48
const MAPPING_SCORE = 1

function defaultYesterdayIso() {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Décode les entités HTML (exports Lightspeed).
 */
function decodeHtmlEntities(text) {
  const s = String(text ?? '')
  if (typeof window === 'undefined' || !s.includes('&')) return s
  const ta = document.createElement('textarea')
  ta.innerHTML = s
  return ta.value
}

/**
 * Parse une ligne CSV (virgules, guillemets doubles).
 */
function parseCsvLine(line) {
  const cells = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"'
          i += 1
        } else {
          inQuotes = false
        }
      } else {
        current += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      cells.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  cells.push(current)
  return cells.map((c) => c.trim())
}

/** Parse le fichier CSV (en-tête + lignes de données). */
function parseCsv(text) {
  const raw = text.replace(/^\uFEFF/, '')
  const lines = raw.split(/\r?\n/).filter((l) => l.length > 0)
  if (lines.length === 0) return { headers: [], rows: [] }
  const headers = parseCsvLine(lines[0])
  const rows = []
  for (let i = 1; i < lines.length; i += 1) {
    const cells = parseCsvLine(lines[i])
    if (cells.length === 1 && cells[0] === '') continue
    rows.push(cells)
  }
  return { headers, rows }
}

function normalizeHeader(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Repère les colonnes Lightspeed (SKU, quantités, montants, TVA optionnelle). */
function resolveLightspeedColumns(headers) {
  const n = headers.map(normalizeHeader)
  const idxDesignation = 0

  const idxSku = n.findIndex((x) => x === 'sku' || x.endsWith(' sku') || x.startsWith('sku '))
  if (idxSku < 0) return null

  let idxQte = n.findIndex((x) => x === 'total quantite' || (x.includes('quantit') && x.includes('total')))
  if (idxQte < 0) return null

  let idxMontant = n.findIndex((x) => x === 'total montant')
  if (idxMontant < 0) {
    idxMontant = n.findIndex(
      (x) => x.includes('montant') && x.includes('total') && !x.includes('rabais') && !x.includes('remise')
    )
  }
  if (idxMontant < 0) return null

  let idxTva = n.findIndex((x) => x === 'tva')
  if (idxTva < 0) idxTva = n.findIndex((x) => x === 'taux de taxe' || (x.includes('taux') && x.includes('tax')))
  if (idxTva < 0) idxTva = n.findIndex((x) => (x.includes('tva') || x.includes('tax')) && (x.includes('taux') || x.includes('rate')))
  if (idxTva < 0) idxTva = n.findIndex((x) => x === 'tax rate' || x === 'vat rate')

  return { idxDesignation, idxSku, idxQte, idxMontant, idxTva: idxTva >= 0 ? idxTva : null }
}

/** Parse un nombre (virgule/point, espaces retirés). */
function parseNumberLoose(raw) {
  if (raw == null || raw === '') return NaN
  let s = String(raw).trim().replace(/\u00a0/g, ' ').replace(/\s/g, '')
  if (!s || s === '-') return NaN
  const lastComma = s.lastIndexOf(',')
  const lastDot = s.lastIndexOf('.')
  if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.')
  else s = s.replace(/,/g, '')
  const n = Number.parseFloat(s)
  return Number.isFinite(n) ? n : NaN
}

/** Titres de section type lieu Lightspeed (« … - … »). */
function looksLikeSectionTitle(designation) {
  const t = String(designation || '').trim()
  if (!t) return true
  return /\s-\s/.test(t)
}

/**
 * Racine d’affichage / fusion : parenthèses, crochets, espaces, suffixes (tous)/(inclus), etc.
 */
function designationRoot(decodedText) {
  let t = String(decodedText ?? '')
  t = t.replace(/\u00a0/g, ' ').replace(/[\u2000-\u200f\u202f\u205f\u3000\ufeff]/g, ' ')
  t = t.trim()
  let prev = ''
  while (t !== prev) {
    prev = t
    t = t
      .replace(/\s*\([^)]*\)/g, ' ')
      .replace(/\s*\[[^\]]*\]/g, ' ')
      .replace(/\s*（[^）]*）/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  }
  t = t.replace(/\s+\b(tous|tout|toute|toutes|inclus|incluse|incluses|included|excl\.?|hors)\b$/i, '').trim()
  t = t.replace(/\s*[-–—]\s*(tous|inclus|incluse)\b$/i, '').trim()
  t = t.replace(/\s+/g, ' ').trim()
  return t
}

/** Clé de fusion (racine normalisée en minuscules). */
function mergeKeyFromDesignation(designation) {
  const n = String(designation || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
  return `name:${n}`
}

/** Clé React / mapping : racine de désignation (une ligne fusionnée par produit). */
function stableRowKey(row) {
  return mergeKeyFromDesignation(row.designation)
}

/** Affichage nombre (quantités, etc.). */
function formatPrettyNumber(n) {
  if (!Number.isFinite(n)) return ''
  if (Math.abs(n - Math.round(n)) < 1e-9) return String(Math.round(n))
  return new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6,
  }).format(n)
}

/** Montant en euros, 2 décimales, symbole € (fr-FR). */
function formatMoneyEUR(n) {
  if (!Number.isFinite(n)) return '—'
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)
}

function normalizeForMatch(s) {
  return decodeHtmlEntities(String(s || ''))
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Distance de Levenshtein (fuzzy match). */
function levenshtein(a, b) {
  const m = a.length
  const n = b.length
  if (!m) return n
  if (!n) return m
  const prev = new Array(n + 1)
  const cur = new Array(n + 1)
  for (let j = 0; j <= n; j += 1) prev[j] = j
  for (let i = 1; i <= m; i += 1) {
    cur[0] = i
    const ai = a[i - 1]
    for (let j = 1; j <= n; j += 1) {
      const cost = ai === b[j - 1] ? 0 : 1
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
    }
    for (let j = 0; j <= n; j += 1) prev[j] = cur[j]
  }
  return prev[n]
}

/** Score 0–1 entre deux libellés normalisés. */
function fuzzyScoreBetweenNormalized(qn, cn) {
  if (!qn || !cn) return 0
  if (qn === cn) return 1
  if (cn.includes(qn) || qn.includes(cn)) return Math.min(0.92, 0.65 + 0.1 * Math.min(qn.length, cn.length) / Math.max(qn.length, cn.length))
  const maxLen = Math.max(qn.length, cn.length)
  const lenDiff = Math.abs(qn.length - cn.length)
  if (lenDiff > maxLen * 0.55) return 0
  const d = levenshtein(qn, cn)
  return 1 - d / maxLen
}

/** Meilleure fiche candidat pour une désignation (fuzzy). */
function bestFicheMatch(designationDecoded, candidates) {
  const qn = normalizeForMatch(designationDecoded)
  if (!qn) return null
  let best = null
  let bestScore = 0
  for (const c of candidates) {
    const score = fuzzyScoreBetweenNormalized(qn, c.norm)
    if (score > bestScore) {
      bestScore = score
      best = { key: c.key, nom: c.nom, source: c.source, score: bestScore }
    }
  }
  if (!best || best.score < FUZZY_SUGGEST_MIN) return null
  return best
}

/** Découpe une clé `fiches:uuid` ou `fiches_bar:uuid`. */
function parseFicheKey(ficheKey) {
  const s = String(ficheKey || '')
  const i = s.indexOf(':')
  if (i <= 0) return null
  const source = s.slice(0, i)
  const id = s.slice(i + 1)
  if (!id || (source !== 'fiches' && source !== 'fiches_bar')) return null
  return { source, id }
}

/**
 * Lignes CSV valides (une par ligne source), avant fusion par racine de désignation.
 */
function extractCleanRowsUnfolded(rawRows, cols) {
  const { idxDesignation, idxSku, idxQte, idxMontant, idxTva } = cols
  const out = []
  for (const row of rawRows) {
    const rawDes = row[idxDesignation] ?? ''
    const decoded = decodeHtmlEntities(String(rawDes).trim())
    const designation = designationRoot(decoded)
    const sku = row[idxSku] ?? ''
    const qte = parseNumberLoose(row[idxQte])
    let montant = parseNumberLoose(row[idxMontant])
    const tauxTvaDisplay =
      idxTva != null && idxTva >= 0 ? String(row[idxTva] ?? '').trim() : ''

    if (!Number.isFinite(qte)) continue
    if (!designation) continue
    if (looksLikeSectionTitle(designation)) continue
    const skuTrim = String(sku).trim()
    if (!skuTrim) continue

    if (!Number.isFinite(montant)) montant = 0

    out.push({
      designation,
      sku: skuTrim,
      quantite: qte,
      montant,
      tauxTvaDisplay,
    })
  }
  return out
}

/**
 * Fusion : une ligne par racine (cumul quantités / montants ; SKU et libellé TVA = premier rencontré).
 */
function foldRowsByDesignationRoot(rows) {
  const map = new Map()
  for (const row of rows) {
    const key = mergeKeyFromDesignation(row.designation)
    const prev = map.get(key)
    if (!prev) {
      map.set(key, { ...row })
    } else {
      prev.quantite += row.quantite
      prev.montant += row.montant
      if (!prev.tauxTvaDisplay && row.tauxTvaDisplay) prev.tauxTvaDisplay = row.tauxTvaDisplay
    }
  }
  return Array.from(map.values())
}

/** Extraction + fusion : une ligne par racine ; retourne aussi le nombre de lignes sources extraites. */
function extractCleanRows(rawRows, cols) {
  const unfolded = extractCleanRowsUnfolded(rawRows, cols)
  const rows = foldRowsByDesignationRoot(unfolded)
  return { rows, rawExtractedCount: unfolded.length }
}

/** Cumule un lot dans une Map par clé de désignation. */
function mergeIntoMap(map, batch) {
  for (const row of batch) {
    const key = mergeKeyFromDesignation(row.designation)
    const prev = map.get(key)
    if (!prev) {
      map.set(key, { ...row })
    } else {
      prev.quantite += row.quantite
      prev.montant += row.montant
      if (!prev.tauxTvaDisplay && row.tauxTvaDisplay) prev.tauxTvaDisplay = row.tauxTvaDisplay
    }
  }
}

export default function VentesImporter() {
  const { c } = useTheme()
  const fileInputRef = useRef(null)
  const [venteJour, setVenteJour] = useState(defaultYesterdayIso)
  const [aggregatedRows, setAggregatedRows] = useState([])
  const [importedFiles, setImportedFiles] = useState([])
  const [cumulative, setCumulative] = useState(true)
  const [lastFileName, setLastFileName] = useState('')
  const [error, setError] = useState('')
  const [parseNote, setParseNote] = useState('')
  const [skippedCount, setSkippedCount] = useState(0)
  const [ficheOptions, setFicheOptions] = useState([])
  const [fichesLoadError, setFichesLoadError] = useState('')
  /** Choix explicite utilisateur (clé `fiches:id` / `fiches_bar:id` ou '' ). Absence de clé = laisser la suggestion auto. */
  const [manualFicheByRow, setManualFicheByRow] = useState({})
  const [mappingVentes, setMappingVentes] = useState([])
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState('')

  const reloadMappings = useCallback(async (clientId) => {
    const { data, error: mErr } = await supabase
      .from('mapping_ventes')
      .select('designation_lightspeed,fiche_id,source_table')
      .eq('client_id', clientId)
    if (mErr) {
      setMappingVentes([])
      return
    }
    setMappingVentes(data || [])
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const clientId = await getClientId()
      if (!clientId || cancelled) {
        if (!cancelled && !clientId) setFicheOptions([])
        return
      }
      await reloadMappings(clientId)
      if (cancelled) return
      const [rCuisine, rBar] = await Promise.all([
        supabase
          .from('fiches')
          .select('id,nom')
          .eq('client_id', clientId)
          .or('archive.is.null,archive.eq.false')
          .order('nom'),
        supabase
          .from('fiches_bar')
          .select('id,nom')
          .eq('client_id', clientId)
          .or('archive.is.null,archive.eq.false')
          .order('nom'),
      ])
      if (cancelled) return
      if (rCuisine.error || rBar.error) {
        setFichesLoadError((rCuisine.error || rBar.error)?.message || 'Erreur chargement fiches')
        setFicheOptions([])
        return
      }
      setFichesLoadError('')
      const opts = []
      for (const row of rCuisine.data || []) {
        if (!row?.id) continue
        opts.push({
          key: `fiches:${row.id}`,
          id: row.id,
          nom: row.nom || '(sans nom)',
          source: 'fiches',
          norm: normalizeForMatch(row.nom || ''),
        })
      }
      for (const row of rBar.data || []) {
        if (!row?.id) continue
        opts.push({
          key: `fiches_bar:${row.id}`,
          id: row.id,
          nom: row.nom || '(sans nom)',
          source: 'fiches_bar',
          norm: normalizeForMatch(row.nom || ''),
        })
      }
      setFicheOptions(opts)
    })()
    return () => {
      cancelled = true
    }
  }, [reloadMappings])

  const mappingLookup = useMemo(() => {
    const m = new Map()
    for (const r of mappingVentes) {
      if (!r?.designation_lightspeed) continue
      const k = String(r.designation_lightspeed).toLowerCase().trim()
      m.set(k, r)
    }
    return m
  }, [mappingVentes])

  const suggestionsByRow = useMemo(() => {
    if (!aggregatedRows.length) return {}
    const out = {}
    for (const row of aggregatedRows) {
      const rk = stableRowKey(row)
      const desKey = String(row.designation).toLowerCase().trim()
      const mem = mappingLookup.get(desKey)
      if (mem && (mem.source_table === 'fiches' || mem.source_table === 'fiches_bar')) {
        const key = `${mem.source_table}:${mem.fiche_id}`
        const opt = ficheOptions.find((o) => o.key === key)
        if (opt) {
          out[rk] = {
            key,
            nom: opt.nom,
            source: mem.source_table,
            score: MAPPING_SCORE,
            fromMapping: true,
          }
          continue
        }
      }
      if (!ficheOptions.length) continue
      const sug = bestFicheMatch(row.designation, ficheOptions)
      if (sug) out[rk] = { ...sug, fromMapping: false }
    }
    return out
  }, [aggregatedRows, ficheOptions, mappingLookup])

  useEffect(() => {
    const validKeys = new Set(aggregatedRows.map(stableRowKey))
    setManualFicheByRow((prev) => {
      let changed = false
      const next = { ...prev }
      for (const k of Object.keys(next)) {
        if (!validKeys.has(k)) {
          delete next[k]
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [aggregatedRows])

  const effectiveFicheKey = useCallback(
    (rk) => {
      if (Object.prototype.hasOwnProperty.call(manualFicheByRow, rk)) return manualFicheByRow[rk]
      const sug = suggestionsByRow[rk]
      return sug && sug.score >= FUZZY_SUGGEST_MIN ? sug.key : ''
    },
    [manualFicheByRow, suggestionsByRow]
  )

  const handleConfirmSave = useCallback(async () => {
    setSaveMessage('')
    setError('')
    const clientId = await getClientId()
    if (!clientId) {
      setError('Établissement non sélectionné : impossible d’enregistrer.')
      return
    }
    if (!venteJour) {
      setError('Choisissez une date de vente.')
      return
    }
    const ventesPayload = []
    const mappingPayload = []
    let skippedBar = 0
    let sansAssociation = 0

    for (const row of aggregatedRows) {
      const rk = stableRowKey(row)
      const fk = effectiveFicheKey(rk)
      if (!fk) {
        sansAssociation += 1
        continue
      }
      const parsed = parseFicheKey(fk)
      if (!parsed) continue

      mappingPayload.push({
        client_id: clientId,
        designation_lightspeed: row.designation.trim(),
        designation_norm: mergeKeyFromDesignation(row.designation),
        fiche_id: parsed.id,
        source_table: parsed.source,
      })

      if (parsed.source === 'fiches') {
        if (!(row.quantite > 0)) continue
        const pu = row.montant / row.quantite
        const prix = Math.round(pu * 100) / 100
        ventesPayload.push({
          jour: venteJour,
          fiche_id: parsed.id,
          quantite_vendue: row.quantite,
          prix_vente_net: prix,
          client_id: clientId,
        })
      } else {
        skippedBar += 1
      }
    }

    if (mappingPayload.length === 0) {
      setError('Aucune ligne associée à une fiche : cochez les correspondances ou complétez le mapping.')
      return
    }

    const mappingDedup = new Map()
    for (const m of mappingPayload) {
      mappingDedup.set(m.designation_norm, m)
    }
    const mappingRowsToUpsert = Array.from(mappingDedup.values())

    setSaving(true)
    try {
      if (ventesPayload.length > 0) {
        const { error: vErr } = await supabase.from('ventes_journalieres').insert(ventesPayload)
        if (vErr) throw vErr
      }

      const { error: mapErr } = await supabase.from('mapping_ventes').upsert(mappingRowsToUpsert, {
        onConflict: 'client_id,designation_norm',
      })
      if (mapErr) throw mapErr

      await reloadMappings(clientId)

      const parts = []
      if (ventesPayload.length > 0) {
        parts.push(`${ventesPayload.length} ligne${ventesPayload.length > 1 ? 's' : ''} enregistrée${ventesPayload.length > 1 ? 's' : ''} dans les ventes journalières`)
      }
      if (skippedBar > 0) {
        parts.push(`${skippedBar} ligne${skippedBar > 1 ? 's' : ''} bar non enregistrée${skippedBar > 1 ? 's' : ''} (table cuisine uniquement)`)
      }
      parts.push(`${mappingRowsToUpsert.length} association${mappingRowsToUpsert.length > 1 ? 's' : ''} mémorisée${mappingRowsToUpsert.length > 1 ? 's' : ''}`)
      if (sansAssociation > 0) {
        parts.push(`${sansAssociation} ligne${sansAssociation > 1 ? 's' : ''} sans fiche ignorée${sansAssociation > 1 ? 's' : ''}`)
      }
      setSaveMessage(parts.join('. ') + '.')
    } catch (err) {
      console.error(err)
      setError(err?.message || 'Erreur lors de l’enregistrement.')
    } finally {
      setSaving(false)
    }
  }, [aggregatedRows, effectiveFicheKey, reloadMappings, venteJour])

  const setAssociation = useCallback((rowKey, value) => {
    setManualFicheByRow((prev) => ({ ...prev, [rowKey]: value }))
  }, [])

  const onFile = useCallback(
    (e) => {
      const file = e.target.files?.[0]
      setError('')
      setParseNote('')
      setSaveMessage('')
      setSkippedCount(0)
      if (!file) return
      if (!/\.csv$/i.test(file.name) && file.type && !file.type.includes('csv') && !file.type.includes('text')) {
        setError('Veuillez choisir un fichier .csv (ou texte/csv).')
        return
      }
      setLastFileName(file.name)
      const reader = new FileReader()
      reader.onload = () => {
        try {
          const text = typeof reader.result === 'string' ? reader.result : ''
          const { headers: h, rows: r } = parseCsv(text)
          if (h.length === 0) {
            setError('Fichier vide ou sans en-tête.')
            return
          }
          const cols = resolveLightspeedColumns(h)
          if (!cols) {
            setError(
              'En-têtes Lightspeed introuvables : ce CSV doit contenir les colonnes SKU, Total Quantité et Total Montant.'
            )
            return
          }
          const uneven = r.some((row) => row.length !== h.length)
          if (uneven) {
            setParseNote(
              'Certaines lignes avaient moins de colonnes que l’en-tête ; elles ont été complétées comme vides.'
            )
          }
          const { rows: clean, rawExtractedCount } = extractCleanRows(r, cols)
          setSkippedCount(Math.max(0, r.length - rawExtractedCount))

          setAggregatedRows((prev) => {
            if (!cumulative || prev.length === 0) {
              return clean
            }
            const map = new Map()
            mergeIntoMap(map, prev)
            mergeIntoMap(map, clean)
            return Array.from(map.values())
          })
          setImportedFiles((prev) => {
            const label = `${file.name} (${clean.length} ligne${clean.length > 1 ? 's' : ''} après fusion)`
            if (!cumulative) return [label]
            return [...prev, label]
          })
        } catch (err) {
          console.error(err)
          setError('Impossible de lire ce fichier.')
        } finally {
          if (fileInputRef.current) fileInputRef.current.value = ''
        }
      }
      reader.onerror = () => setError('Erreur de lecture du fichier.')
      reader.readAsText(file, 'UTF-8')
    },
    [cumulative]
  )

  const resetAll = useCallback(() => {
    setAggregatedRows([])
    setImportedFiles([])
    setLastFileName('')
    setError('')
    setParseNote('')
    setSkippedCount(0)
    setManualFicheByRow({})
    setSaveMessage('')
    setVenteJour(defaultYesterdayIso())
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [])

  const maxPreview = 200
  const previewRows = aggregatedRows.slice(0, maxPreview)

  const totalMontantImport = useMemo(
    () => aggregatedRows.reduce((sum, r) => sum + (Number.isFinite(r.montant) ? r.montant : 0), 0),
    [aggregatedRows]
  )

  const selectStyle = {
    width: '100%',
    maxWidth: 280,
    padding: '8px 10px',
    borderRadius: 8,
    border: `1px solid ${c.bordure}`,
    background: c.blanc,
    color: c.texte,
    fontSize: 12,
    cursor: 'pointer',
  }

  const tdNumCellStyle = {
    padding: '8px 12px',
    borderBottom: `1px solid ${c.bordure}`,
    textAlign: 'right',
    fontVariantNumeric: 'tabular-nums',
  }

  return (
    <div
      style={{
        border: `1px solid ${c.bordure}`,
        borderRadius: 12,
        padding: 20,
        background: c.blanc,
      }}
    >
      <h2 style={{ margin: '0 0 12px', fontSize: 18, color: c.texte }}>
        Importer des ventes (CSV)
      </h2>
      <p style={{ margin: '0 0 16px', fontSize: 14, color: c.texteMuted }}>
        Export Lightspeed « product breakdown » : nettoyage automatique et aperçu des colonnes utiles. Vous pouvez enchaîner
        plusieurs fichiers (ex. Bar puis Restaurant) pour cumuler les quantités et montants.
      </p>

      <div
        style={{
          marginBottom: 20,
          padding: 14,
          borderRadius: 10,
          border: `1px solid ${c.bordure}`,
          background: c.fond,
        }}
      >
        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: c.texte, marginBottom: 8 }}>
          Jour des ventes
        </label>
        <input
          type="date"
          value={venteJour}
          onChange={(ev) => setVenteJour(ev.target.value)}
          style={{
            padding: '10px 12px',
            borderRadius: 8,
            border: `1px solid ${c.bordure}`,
            background: c.blanc,
            color: c.texte,
            fontSize: 14,
          }}
        />
        <p style={{ margin: '8px 0 0', fontSize: 12, color: c.texteMuted }}>
          Utilisé pour l’enregistrement futur en base (une date pour tout l’import en cours).
        </p>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginBottom: 16 }}>
        <label
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 14,
            color: c.texte,
            cursor: 'pointer',
            userSelect: 'none',
          }}
        >
          <input
            type="checkbox"
            checked={cumulative}
            onChange={(ev) => setCumulative(ev.target.checked)}
          />
          Cumul des imports (fusionner avec les données déjà chargées)
        </label>
        <button
          type="button"
          onClick={resetAll}
          style={{
            padding: '8px 14px',
            borderRadius: 8,
            fontSize: 13,
            cursor: 'pointer',
            border: `1px solid ${c.bordure}`,
            background: c.fond,
            color: c.texte,
          }}
        >
          Réinitialiser
        </button>
      </div>

      <label
        style={{
          display: 'inline-block',
          padding: '10px 16px',
          borderRadius: 8,
          background: c.accentClair,
          color: c.accent,
          fontWeight: 600,
          fontSize: 14,
          cursor: 'pointer',
          border: `1px solid ${c.bordure}`,
        }}
      >
        Choisir un fichier CSV
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          onChange={onFile}
          style={{ display: 'none' }}
        />
      </label>
      {lastFileName ? (
        <span style={{ marginLeft: 12, fontSize: 14, color: c.texteMuted }}>Dernier fichier : {lastFileName}</span>
      ) : null}

      {error ? (
        <p style={{ marginTop: 12, color: c.rouge, fontSize: 14 }}>{error}</p>
      ) : null}
      {parseNote ? (
        <p style={{ marginTop: 12, color: c.orange, fontSize: 14 }}>{parseNote}</p>
      ) : null}
      {fichesLoadError ? (
        <p style={{ marginTop: 8, color: c.orange, fontSize: 13 }}>Fiches : {fichesLoadError}</p>
      ) : null}
      {skippedCount > 0 && !error ? (
        <p style={{ marginTop: 8, fontSize: 13, color: c.texteMuted }}>
          {skippedCount} ligne{skippedCount > 1 ? 's' : ''} ignorée{skippedCount > 1 ? 's' : ''} (pas de quantité
          numérique, titre de section « … - … », ou SKU vide).
        </p>
      ) : null}
      {importedFiles.length > 0 ? (
        <ul style={{ margin: '12px 0 0', paddingLeft: 18, fontSize: 13, color: c.texteMuted }}>
          {importedFiles.map((f, i) => (
            <li key={`${f}-${i}`}>{f}</li>
          ))}
        </ul>
      ) : null}

      {aggregatedRows.length > 0 ? (
        <div style={{ marginTop: 20, overflowX: 'auto' }}>
          <p style={{ margin: '0 0 8px', fontSize: 13, color: c.texteMuted }}>
            {aggregatedRows.length} ligne{aggregatedRows.length > 1 ? 's' : ''} après fusion (aperçu max. {maxPreview})
            {ficheOptions.length > 0
              ? ` · ${ficheOptions.length} fiche${ficheOptions.length > 1 ? 's' : ''} technique${ficheOptions.length > 1 ? 's' : ''} chargée${ficheOptions.length > 1 ? 's' : ''}`
              : ''}
          </p>
          <div
            style={{
              marginBottom: 14,
              padding: '12px 16px',
              borderRadius: 10,
              background: c.accentClair,
              border: `1px solid ${c.bordure}`,
            }}
          >
            <span style={{ fontSize: 14, fontWeight: 600, color: c.texte }}>
              Chiffre d&apos;affaires total importé :{' '}
              <span style={{ color: c.accent }}>{formatMoneyEUR(totalMontantImport)}</span> HT
            </span>
          </div>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: 13,
              color: c.texte,
            }}
          >
            <thead>
              <tr style={{ background: c.fond }}>
                {PREVIEW_KEYS.map((key) => (
                  <th
                    key={key}
                    style={{
                      textAlign: NUMERIC_RIGHT_KEYS.has(key) ? 'right' : 'left',
                      padding: '10px 12px',
                      borderBottom: `2px solid ${c.bordure}`,
                      whiteSpace: 'nowrap',
                      fontWeight: 600,
                      minWidth: key === 'fiche' ? 200 : undefined,
                    }}
                  >
                    {PREVIEW_LABELS[key]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {previewRows.map((row, ri) => {
                const rk = stableRowKey(row)
                const sug = suggestionsByRow[rk]
                const selected = effectiveFicheKey(rk)
                const isManual = Object.prototype.hasOwnProperty.call(manualFicheByRow, rk)
                const autoKey = sug && sug.score >= FUZZY_SUGGEST_MIN ? sug.key : ''
                const puht = row.quantite > 0 ? row.montant / row.quantite : NaN
                const tvaCell = (row.tauxTvaDisplay || '').trim() || '—'
                return (
                  <tr key={rk} style={{ background: ri % 2 === 0 ? c.blanc : c.fond }}>
                    <td
                      style={{
                        padding: '8px 12px',
                        borderBottom: `1px solid ${c.bordure}`,
                        maxWidth: 280,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                      title={row.designation}
                    >
                      {row.designation}
                    </td>
                    <td
                      style={{
                        padding: '8px 12px',
                        borderBottom: `1px solid ${c.bordure}`,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {row.sku}
                    </td>
                    <td style={tdNumCellStyle}>{formatPrettyNumber(row.quantite)}</td>
                    <td style={tdNumCellStyle}>{formatMoneyEUR(row.montant)}</td>
                    <td style={tdNumCellStyle}>{formatMoneyEUR(puht)}</td>
                    <td style={tdNumCellStyle}>{tvaCell}</td>
                    <td style={{ padding: '8px 12px', borderBottom: `1px solid ${c.bordure}`, verticalAlign: 'middle' }}>
                      <select
                        value={selected}
                        onChange={(ev) => setAssociation(rk, ev.target.value)}
                        style={selectStyle}
                        aria-label={`Association fiche pour ${row.designation}`}
                      >
                        <option value="">— Non associé —</option>
                        {ficheOptions.map((opt) => (
                          <option key={opt.key} value={opt.key}>
                            {opt.source === 'fiches_bar' ? `Bar — ${opt.nom}` : `Cuisine — ${opt.nom}`}
                          </option>
                        ))}
                      </select>
                      {sug && !isManual && autoKey && selected === autoKey ? (
                        <span style={{ display: 'block', marginTop: 4, fontSize: 11, color: c.vert }}>
                          {sug.fromMapping ? 'Correspondance mémorisée' : `Suggestion auto (${Math.round(sug.score * 100)} %)`}
                        </span>
                      ) : null}
                      {isManual && sug ? (
                        <span style={{ display: 'block', marginTop: 4, fontSize: 11, color: c.texteMuted }}>
                          Suggéré : {sug.nom} ({Math.round(sug.score * 100)} %)
                        </span>
                      ) : null}
                      {!sug && !selected ? (
                        <span style={{ display: 'block', marginTop: 4, fontSize: 11, color: c.texteMuted }}>
                          Aucune suggestion fiable
                        </span>
                      ) : null}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          <div style={{ marginTop: 20, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
            <button
              type="button"
              disabled={saving || aggregatedRows.length === 0}
              onClick={handleConfirmSave}
              style={{
                padding: '12px 20px',
                borderRadius: 10,
                fontSize: 15,
                fontWeight: 600,
                cursor: saving || aggregatedRows.length === 0 ? 'not-allowed' : 'pointer',
                border: 'none',
                background: saving || aggregatedRows.length === 0 ? c.bordure : c.accent,
                color: saving || aggregatedRows.length === 0 ? c.texteMuted : c.blanc,
                opacity: saving || aggregatedRows.length === 0 ? 0.7 : 1,
              }}
            >
              {saving ? 'Enregistrement…' : 'Confirmer et enregistrer les ventes'}
            </button>
            <span style={{ fontSize: 13, color: c.texteMuted }}>
              Insère les lignes cuisine dans <code style={{ fontSize: 12 }}>ventes_journalieres</code> et mémorise les
              associations dans <code style={{ fontSize: 12 }}>mapping_ventes</code>.
            </span>
          </div>
          {saveMessage ? (
            <p style={{ marginTop: 12, fontSize: 14, color: c.vert, fontWeight: 500 }}>{saveMessage}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
