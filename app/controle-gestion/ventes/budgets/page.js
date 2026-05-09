'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import * as XLSX from 'xlsx'
import { supabase, getClientId } from '../../../../lib/supabase'
import { useIsMobile } from '../../../../lib/useIsMobile'
import { useTheme } from '../../../../lib/useTheme'
import Navbar from '../../../../components/Navbar'

const DEBUG_FALLBACK_CLIENT_ID = 'fa725e66-2cad-4ea4-892a-7eb3e90496a7'

const ANNEE_DEFAUT = 2026
const ANNEES_DISPO = (() => {
  const now = new Date().getFullYear()
  const years = new Set([ANNEE_DEFAUT])
  for (let y = now - 1; y <= now + 3; y++) years.add(y)
  return Array.from(years).sort((a, b) => a - b)
})()

const FOOD_RATIO = 0.65
const BEV_20_RATIO = 0.28
const BEV_10_RATIO = 0.07

const JOURS_SEMAINE = [
  { code: 1, label: 'Lundi', short: 'Lun' },
  { code: 2, label: 'Mardi', short: 'Mar' },
  { code: 3, label: 'Mercredi', short: 'Mer' },
  { code: 4, label: 'Jeudi', short: 'Jeu' },
  { code: 5, label: 'Vendredi', short: 'Ven' },
  { code: 6, label: 'Samedi', short: 'Sam' },
  { code: 7, label: 'Dimanche', short: 'Dim' },
]

const SERVICES = [
  { code: 'lunch', label: 'Déjeuner' },
  { code: 'dinner', label: 'Dîner' },
]

const MOIS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
const MOIS_LABEL = [
  '', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
]

const JOUR_PRESETS = [
  { code: 'mar-jeu', label: 'Mar-jeu', jours: [2, 3, 4] },
  { code: 'lun-ven', label: 'Lun-ven', jours: [1, 2, 3, 4, 5] },
  { code: 'ven-sam', label: 'Ven-sam', jours: [5, 6] },
  { code: 'all', label: 'Toute la semaine', jours: [1, 2, 3, 4, 5, 6, 7] },
]

/* ─── Helpers ─────────────────────────────────────────────────────────────── */

function round2(n) {
  return Math.round(Number(n || 0) * 100) / 100
}

function emptyCell() {
  return {
    id: null,
    couverts_cible: '',
    tm_cible: '', // UI-only ; la BDD ne stocke pas le TM (recalculé au load)
    ca_food_cible: '',
    ca_bev_20_cible: '',
    ca_bev_10_cible: '',
    ca_autre_cible: '',
  }
}

function deriveTm(cell) {
  const couv = Number(cell.couverts_cible || 0)
  if (!couv) return ''
  const ca =
    Number(cell.ca_food_cible || 0) +
    Number(cell.ca_bev_20_cible || 0) +
    Number(cell.ca_bev_10_cible || 0)
  return ca / couv
}

function totalCa(cell) {
  return (
    Number(cell.ca_food_cible || 0) +
    Number(cell.ca_bev_20_cible || 0) +
    Number(cell.ca_bev_10_cible || 0) +
    Number(cell.ca_autre_cible || 0)
  )
}

function hasAnyValue(cell) {
  return Number(cell.couverts_cible || 0) > 0 || totalCa(cell) > 0
}

// Recalcule food/bev/soft à partir de couv × tm × ratios fixes 65/28/7.
function recalcCa(cell) {
  const couv = Number(cell.couverts_cible || 0)
  const tm = Number(cell.tm_cible || 0)
  const ca = couv * tm
  return {
    ...cell,
    ca_food_cible: round2(ca * FOOD_RATIO),
    ca_bev_20_cible: round2(ca * BEV_20_RATIO),
    ca_bev_10_cible: round2(ca * BEV_10_RATIO),
    ca_autre_cible: 0,
  }
}

// Combien de fois `jds` (1=lundi … 7=dimanche, ISO) tombe dans `mois` de `annee`.
function joursDansMois(annee, mois, jdsTarget) {
  const lastDay = new Date(annee, mois, 0).getDate()
  let count = 0
  for (let d = 1; d <= lastDay; d++) {
    const date = new Date(annee, mois - 1, d)
    const dow = date.getDay() === 0 ? 7 : date.getDay()
    if (dow === jdsTarget) count++
  }
  return count
}

function formatEur(n) {
  if (n == null || isNaN(n) || Number(n) === 0) return '—'
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
}

function formatNum(n) {
  if (n == null || isNaN(n) || Number(n) === 0) return '—'
  return new Intl.NumberFormat('fr-FR').format(Math.round(n))
}

/* ─── Import Excel (inchangé) ─────────────────────────────────────────────── */

const MOIS_FR = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
]

const JOURS_FR_LOOKUP = {
  lundi: 1, mardi: 2, mercredi: 3, jeudi: 4, vendredi: 5, samedi: 6, dimanche: 7,
}

function normalizeStr(s) {
  return (s == null ? '' : String(s)).trim().toLowerCase()
}

function findMonthIdx(s) {
  const n = normalizeStr(s)
  return MOIS_FR.findIndex((m) => n.startsWith(m))
}

function findJourSemaine(s) {
  const n = normalizeStr(s)
  for (const [k, v] of Object.entries(JOURS_FR_LOOKUP)) {
    if (n.startsWith(k)) return v
  }
  return null
}

function buildBudgetRow(section, mois, jourSemaine, service, couverts, tm) {
  const ca = (Number(couverts) || 0) * (Number(tm) || 0)
  return {
    section,
    mois,
    jour_semaine: jourSemaine,
    service,
    couverts_cible: Number(couverts) || 0,
    ca_food_cible: round2(ca * FOOD_RATIO),
    ca_bev_20_cible: round2(ca * BEV_20_RATIO),
    ca_bev_10_cible: round2(ca * BEV_10_RATIO),
    ca_autre_cible: 0,
  }
}

async function parseExcelBudget(file) {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array' })
  const sheetName =
    wb.SheetNames.find((n) => normalizeStr(n).includes('synthèse')) || wb.SheetNames[0]
  const sheet = wb.Sheets[sheetName]
  if (!sheet) throw new Error('Feuille introuvable')

  const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null })

  const sections = []
  for (let r = 0; r < aoa.length; r++) {
    const row = aoa[r] || []
    for (let c = 0; c < row.length; c++) {
      const v = normalizeStr(row[c])
      if (!v.includes('déjeuner')) continue
      if (v.includes('salle') && v.includes('manger')) {
        sections.push({ name: 'Salle à manger', headerRow: r, lunchCol: c })
      } else if (v.includes('table') && v.includes('partage')) {
        sections.push({ name: 'Table de partage', headerRow: r, lunchCol: c })
      }
    }
  }

  if (sections.length === 0) {
    throw new Error('Aucune section reconnue (Salle à manger / Table de partage)')
  }

  const parsed = []
  for (const sec of sections) {
    let r = sec.headerRow + 3
    let monthsParsed = 0
    while (monthsParsed < 12 && r < aoa.length) {
      const row = aoa[r] || []
      const monthIdx = findMonthIdx(row[0])
      if (monthIdx >= 0) {
        const mois = monthIdx + 1
        for (let dr = r + 1; dr <= r + 5; dr++) {
          const drow = aoa[dr] || []
          const jourSemaine = findJourSemaine(drow[0])
          if (!jourSemaine) continue

          const couvL = Number(drow[sec.lunchCol + 1]) || 0
          const tmL = Number(drow[sec.lunchCol + 3]) || 0
          parsed.push(buildBudgetRow(sec.name, mois, jourSemaine, 'lunch', couvL, tmL))

          const couvD = Number(drow[sec.lunchCol + 7]) || 0
          const tmD = Number(drow[sec.lunchCol + 9]) || 0
          parsed.push(buildBudgetRow(sec.name, mois, jourSemaine, 'dinner', couvD, tmD))
        }
        r += 7
        monthsParsed++
      } else {
        r++
      }
    }
  }

  return parsed
}

/* ─── Page principale ────────────────────────────────────────────────────── */

export default function BudgetsPage() {
  const router = useRouter()
  const { c } = useTheme()
  const isMobile = useIsMobile()

  const [clientId, setClientId] = useState(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [annee, setAnnee] = useState(ANNEE_DEFAUT)
  const [lieuFilter, setLieuFilter] = useState(null)
  const [lieux, setLieux] = useState([])
  // budgets[mois][`${jds}_${lieuId}_${service}`] = cell ; mois ∈ [1..12]
  const [budgets, setBudgets] = useState({})
  const [raison, setRaison] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [okMsg, setOkMsg] = useState('')
  const [saving, setSaving] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [wizardOpen, setWizardOpen] = useState(false)
  const [resetConfirm, setResetConfirm] = useState(null) // 'lieu' | null
  const [importPreview, setImportPreview] = useState(null)
  const fileInputRef = useRef(null)

  useEffect(() => {
    let cancel = false
    ;(async () => {
      const { data: sessionData } = await supabase.auth.getSession()
      if (cancel) return
      if (!sessionData?.session) {
        router.replace('/')
        return
      }
      let cid = await getClientId()
      if (!cid) {
        console.warn('getClientId vide — fallback debug:', DEBUG_FALLBACK_CLIENT_ID)
        cid = DEBUG_FALLBACK_CLIENT_ID
      }
      if (cancel) return
      setClientId(cid)
      setAuthChecked(true)
    })()
    return () => {
      cancel = true
    }
  }, [router])

  const loadData = useCallback(async () => {
    if (!clientId) return
    setLoading(true)
    setError('')
    setOkMsg('')
    try {
      const [lieuxRes, budgetsRes] = await Promise.all([
        supabase
          .from('lieux_service')
          .select('id, nom, ordre, actif')
          .eq('client_id', clientId)
          .eq('actif', true)
          .order('ordre')
          .order('nom'),
        supabase
          .from('ca_budgets')
          .select(
            'id, mois, jour_semaine, lieu_service_id, service, couverts_cible, ca_food_cible, ca_bev_20_cible, ca_bev_10_cible, ca_autre_cible'
          )
          .eq('client_id', clientId)
          .not('mois', 'is', null),
      ])
      if (lieuxRes.error) throw lieuxRes.error
      if (budgetsRes.error) throw budgetsRes.error

      setLieux(lieuxRes.data || [])

      const idx = {}
      for (const m of MOIS) idx[m] = {}
      ;(budgetsRes.data || []).forEach((b) => {
        if (b.mois == null) return
        const cell = {
          id: b.id,
          couverts_cible: b.couverts_cible ?? '',
          ca_food_cible: b.ca_food_cible ?? 0,
          ca_bev_20_cible: b.ca_bev_20_cible ?? 0,
          ca_bev_10_cible: b.ca_bev_10_cible ?? 0,
          ca_autre_cible: b.ca_autre_cible ?? 0,
        }
        cell.tm_cible = deriveTm(cell)
        idx[b.mois][`${b.jour_semaine}_${b.lieu_service_id}_${b.service}`] = cell
      })
      setBudgets(idx)
    } catch (e) {
      setError(e.message || 'Erreur de chargement')
    } finally {
      setLoading(false)
    }
  }, [clientId])

  useEffect(() => {
    if (authChecked) loadData()
  }, [authChecked, loadData])

  useEffect(() => {
    if (lieux.length === 0) return
    if (lieuFilter == null || !lieux.find((l) => l.id === lieuFilter)) {
      setLieuFilter(lieux[0].id)
    }
  }, [lieux, lieuFilter])

  const updateCell = useCallback((mois, jds, lieuId, service, field, value) => {
    setBudgets((prev) => {
      const next = { ...prev }
      const moisMap = { ...(prev[mois] || {}) }
      const key = `${jds}_${lieuId}_${service}`
      const current = moisMap[key] || emptyCell()
      const updated = recalcCa({ ...current, [field]: value })
      moisMap[key] = updated
      next[mois] = moisMap
      return next
    })
  }, [])

  // Copie les valeurs Couv/TM d'un mois source vers un ou plusieurs mois cibles.
  const duplicateMois = useCallback((moisSource, moisCibles) => {
    setBudgets((prev) => {
      const next = { ...prev }
      const src = prev[moisSource] || {}
      for (const mc of moisCibles) {
        const dst = { ...(prev[mc] || {}) }
        for (const key of Object.keys(src)) {
          const srcCell = src[key]
          if (!hasAnyValue(srcCell)) continue
          const existing = dst[key] || emptyCell()
          dst[key] = recalcCa({
            ...existing,
            couverts_cible: srcCell.couverts_cible,
            tm_cible: srcCell.tm_cible,
          })
        }
        next[mc] = dst
      }
      return next
    })
  }, [])

  // Wizard : applique Couv/TM à 1 lieu × N jours × les services renseignés × tous les mois choisis.
  const applyWizard = useCallback((lieuId, joursList, servicesData, moisCibles) => {
    setBudgets((prev) => {
      const next = { ...prev }
      for (const m of moisCibles) {
        const moisMap = { ...(prev[m] || {}) }
        for (const jds of joursList) {
          for (const svcCode of Object.keys(servicesData)) {
            const data = servicesData[svcCode]
            if (!data) continue
            const key = `${jds}_${lieuId}_${svcCode}`
            const existing = moisMap[key] || emptyCell()
            moisMap[key] = recalcCa({
              ...existing,
              couverts_cible: data.couverts_cible,
              tm_cible: data.tm_cible,
            })
          }
        }
        next[m] = moisMap
      }
      return next
    })
    setLieuFilter(lieuId)
  }, [])

  const handleSave = useCallback(async () => {
    if (!clientId) return
    setSaving(true)
    setError('')
    setOkMsg('')
    try {
      const rows = []
      for (const m of MOIS) {
        const moisMap = budgets[m] || {}
        for (const j of JOURS_SEMAINE) {
          for (const lieu of lieux) {
            for (const svc of SERVICES) {
              const cell = moisMap[`${j.code}_${lieu.id}_${svc.code}`]
              if (!cell || !hasAnyValue(cell)) continue
              rows.push({
                client_id: clientId,
                mois: m,
                jour_semaine: j.code,
                lieu_service_id: lieu.id,
                service: svc.code,
                couverts_cible: Number(cell.couverts_cible || 0),
                ca_food_cible: Number(cell.ca_food_cible || 0),
                ca_bev_20_cible: Number(cell.ca_bev_20_cible || 0),
                ca_bev_10_cible: Number(cell.ca_bev_10_cible || 0),
                ca_autre_cible: Number(cell.ca_autre_cible || 0),
                raison_modification: raison.trim() || null,
              })
            }
          }
        }
      }
      if (rows.length === 0) {
        setOkMsg('Rien à enregistrer.')
        return
      }
      const { error: upErr } = await supabase
        .from('ca_budgets')
        .upsert(rows, { onConflict: 'client_id,mois,jour_semaine,lieu_service_id,service' })
      if (upErr) throw upErr
      setOkMsg(`Enregistré (${rows.length} lignes).`)
      setRaison('')
      await loadData()
    } catch (e) {
      setError(e.message || "Erreur d'enregistrement")
    } finally {
      setSaving(false)
    }
  }, [clientId, lieux, budgets, raison, loadData])

  // Vide tous les budgets du lieu sélectionné (12 mois × 7 jours × 2 svcs).
  // Le trigger d'audit log les DELETE.
  const handleResetLieu = useCallback(async () => {
    if (!clientId || !lieuFilter) return
    setSaving(true)
    setError('')
    setOkMsg('')
    try {
      const { error: delErr } = await supabase
        .from('ca_budgets')
        .delete()
        .eq('client_id', clientId)
        .eq('lieu_service_id', lieuFilter)
        .not('mois', 'is', null)
      if (delErr) throw delErr
      setOkMsg('Budgets du lieu remis à zéro.')
      setResetConfirm(null)
      await loadData()
    } catch (e) {
      setError(e.message || 'Erreur de suppression')
    } finally {
      setSaving(false)
    }
  }, [clientId, lieuFilter, loadData])

  const handleFileChange = useCallback(async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setError('')
    setOkMsg('')
    try {
      const parsed = await parseExcelBudget(file)
      if (parsed.length === 0) {
        throw new Error('Aucune donnée extraite du fichier.')
      }
      const sectionNames = [...new Set(parsed.map((r) => r.section))]
      const existingNames = lieux.map((l) => l.nom)
      const lieuxToCreate = sectionNames.filter((n) => !existingNames.includes(n))
      setImportPreview({ rows: parsed, sectionNames, lieuxToCreate })
    } catch (err) {
      setError(`Erreur d'import : ${err.message}`)
    }
  }, [lieux])

  const confirmImport = useCallback(async () => {
    if (!importPreview || !clientId) return
    setSaving(true)
    setError('')
    setOkMsg('')
    try {
      const updatedLieux = [...lieux]
      for (const nom of importPreview.lieuxToCreate) {
        const { data, error: insErr } = await supabase
          .from('lieux_service')
          .insert({ client_id: clientId, nom, ordre: updatedLieux.length })
          .select('id, nom, ordre, actif')
          .single()
        if (insErr) throw insErr
        updatedLieux.push(data)
      }
      const idByName = new Map(updatedLieux.map((l) => [l.nom, l.id]))
      const rowsToUpsert = []
      for (const r of importPreview.rows) {
        const lieuId = idByName.get(r.section)
        if (!lieuId) continue
        rowsToUpsert.push({
          client_id: clientId,
          mois: r.mois,
          jour_semaine: r.jour_semaine,
          lieu_service_id: lieuId,
          service: r.service,
          couverts_cible: r.couverts_cible,
          ca_food_cible: r.ca_food_cible,
          ca_bev_20_cible: r.ca_bev_20_cible,
          ca_bev_10_cible: r.ca_bev_10_cible,
          ca_autre_cible: r.ca_autre_cible,
          raison_modification: 'Import Excel Budget 2026',
        })
      }
      const { error: upErr } = await supabase
        .from('ca_budgets')
        .upsert(rowsToUpsert, { onConflict: 'client_id,mois,jour_semaine,lieu_service_id,service' })
      if (upErr) throw upErr
      setOkMsg(`Import terminé : ${rowsToUpsert.length} lignes importées.`)
      setImportPreview(null)
      await loadData()
    } catch (e) {
      setError(`Erreur d'import : ${e.message}`)
    } finally {
      setSaving(false)
    }
  }, [importPreview, clientId, lieux, loadData])

  // KPI annuels pour le lieu sélectionné
  const totauxAnnee = useMemo(() => {
    const t = { couverts: 0, ca: 0 }
    if (!lieuFilter) return t
    for (const m of MOIS) {
      const moisMap = budgets[m] || {}
      for (const j of JOURS_SEMAINE) {
        for (const svc of SERVICES) {
          const cell = moisMap[`${j.code}_${lieuFilter}_${svc.code}`]
          if (!cell) continue
          const nbre = joursDansMois(annee, m, j.code)
          const couvJ = Number(cell.couverts_cible || 0)
          const tm = Number(cell.tm_cible || 0)
          t.couverts += nbre * couvJ
          t.ca += nbre * couvJ * tm
        }
      }
    }
    return t
  }, [lieuFilter, budgets, annee])

  if (!authChecked) return null

  const selectedLieu = lieux.find((l) => l.id === lieuFilter)

  return (
    <div style={{ minHeight: '100vh', background: c.fond }}>
      <Navbar section="cuisine" />
      <div style={{ padding: isMobile ? 16 : 24, maxWidth: 1400, margin: '0 auto' }}>
        <div style={{ marginBottom: 16 }}>
          <Link
            href="/controle-gestion/ventes"
            style={{
              fontSize: 13,
              color: c.texteMuted,
              textDecoration: 'none',
              marginBottom: 8,
              display: 'inline-block',
            }}
          >
            ← Vue mensuelle
          </Link>
          <h1 style={{ margin: '0 0 4px', fontSize: isMobile ? 22 : 26, fontWeight: 600, color: c.texte }}>
            Budgets de CA — {annee}
          </h1>
          <p style={{ margin: 0, fontSize: 14, color: c.texteMuted }}>
            Saisie type Excel : tu remplis Couv/J et TM ; le reste se calcule (Cvts total, Total, ratios Food/Bev). Chaque modification est tracée.
          </p>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls"
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />

        {!loading && lieux.length > 0 && (
          <TopBar
            lieux={lieux}
            lieuFilter={lieuFilter}
            setLieuFilter={setLieuFilter}
            annee={annee}
            setAnnee={setAnnee}
            onOpenWizard={() => setWizardOpen(true)}
            onClickImport={() => fileInputRef.current?.click()}
            onOpenHistory={() => setHistoryOpen(true)}
            onReset={() => setResetConfirm('lieu')}
            onSave={handleSave}
            saving={saving}
            c={c}
            isMobile={isMobile}
          />
        )}

        {error && <p style={{ color: '#B91C1C', fontSize: 14, marginBottom: 16 }}>{error}</p>}
        {okMsg && <p style={{ color: '#15803D', fontSize: 14, marginBottom: 16 }}>{okMsg}</p>}

        {loading && <p style={{ color: c.texteMuted, fontSize: 14 }}>Chargement…</p>}

        {!loading && lieux.length === 0 && (
          <div
            style={{
              background: c.blanc,
              borderRadius: 12,
              border: `0.5px solid ${c.bordure}`,
              padding: 24,
              textAlign: 'center',
            }}
          >
            <p style={{ margin: 0, fontSize: 14, color: c.texteMuted }}>
              Configure d&apos;abord tes lieux de service dans la{' '}
              <Link href="/controle-gestion/ventes/saisie" style={{ color: c.texte }}>
                page de saisie
              </Link>
              .
            </p>
          </div>
        )}

        {!loading && selectedLieu && (
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1fr) 220px', gap: 16, alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
              {MOIS.map((m) => (
                <MoisTable
                  key={m}
                  mois={m}
                  annee={annee}
                  lieu={selectedLieu}
                  moisMap={budgets[m] || {}}
                  updateCell={updateCell}
                  onDuplicateNext={() => duplicateMois(m, [m + 1])}
                  onDuplicateAllAfter={() => duplicateMois(m, MOIS.filter((x) => x > m))}
                  c={c}
                  isMobile={isMobile}
                />
              ))}

              <div
                style={{
                  padding: 16,
                  background: c.blanc,
                  borderRadius: 12,
                  border: `0.5px solid ${c.bordure}`,
                  display: 'grid',
                  gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(3, 1fr)',
                  gap: 12,
                }}
              >
                <KPI label={`Couverts/an (${selectedLieu.nom})`} value={formatNum(totauxAnnee.couverts)} c={c} />
                <KPI label={`CA/an (${selectedLieu.nom})`} value={formatEur(totauxAnnee.ca)} c={c} />
                <KPI
                  label="TM moyen"
                  value={totauxAnnee.couverts ? formatEur(totauxAnnee.ca / totauxAnnee.couverts) : '—'}
                  c={c}
                />
              </div>

              <div
                style={{
                  padding: 16,
                  background: c.blanc,
                  borderRadius: 12,
                  border: `0.5px solid ${c.bordure}`,
                }}
              >
                <label style={{ fontSize: 13, color: c.texte, display: 'block', marginBottom: 8 }}>
                  Raison de la modification (facultatif)
                </label>
                <input
                  type="text"
                  value={raison}
                  onChange={(e) => setRaison(e.target.value)}
                  placeholder="Ex : ajustement TM samedi suite à la nouvelle carte"
                  style={{
                    padding: '9px 14px',
                    borderRadius: 8,
                    fontSize: 13,
                    border: `1px solid ${c.bordure}`,
                    background: c.blanc,
                    color: c.texte,
                    outline: 'none',
                    width: '100%',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            </div>

            {!isMobile && (
              <SommaireSticky
                budgets={budgets}
                lieuId={lieuFilter}
                annee={annee}
                c={c}
              />
            )}
          </div>
        )}
      </div>

      {historyOpen && (
        <HistoryModal clientId={clientId} onClose={() => setHistoryOpen(false)} c={c} isMobile={isMobile} />
      )}

      {importPreview && (
        <ImportPreviewModal
          preview={importPreview}
          onCancel={() => setImportPreview(null)}
          onConfirm={confirmImport}
          saving={saving}
          c={c}
        />
      )}

      {wizardOpen && (
        <WizardModal
          lieux={lieux}
          initialLieuId={lieuFilter}
          onApply={applyWizard}
          onClose={() => setWizardOpen(false)}
          c={c}
          isMobile={isMobile}
        />
      )}

      {resetConfirm === 'lieu' && selectedLieu && (
        <ConfirmModal
          title="Remettre à zéro ?"
          body={
            <>
              Cette action <strong>supprime tous les budgets</strong> du lieu{' '}
              <strong>{selectedLieu.nom}</strong> (12 mois × 7 jours × 2 services).
              Les autres lieux ne sont pas touchés. La suppression est tracée dans l&apos;historique
              et peut être consultée à tout moment.
            </>
          }
          confirmLabel="Oui, supprimer"
          danger
          saving={saving}
          onCancel={() => setResetConfirm(null)}
          onConfirm={handleResetLieu}
          c={c}
        />
      )}
    </div>
  )
}

/* ─── TopBar ─────────────────────────────────────────────────────────────── */

function TopBar({
  lieux,
  lieuFilter,
  setLieuFilter,
  annee,
  setAnnee,
  onOpenWizard,
  onClickImport,
  onOpenHistory,
  onReset,
  onSave,
  saving,
  c,
  isMobile,
}) {
  return (
    <div
      style={{
        background: c.blanc,
        borderRadius: 12,
        border: `0.5px solid ${c.bordure}`,
        padding: 12,
        marginBottom: 16,
        display: 'flex',
        flexDirection: isMobile ? 'column' : 'row',
        gap: 10,
        alignItems: isMobile ? 'stretch' : 'center',
        flexWrap: 'wrap',
      }}
    >
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: c.texteMuted }}>
        Lieu de service
        <select
          value={lieuFilter || ''}
          onChange={(e) => setLieuFilter(e.target.value || null)}
          style={{
            padding: '7px 10px',
            borderRadius: 8,
            border: `1px solid ${c.bordure}`,
            background: c.blanc,
            color: c.texte,
            fontSize: 13,
            minWidth: 200,
          }}
        >
          {lieux.map((l) => (
            <option key={l.id} value={l.id}>
              {l.nom}
            </option>
          ))}
        </select>
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: c.texteMuted }}>
        Année
        <select
          value={annee}
          onChange={(e) => setAnnee(Number(e.target.value))}
          style={{
            padding: '7px 10px',
            borderRadius: 8,
            border: `1px solid ${c.bordure}`,
            background: c.blanc,
            color: c.texte,
            fontSize: 13,
            minWidth: 90,
          }}
        >
          {ANNEES_DISPO.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </label>
      <div style={{ flex: 1 }} />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button
          onClick={onOpenWizard}
          style={{
            padding: '8px 14px',
            borderRadius: 8,
            fontSize: 13,
            border: `1px solid ${c.bordure}`,
            background: c.blanc,
            color: c.texte,
            cursor: 'pointer',
          }}
        >
          ✨ Saisie guidée
        </button>
        <button
          onClick={onClickImport}
          style={{
            padding: '8px 14px',
            borderRadius: 8,
            fontSize: 13,
            border: `1px solid ${c.bordure}`,
            background: c.blanc,
            color: c.texte,
            cursor: 'pointer',
          }}
        >
          Importer Excel
        </button>
        <button
          onClick={onOpenHistory}
          style={{
            padding: '8px 14px',
            borderRadius: 8,
            fontSize: 13,
            border: `1px solid ${c.bordure}`,
            background: c.blanc,
            color: c.texte,
            cursor: 'pointer',
          }}
        >
          Historique
        </button>
        <button
          onClick={onReset}
          style={{
            padding: '8px 14px',
            borderRadius: 8,
            fontSize: 13,
            border: '1px solid #FCA5A5',
            background: '#FEF2F2',
            color: '#B91C1C',
            cursor: 'pointer',
          }}
          title="Supprime tous les budgets du lieu sélectionné (12 mois × 7 jours × 2 services)"
        >
          🗑 Remettre à zéro
        </button>
        <button
          onClick={onSave}
          disabled={saving}
          style={{
            padding: '10px 20px',
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 600,
            border: 'none',
            background: c.accent,
            color: c.texte,
            cursor: saving ? 'not-allowed' : 'pointer',
            opacity: saving ? 0.5 : 1,
            marginLeft: isMobile ? 0 : 4,
          }}
        >
          {saving ? 'Enregistrement…' : '💾 Enregistrer'}
        </button>
      </div>
    </div>
  )
}

/* ─── MoisTable : tableau Excel-like d'un mois ───────────────────────────── */

function MoisTable({ mois, annee, lieu, moisMap, updateCell, onDuplicateNext, onDuplicateAllAfter, c, isMobile }) {
  const sectionId = `mois-${mois}`

  // Totaux mensuels par service
  const totals = useMemo(() => {
    const t = {
      lunch: { nbre: 0, cvts: 0, ca: 0 },
      dinner: { nbre: 0, cvts: 0, ca: 0 },
    }
    for (const j of JOURS_SEMAINE) {
      const nbre = joursDansMois(annee, mois, j.code)
      for (const svc of SERVICES) {
        const cell = moisMap[`${j.code}_${lieu.id}_${svc.code}`]
        if (!cell) continue
        const couvJ = Number(cell.couverts_cible || 0)
        const tm = Number(cell.tm_cible || 0)
        if (couvJ > 0) t[svc.code].nbre += nbre
        t[svc.code].cvts += nbre * couvJ
        t[svc.code].ca += nbre * couvJ * tm
      }
    }
    return t
  }, [mois, annee, lieu.id, moisMap])

  if (isMobile) {
    return (
      <MoisCardsMobile
        mois={mois}
        annee={annee}
        lieu={lieu}
        moisMap={moisMap}
        updateCell={updateCell}
        onDuplicateNext={onDuplicateNext}
        onDuplicateAllAfter={onDuplicateAllAfter}
        sectionId={sectionId}
        totals={totals}
        c={c}
      />
    )
  }

  return (
    <div
      id={sectionId}
      style={{
        background: c.blanc,
        borderRadius: 12,
        border: `0.5px solid ${c.bordure}`,
        overflow: 'hidden',
        scrollMarginTop: 80,
      }}
    >
      {/* Header mois */}
      <div
        style={{
          padding: '10px 16px',
          borderBottom: `1px solid ${c.bordure}`,
          background: c.fond,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 600, color: c.texte }}>
          {MOIS_LABEL[mois]} {annee}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {mois < 12 && (
            <button
              onClick={onDuplicateNext}
              style={{
                padding: '5px 10px',
                borderRadius: 6,
                fontSize: 11,
                border: `1px solid ${c.bordure}`,
                background: c.blanc,
                color: c.texte,
                cursor: 'pointer',
              }}
              title={`Copie les valeurs vers ${MOIS_LABEL[mois + 1]}`}
            >
              → {MOIS_LABEL[mois + 1].slice(0, 3)}.
            </button>
          )}
          {mois < 12 && (
            <button
              onClick={onDuplicateAllAfter}
              style={{
                padding: '5px 10px',
                borderRadius: 6,
                fontSize: 11,
                border: `1px solid ${c.bordure}`,
                background: c.blanc,
                color: c.texte,
                cursor: 'pointer',
              }}
              title={`Copie les valeurs vers tous les mois suivants`}
            >
              → tous les suivants
            </button>
          )}
        </div>
      </div>

      {/* Tableau */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: c.fond }}>
              <th
                rowSpan={2}
                style={{
                  textAlign: 'left',
                  padding: '8px 10px',
                  borderBottom: `1px solid ${c.bordure}`,
                  borderRight: `1px solid ${c.bordure}`,
                  color: c.texteMuted,
                  fontWeight: 600,
                  fontSize: 11,
                  textTransform: 'uppercase',
                  letterSpacing: 0.4,
                  width: 100,
                  verticalAlign: 'middle',
                }}
              >
                Jour
              </th>
              <th
                colSpan={5}
                style={{
                  textAlign: 'center',
                  padding: '6px 10px',
                  borderBottom: `1px solid ${c.bordure}`,
                  borderRight: `1px solid ${c.bordure}`,
                  color: c.texte,
                  fontWeight: 600,
                  fontSize: 12,
                }}
              >
                Déjeuner
              </th>
              <th
                colSpan={5}
                style={{
                  textAlign: 'center',
                  padding: '6px 10px',
                  borderBottom: `1px solid ${c.bordure}`,
                  color: c.texte,
                  fontWeight: 600,
                  fontSize: 12,
                }}
              >
                Dîner
              </th>
            </tr>
            <tr style={{ background: c.fond }}>
              {SERVICES.map((svc, idx) => (
                <ColumnHeaders key={svc.code} c={c} isLast={idx === SERVICES.length - 1} />
              ))}
            </tr>
          </thead>
          <tbody>
            {JOURS_SEMAINE.map((j) => {
              const nbre = joursDansMois(annee, mois, j.code)
              return (
                <tr key={j.code} style={{ borderTop: `0.5px solid ${c.bordure}` }}>
                  <td
                    style={{
                      padding: '6px 10px',
                      borderRight: `1px solid ${c.bordure}`,
                      color: c.texte,
                      fontWeight: 500,
                    }}
                  >
                    {j.label}
                  </td>
                  {SERVICES.map((svc, idx) => {
                    const cell = moisMap[`${j.code}_${lieu.id}_${svc.code}`] || emptyCell()
                    const couvJ = Number(cell.couverts_cible || 0)
                    const tm = Number(cell.tm_cible || 0)
                    const cvts = nbre * couvJ
                    const total = cvts * tm
                    return (
                      <ServiceCells
                        key={svc.code}
                        nbre={nbre}
                        cell={cell}
                        cvts={cvts}
                        total={total}
                        onCouvChange={(v) => updateCell(mois, j.code, lieu.id, svc.code, 'couverts_cible', v)}
                        onTmChange={(v) => updateCell(mois, j.code, lieu.id, svc.code, 'tm_cible', v)}
                        c={c}
                        isLast={idx === SERVICES.length - 1}
                      />
                    )
                  })}
                </tr>
              )
            })}
            {/* Total mensuel */}
            <tr style={{ background: c.fond, borderTop: `1.5px solid ${c.bordure}`, fontWeight: 600 }}>
              <td style={{ padding: '8px 10px', borderRight: `1px solid ${c.bordure}`, color: c.texte }}>
                Total mois
              </td>
              {SERVICES.map((svc, idx) => {
                const t = totals[svc.code]
                const tmAvg = t.cvts > 0 ? t.ca / t.cvts : 0
                return (
                  <TotalCells
                    key={svc.code}
                    nbre={t.nbre}
                    cvts={t.cvts}
                    tm={tmAvg}
                    total={t.ca}
                    c={c}
                    isLast={idx === SERVICES.length - 1}
                  />
                )
              })}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ColumnHeaders({ c, isLast }) {
  const cells = ['Nbre', 'Couv/J', 'Cvts', 'TM', 'Total']
  return (
    <>
      {cells.map((label, idx) => (
        <th
          key={label}
          style={{
            padding: '6px 6px',
            textAlign: 'center',
            borderBottom: `1px solid ${c.bordure}`,
            borderRight: idx === cells.length - 1 && !isLast ? `1px solid ${c.bordure}` : 'none',
            color: c.texteMuted,
            fontSize: 10,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: 0.3,
            width: idx === 1 || idx === 3 ? 80 : 70,
          }}
        >
          {label}
        </th>
      ))}
    </>
  )
}

function ServiceCells({ nbre, cell, cvts, total, onCouvChange, onTmChange, c, isLast }) {
  const tdReadonly = {
    padding: '4px 6px',
    textAlign: 'right',
    color: c.texteMuted,
    background: c.fond,
    fontVariantNumeric: 'tabular-nums',
  }
  const tdInput = {
    padding: 2,
    background: c.blanc,
  }
  const inputStyle = {
    width: '100%',
    padding: '5px 6px',
    borderRadius: 4,
    border: `1px solid ${c.bordure}`,
    background: c.blanc,
    color: c.texte,
    fontSize: 12,
    textAlign: 'right',
    outline: 'none',
    fontVariantNumeric: 'tabular-nums',
  }
  return (
    <>
      <td style={tdReadonly}>{nbre || '—'}</td>
      <td style={tdInput}>
        <input
          type="number"
          inputMode="decimal"
          min="0"
          step="1"
          value={cell.couverts_cible}
          onChange={(e) => onCouvChange(e.target.value)}
          placeholder="0"
          style={inputStyle}
        />
      </td>
      <td style={tdReadonly}>{cvts > 0 ? formatNum(cvts) : '—'}</td>
      <td style={tdInput}>
        <input
          type="number"
          inputMode="decimal"
          min="0"
          step="0.01"
          value={cell.tm_cible}
          onChange={(e) => onTmChange(e.target.value)}
          placeholder="0"
          style={inputStyle}
        />
      </td>
      <td style={{ ...tdReadonly, borderRight: !isLast ? `1px solid ${c.bordure}` : 'none', fontWeight: 500, color: c.texte }}>
        {total > 0 ? formatEur(total) : '—'}
      </td>
    </>
  )
}

function TotalCells({ nbre, cvts, tm, total, c, isLast }) {
  const td = {
    padding: '8px 6px',
    textAlign: 'right',
    color: c.texte,
    fontVariantNumeric: 'tabular-nums',
    fontWeight: 600,
  }
  return (
    <>
      <td style={td}>{nbre || '—'}</td>
      <td style={td}>—</td>
      <td style={td}>{cvts > 0 ? formatNum(cvts) : '—'}</td>
      <td style={td}>{tm > 0 ? formatEur(tm) : '—'}</td>
      <td
        style={{
          ...td,
          borderRight: !isLast ? `1px solid ${c.bordure}` : 'none',
        }}
      >
        {total > 0 ? formatEur(total) : '—'}
      </td>
    </>
  )
}

function MoisCardsMobile({ mois, annee, lieu, moisMap, updateCell, onDuplicateNext, onDuplicateAllAfter, sectionId, totals, c }) {
  return (
    <div
      id={sectionId}
      style={{
        background: c.blanc,
        borderRadius: 12,
        border: `0.5px solid ${c.bordure}`,
        overflow: 'hidden',
        scrollMarginTop: 80,
      }}
    >
      <div
        style={{
          padding: '10px 14px',
          borderBottom: `1px solid ${c.bordure}`,
          background: c.fond,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 600, color: c.texte }}>
          {MOIS_LABEL[mois]} {annee}
        </div>
        {mois < 12 && (
          <button
            onClick={onDuplicateNext}
            style={{
              padding: '4px 8px',
              borderRadius: 6,
              fontSize: 11,
              border: `1px solid ${c.bordure}`,
              background: c.blanc,
              color: c.texte,
              cursor: 'pointer',
            }}
          >
            → {MOIS_LABEL[mois + 1].slice(0, 3)}.
          </button>
        )}
      </div>
      {JOURS_SEMAINE.map((j) => {
        const nbre = joursDansMois(annee, mois, j.code)
        return (
          <div key={j.code} style={{ padding: '10px 14px', borderTop: `0.5px solid ${c.bordure}` }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: c.texte, marginBottom: 6 }}>
              {j.label} <span style={{ color: c.texteMuted, fontWeight: 400 }}>· {nbre} jours dans le mois</span>
            </div>
            {SERVICES.map((svc) => {
              const cell = moisMap[`${j.code}_${lieu.id}_${svc.code}`] || emptyCell()
              const couvJ = Number(cell.couverts_cible || 0)
              const tm = Number(cell.tm_cible || 0)
              const cvts = nbre * couvJ
              const total = cvts * tm
              return (
                <div
                  key={svc.code}
                  style={{
                    padding: '8px 10px',
                    background: c.fond,
                    borderRadius: 8,
                    marginBottom: 6,
                  }}
                >
                  <div style={{ fontSize: 11, color: c.texteMuted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>
                    {svc.label}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <label style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2, fontSize: 11, color: c.texteMuted }}>
                      Couv/J
                      <input
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="1"
                        value={cell.couverts_cible}
                        onChange={(e) => updateCell(mois, j.code, lieu.id, svc.code, 'couverts_cible', e.target.value)}
                        placeholder="0"
                        style={{ padding: '6px 8px', borderRadius: 4, border: `1px solid ${c.bordure}`, fontSize: 13, textAlign: 'right', background: c.blanc, color: c.texte }}
                      />
                    </label>
                    <label style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2, fontSize: 11, color: c.texteMuted }}>
                      TM
                      <input
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="0.01"
                        value={cell.tm_cible}
                        onChange={(e) => updateCell(mois, j.code, lieu.id, svc.code, 'tm_cible', e.target.value)}
                        placeholder="0"
                        style={{ padding: '6px 8px', borderRadius: 4, border: `1px solid ${c.bordure}`, fontSize: 13, textAlign: 'right', background: c.blanc, color: c.texte }}
                      />
                    </label>
                  </div>
                  <div style={{ marginTop: 4, fontSize: 11, color: c.texteMuted, display: 'flex', justifyContent: 'space-between' }}>
                    <span>Cvts: {cvts > 0 ? formatNum(cvts) : '—'}</span>
                    <span style={{ fontWeight: 600, color: c.texte }}>Total: {total > 0 ? formatEur(total) : '—'}</span>
                  </div>
                </div>
              )
            })}
          </div>
        )
      })}
      <div style={{ padding: '10px 14px', borderTop: `1.5px solid ${c.bordure}`, background: c.fond, fontSize: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ color: c.texteMuted }}>Total déjeuner</span>
          <span style={{ fontWeight: 600, color: c.texte }}>
            {totals.lunch.cvts > 0 ? `${formatNum(totals.lunch.cvts)} cvts · ${formatEur(totals.lunch.ca)}` : '—'}
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: c.texteMuted }}>Total dîner</span>
          <span style={{ fontWeight: 600, color: c.texte }}>
            {totals.dinner.cvts > 0 ? `${formatNum(totals.dinner.cvts)} cvts · ${formatEur(totals.dinner.ca)}` : '—'}
          </span>
        </div>
      </div>
      {mois < 12 && (
        <div style={{ padding: '10px 14px', borderTop: `0.5px solid ${c.bordure}` }}>
          <button
            onClick={onDuplicateAllAfter}
            style={{
              width: '100%',
              padding: '8px 14px',
              borderRadius: 8,
              fontSize: 12,
              border: `1px solid ${c.bordure}`,
              background: c.blanc,
              color: c.texte,
              cursor: 'pointer',
            }}
          >
            Dupliquer ce mois aux {12 - mois} suivants
          </button>
        </div>
      )}
    </div>
  )
}

/* ─── SommaireSticky : nav latérale 12 mois ──────────────────────────────── */

function SommaireSticky({ budgets, lieuId, annee, c }) {
  const items = useMemo(() => {
    return MOIS.map((m) => {
      const moisMap = budgets[m] || {}
      let cvts = 0
      let ca = 0
      for (const j of JOURS_SEMAINE) {
        const nbre = joursDansMois(annee, m, j.code)
        for (const svc of SERVICES) {
          const cell = moisMap[`${j.code}_${lieuId}_${svc.code}`]
          if (!cell) continue
          const couvJ = Number(cell.couverts_cible || 0)
          const tm = Number(cell.tm_cible || 0)
          cvts += nbre * couvJ
          ca += nbre * couvJ * tm
        }
      }
      return { mois: m, cvts, ca }
    })
  }, [budgets, lieuId, annee])

  return (
    <div
      style={{
        position: 'sticky',
        top: 16,
        background: c.blanc,
        borderRadius: 12,
        border: `0.5px solid ${c.bordure}`,
        overflow: 'hidden',
        maxHeight: 'calc(100vh - 32px)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          padding: '10px 14px',
          borderBottom: `1px solid ${c.bordure}`,
          background: c.fond,
          fontSize: 11,
          fontWeight: 600,
          color: c.texteMuted,
          textTransform: 'uppercase',
          letterSpacing: 0.4,
        }}
      >
        Sommaire
      </div>
      <div style={{ overflowY: 'auto' }}>
        {items.map(({ mois, cvts, ca }) => (
          <a
            key={mois}
            href={`#mois-${mois}`}
            onClick={(e) => {
              e.preventDefault()
              document.getElementById(`mois-${mois}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            }}
            style={{
              display: 'block',
              padding: '8px 14px',
              borderBottom: `0.5px solid ${c.bordure}`,
              textDecoration: 'none',
              color: c.texte,
              fontSize: 12,
            }}
          >
            <div style={{ fontWeight: 600 }}>{MOIS_LABEL[mois]}</div>
            <div style={{ fontSize: 11, color: c.texteMuted, marginTop: 2 }}>
              {cvts > 0 ? `${formatNum(cvts)} cvts · ${formatEur(ca)}` : 'À renseigner'}
            </div>
          </a>
        ))}
      </div>
    </div>
  )
}

/* ─── Wizard adapté Couv/J + TM ─────────────────────────────────────────── */

function WizardModal({ lieux, initialLieuId, onApply, onClose, c, isMobile }) {
  const [step, setStep] = useState(1)
  const [lieuId, setLieuId] = useState(initialLieuId || (lieux[0] && lieux[0].id))
  const [joursSelected, setJoursSelected] = useState([2, 3, 4, 5, 6]) // mar-sam par défaut
  const [moisSelected, setMoisSelected] = useState([...MOIS]) // tous les mois par défaut
  const [services, setServices] = useState({
    lunch: { couverts_cible: '', tm_cible: '' },
    dinner: { couverts_cible: '', tm_cible: '' },
  })

  const toggleJour = (code) =>
    setJoursSelected((prev) => (prev.includes(code) ? prev.filter((j) => j !== code) : [...prev, code]))
  const applyPresetJours = (jours) => setJoursSelected(jours)

  const toggleMois = (m) =>
    setMoisSelected((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]))
  const allMois = () => setMoisSelected([...MOIS])
  const noMois = () => setMoisSelected([])

  const updateService = (svcCode, field, value) =>
    setServices((prev) => ({ ...prev, [svcCode]: { ...prev[svcCode], [field]: value } }))

  const lieuObj = lieux.find((l) => l.id === lieuId)
  const canGoStep2 = lieuId != null
  const canGoStep3 = joursSelected.length > 0 && moisSelected.length > 0
  const canApply =
    (Number(services.lunch.couverts_cible) > 0 && Number(services.lunch.tm_cible) > 0) ||
    (Number(services.dinner.couverts_cible) > 0 && Number(services.dinner.tm_cible) > 0)

  const handleApply = () => {
    onApply(lieuId, joursSelected, services, moisSelected)
    onClose()
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 200,
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: c.blanc,
          borderRadius: 12,
          width: '100%',
          maxWidth: 640,
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: 16,
            borderBottom: `1px solid ${c.bordure}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: c.texte }}>
            Saisie guidée — étape {step}/3
          </h3>
          <button
            onClick={onClose}
            style={{
              padding: '6px 12px',
              borderRadius: 6,
              border: `1px solid ${c.bordure}`,
              background: c.blanc,
              color: c.texte,
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            Fermer
          </button>
        </div>

        <div style={{ padding: 20, overflow: 'auto', flex: 1 }}>
          {step === 1 && (
            <div>
              <p style={{ margin: '0 0 12px', fontSize: 14, color: c.texte }}>Pour quel lieu de service ?</p>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 10 }}>
                {lieux.map((l) => {
                  const active = l.id === lieuId
                  return (
                    <button
                      key={l.id}
                      onClick={() => setLieuId(l.id)}
                      style={{
                        padding: '14px 16px',
                        borderRadius: 10,
                        border: active ? `2px solid ${c.accent}` : `1px solid ${c.bordure}`,
                        background: active ? c.accentClair || c.fond : c.blanc,
                        color: c.texte,
                        fontSize: 14,
                        fontWeight: active ? 600 : 400,
                        textAlign: 'left',
                        cursor: 'pointer',
                      }}
                    >
                      {l.nom}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {step === 2 && (
            <div>
              <p style={{ margin: '0 0 8px', fontSize: 14, color: c.texte, fontWeight: 600 }}>
                Quel(s) jour(s) de la semaine ?
              </p>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                {JOURS_SEMAINE.map((j) => {
                  const active = joursSelected.includes(j.code)
                  return (
                    <button
                      key={j.code}
                      onClick={() => toggleJour(j.code)}
                      style={{
                        padding: '8px 14px',
                        borderRadius: 999,
                        border: active ? `2px solid ${c.accent}` : `1px solid ${c.bordure}`,
                        background: active ? c.accent : c.blanc,
                        color: c.texte,
                        fontSize: 13,
                        fontWeight: active ? 600 : 400,
                        cursor: 'pointer',
                        minWidth: 60,
                      }}
                    >
                      {j.short}
                    </button>
                  )
                })}
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 20 }}>
                {JOUR_PRESETS.map((p) => (
                  <button
                    key={p.code}
                    onClick={() => applyPresetJours(p.jours)}
                    style={{
                      padding: '5px 10px',
                      borderRadius: 6,
                      border: `1px solid ${c.bordure}`,
                      background: c.blanc,
                      color: c.texte,
                      fontSize: 11,
                      cursor: 'pointer',
                    }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              <p style={{ margin: '0 0 8px', fontSize: 14, color: c.texte, fontWeight: 600 }}>
                Quel(s) mois ?
              </p>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                {MOIS.map((m) => {
                  const active = moisSelected.includes(m)
                  return (
                    <button
                      key={m}
                      onClick={() => toggleMois(m)}
                      style={{
                        padding: '6px 12px',
                        borderRadius: 6,
                        border: active ? `2px solid ${c.accent}` : `1px solid ${c.bordure}`,
                        background: active ? c.accent : c.blanc,
                        color: c.texte,
                        fontSize: 12,
                        fontWeight: active ? 600 : 400,
                        cursor: 'pointer',
                      }}
                    >
                      {MOIS_LABEL[m].slice(0, 3)}.
                    </button>
                  )
                })}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  onClick={allMois}
                  style={{
                    padding: '5px 10px',
                    borderRadius: 6,
                    border: `1px solid ${c.bordure}`,
                    background: c.blanc,
                    color: c.texte,
                    fontSize: 11,
                    cursor: 'pointer',
                  }}
                >
                  Toute l&apos;année
                </button>
                <button
                  onClick={noMois}
                  style={{
                    padding: '5px 10px',
                    borderRadius: 6,
                    border: `1px solid ${c.bordure}`,
                    background: c.blanc,
                    color: c.texte,
                    fontSize: 11,
                    cursor: 'pointer',
                  }}
                >
                  Aucun
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div>
              <p style={{ margin: '0 0 12px', fontSize: 14, color: c.texte }}>
                Budget pour <strong>{lieuObj?.nom}</strong> · {joursSelected.length} jour(s) · {moisSelected.length} mois
              </p>
              {SERVICES.map((svc) => (
                <div
                  key={svc.code}
                  style={{
                    border: `1px solid ${c.bordure}`,
                    borderRadius: 10,
                    padding: 14,
                    marginBottom: 12,
                  }}
                >
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: c.texteMuted,
                      textTransform: 'uppercase',
                      letterSpacing: 0.4,
                      marginBottom: 10,
                    }}
                  >
                    {svc.label}
                  </div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <label style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: c.texteMuted }}>
                      Couverts / jour
                      <input
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="1"
                        value={services[svc.code].couverts_cible}
                        onChange={(e) => updateService(svc.code, 'couverts_cible', e.target.value)}
                        placeholder="0"
                        style={{ padding: '8px 10px', borderRadius: 6, border: `1px solid ${c.bordure}`, fontSize: 14, textAlign: 'right', background: c.blanc, color: c.texte }}
                      />
                    </label>
                    <label style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: c.texteMuted }}>
                      Ticket moyen (€)
                      <input
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="0.01"
                        value={services[svc.code].tm_cible}
                        onChange={(e) => updateService(svc.code, 'tm_cible', e.target.value)}
                        placeholder="0"
                        style={{ padding: '8px 10px', borderRadius: 6, border: `1px solid ${c.bordure}`, fontSize: 14, textAlign: 'right', background: c.blanc, color: c.texte }}
                      />
                    </label>
                  </div>
                  <div style={{ marginTop: 8, fontSize: 11, color: c.texteMuted, textAlign: 'right' }}>
                    Total ligne :{' '}
                    {Number(services[svc.code].couverts_cible) > 0 && Number(services[svc.code].tm_cible) > 0
                      ? formatEur(Number(services[svc.code].couverts_cible) * Number(services[svc.code].tm_cible))
                      : '—'}{' '}
                    par jour
                  </div>
                </div>
              ))}
              <p style={{ margin: 0, fontSize: 12, color: c.texteMuted }}>
                Sera appliqué sur {joursSelected.length} jour(s) × {moisSelected.length} mois ={' '}
                {joursSelected.length * moisSelected.length * SERVICES.length} cellules. Tu pourras
                encore corriger manuellement avant d&apos;enregistrer.
              </p>
            </div>
          )}
        </div>

        <div
          style={{
            padding: 16,
            borderTop: `1px solid ${c.bordure}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <button
            onClick={() => setStep((s) => Math.max(1, s - 1))}
            disabled={step === 1}
            style={{
              padding: '9px 16px',
              borderRadius: 8,
              border: `1px solid ${c.bordure}`,
              background: c.blanc,
              color: c.texte,
              fontSize: 13,
              cursor: step === 1 ? 'not-allowed' : 'pointer',
              opacity: step === 1 ? 0.4 : 1,
            }}
          >
            ← Retour
          </button>
          {step < 3 ? (
            <button
              onClick={() => setStep((s) => s + 1)}
              disabled={(step === 1 && !canGoStep2) || (step === 2 && !canGoStep3)}
              style={{
                padding: '9px 18px',
                borderRadius: 8,
                border: 'none',
                background: c.accent,
                color: c.texte,
                fontSize: 13,
                fontWeight: 600,
                cursor:
                  (step === 1 && !canGoStep2) || (step === 2 && !canGoStep3)
                    ? 'not-allowed'
                    : 'pointer',
                opacity: (step === 1 && !canGoStep2) || (step === 2 && !canGoStep3) ? 0.4 : 1,
              }}
            >
              Suivant →
            </button>
          ) : (
            <button
              onClick={handleApply}
              disabled={!canApply}
              style={{
                padding: '9px 18px',
                borderRadius: 8,
                border: 'none',
                background: c.accent,
                color: c.texte,
                fontSize: 13,
                fontWeight: 600,
                cursor: canApply ? 'pointer' : 'not-allowed',
                opacity: canApply ? 1 : 0.4,
              }}
            >
              ✓ Appliquer
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/* ─── ImportPreviewModal (inchangée logiquement) ─────────────────────────── */

function ImportPreviewModal({ preview, onCancel, onConfirm, saving, c }) {
  return (
    <div
      onClick={onCancel}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 200,
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: c.blanc,
          borderRadius: 12,
          width: '100%',
          maxWidth: 520,
          padding: 24,
        }}
      >
        <h3 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 600, color: c.texte }}>
          Confirmer l&apos;import
        </h3>
        <p style={{ margin: '0 0 16px', fontSize: 13, color: c.texteMuted }}>
          Le fichier sera converti en budgets mensuels (12 mois × 5 jours × 2 services). Répartition
          du CA appliquée : 65 % Food / 28 % Alcool / 7 % Soft.
        </p>

        <div
          style={{
            background: c.fond,
            borderRadius: 8,
            padding: 12,
            marginBottom: 16,
            fontSize: 13,
            color: c.texte,
          }}
        >
          <div style={{ marginBottom: 4 }}>
            <strong>{preview.rows.length} lignes</strong> à importer
          </div>
          <div style={{ marginBottom: 4 }}>Lieux concernés : {preview.sectionNames.join(', ')}</div>
          {preview.lieuxToCreate.length > 0 && (
            <div style={{ color: '#B45309' }}>
              ⚠ Lieux à créer automatiquement : {preview.lieuxToCreate.join(', ')}
            </div>
          )}
        </div>

        <div style={{ fontSize: 12, color: c.texteMuted, marginBottom: 16 }}>
          Note : seules les sections « Salle à manger » et « Table de partage » sont importées. Les
          Privats utilisent un format event/revenu différent — saisis-les à la main si besoin.
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            disabled={saving}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              border: `1px solid ${c.bordure}`,
              background: c.blanc,
              color: c.texte,
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            Annuler
          </button>
          <button
            onClick={onConfirm}
            disabled={saving}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              border: 'none',
              background: c.accent,
              color: c.texte,
              fontSize: 13,
              fontWeight: 600,
              cursor: saving ? 'not-allowed' : 'pointer',
              opacity: saving ? 0.5 : 1,
            }}
          >
            {saving ? 'Import en cours…' : 'Confirmer l’import'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ConfirmModal({ title, body, confirmLabel = 'Confirmer', danger = false, saving = false, onCancel, onConfirm, c }) {
  return (
    <div
      onClick={onCancel}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 200,
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: c.blanc,
          borderRadius: 12,
          width: '100%',
          maxWidth: 480,
          padding: 24,
        }}
      >
        <h3 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 600, color: c.texte }}>{title}</h3>
        <div style={{ margin: '0 0 20px', fontSize: 13, color: c.texte, lineHeight: 1.5 }}>{body}</div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            disabled={saving}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              border: `1px solid ${c.bordure}`,
              background: c.blanc,
              color: c.texte,
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            Annuler
          </button>
          <button
            onClick={onConfirm}
            disabled={saving}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              border: 'none',
              background: danger ? '#DC2626' : c.accent,
              color: danger ? '#fff' : c.texte,
              fontSize: 13,
              fontWeight: 600,
              cursor: saving ? 'not-allowed' : 'pointer',
              opacity: saving ? 0.5 : 1,
            }}
          >
            {saving ? '…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

function KPI({ label, value, c }) {
  return (
    <div style={{ padding: 12, background: c.fond, borderRadius: 8 }}>
      <div
        style={{
          fontSize: 11,
          color: c.texteMuted,
          textTransform: 'uppercase',
          letterSpacing: 0.4,
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 18, fontWeight: 600, color: c.texte }}>{value}</div>
    </div>
  )
}

/* ─── HistoryModal (inchangée) ────────────────────────────────────────────── */

function HistoryModal({ clientId, onClose, c, isMobile }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancel = false
    ;(async () => {
      try {
        const { data, error: qErr } = await supabase
          .from('ca_budgets_audit')
          .select('id, action, raison, old_values, new_values, changed_at, changed_by')
          .eq('client_id', clientId)
          .order('changed_at', { ascending: false })
          .limit(50)
        if (cancel) return
        if (qErr) throw qErr
        setRows(data || [])
      } catch (e) {
        if (!cancel) setError(e.message || 'Erreur de chargement')
      } finally {
        if (!cancel) setLoading(false)
      }
    })()
    return () => {
      cancel = true
    }
  }, [clientId])

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 200,
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: c.blanc,
          borderRadius: 12,
          width: '100%',
          maxWidth: 640,
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: 16,
            borderBottom: `1px solid ${c.bordure}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: c.texte }}>
            Historique des modifications
          </h3>
          <button
            onClick={onClose}
            style={{
              padding: '6px 12px',
              borderRadius: 6,
              border: `1px solid ${c.bordure}`,
              background: c.blanc,
              color: c.texte,
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            Fermer
          </button>
        </div>
        <div style={{ overflow: 'auto', padding: 16 }}>
          {loading && <p style={{ color: c.texteMuted, fontSize: 13 }}>Chargement…</p>}
          {error && <p style={{ color: '#B91C1C', fontSize: 13 }}>{error}</p>}
          {!loading && !error && rows.length === 0 && (
            <p style={{ color: c.texteMuted, fontSize: 13 }}>Aucune modification enregistrée.</p>
          )}
          {!loading &&
            !error &&
            rows.map((r) => <HistoryRow key={r.id} row={r} c={c} isMobile={isMobile} />)}
        </div>
      </div>
    </div>
  )
}

function HistoryRow({ row, c }) {
  const date = new Date(row.changed_at)
  const dateStr = date.toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  const actionColors = {
    INSERT: '#15803D',
    UPDATE: '#B45309',
    DELETE: '#B91C1C',
  }
  const actionLabels = {
    INSERT: 'Création',
    UPDATE: 'Modification',
    DELETE: 'Suppression',
  }

  const v = row.new_values || row.old_values || {}
  const summary = []
  if (v.mois != null) summary.push(`mois ${MOIS_LABEL[v.mois]}`)
  else summary.push('défaut')
  if (v.jour_semaine != null) {
    const j = JOURS_SEMAINE.find((x) => x.code === v.jour_semaine)
    if (j) summary.push(j.label)
  }
  if (v.service) summary.push(v.service === 'lunch' ? 'Déjeuner' : 'Dîner')

  let diff = null
  if (row.action === 'UPDATE' && row.old_values && row.new_values) {
    const changes = []
    const fields = [
      ['couverts_cible', 'Couverts'],
      ['ca_food_cible', 'CA Food'],
      ['ca_bev_20_cible', 'CA Alcool'],
      ['ca_bev_10_cible', 'CA Soft'],
      ['ca_autre_cible', 'Autres'],
    ]
    for (const [k, lbl] of fields) {
      const oldV = row.old_values[k]
      const newV = row.new_values[k]
      if (Number(oldV) !== Number(newV)) {
        changes.push(`${lbl} : ${oldV} → ${newV}`)
      }
    }
    diff = changes.join(' · ')
  }

  return (
    <div
      style={{
        padding: 12,
        borderBottom: `1px solid ${c.bordure}`,
        fontSize: 12,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontWeight: 600, color: actionColors[row.action] }}>
          {actionLabels[row.action]}
        </span>
        <span style={{ color: c.texteMuted }}>{dateStr}</span>
      </div>
      <div style={{ color: c.texte, marginBottom: 4 }}>{summary.join(' · ')}</div>
      {diff && <div style={{ color: c.texteMuted, fontFamily: 'monospace', fontSize: 11 }}>{diff}</div>}
      {row.raison && (
        <div style={{ color: c.texte, marginTop: 4, fontStyle: 'italic' }}>« {row.raison} »</div>
      )}
    </div>
  )
}
