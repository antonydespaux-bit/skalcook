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

const MOIS_LABEL = [
  '', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
]

const FIELDS = [
  { key: 'couverts_cible', label: 'Couv.', step: '1', suffix: null },
  { key: 'ca_food_cible', label: 'Food', step: '0.01', suffix: '€' },
  { key: 'ca_bev_20_cible', label: 'Alcool 20%', step: '0.01', suffix: '€' },
  { key: 'ca_bev_10_cible', label: 'Soft 10%', step: '0.01', suffix: '€' },
  { key: 'ca_autre_cible', label: 'Autres', step: '0.01', suffix: '€' },
]

const JOUR_PRESETS = [
  { code: 'mar-jeu', label: 'Mar-jeu', jours: [2, 3, 4] },
  { code: 'lun-ven', label: 'Lun-ven', jours: [1, 2, 3, 4, 5] },
  { code: 'ven-sam', label: 'Ven-sam', jours: [5, 6] },
  { code: 'all', label: 'Toute la semaine', jours: [1, 2, 3, 4, 5, 6, 7] },
]

function emptyCell() {
  return {
    id: null,
    couverts_cible: '',
    ca_food_cible: '',
    ca_bev_20_cible: '',
    ca_bev_10_cible: '',
    ca_autre_cible: '',
  }
}

function cellTotalCA(cell) {
  return (
    Number(cell.ca_food_cible || 0) +
    Number(cell.ca_bev_20_cible || 0) +
    Number(cell.ca_bev_10_cible || 0) +
    Number(cell.ca_autre_cible || 0)
  )
}

function hasAnyValue(cell) {
  return FIELDS.some((f) => {
    const v = cell[f.key]
    return v !== '' && v !== null && v !== undefined && Number(v) > 0
  })
}

function formatEur(n) {
  if (n == null || isNaN(n) || Number(n) === 0) return '—'
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n)
}

/* ─── Import Excel ───────────────────────────────────────────────────────── */

const FOOD_RATIO = 0.65
const BEV_20_RATIO = 0.28
const BEV_10_RATIO = 0.07

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
    ca_food_cible: Math.round(ca * FOOD_RATIO * 100) / 100,
    ca_bev_20_cible: Math.round(ca * BEV_20_RATIO * 100) / 100,
    ca_bev_10_cible: Math.round(ca * BEV_10_RATIO * 100) / 100,
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

function consolidateRows(parsed) {
  const grouped = new Map()
  for (const r of parsed) {
    const k = `${r.section}|${r.jour_semaine}|${r.service}`
    if (!grouped.has(k)) grouped.set(k, [])
    grouped.get(k).push(r)
  }
  const final = []
  for (const rows of grouped.values()) {
    const sigCount = new Map()
    const sigOf = (x) =>
      `${x.couverts_cible}|${x.ca_food_cible}|${x.ca_bev_20_cible}|${x.ca_bev_10_cible}|${x.ca_autre_cible}`
    for (const r of rows) {
      const s = sigOf(r)
      sigCount.set(s, (sigCount.get(s) || 0) + 1)
    }
    let bestSig = null
    let bestCount = 0
    for (const [s, count] of sigCount) {
      if (count > bestCount) {
        bestSig = s
        bestCount = count
      }
    }
    const def = rows.find((r) => sigOf(r) === bestSig)
    final.push({ ...def, mois: null })
    for (const r of rows) {
      if (sigOf(r) !== bestSig) final.push(r)
    }
  }
  return final
}

/* ─── Page principale ────────────────────────────────────────────────────── */

export default function BudgetsPage() {
  const router = useRouter()
  const c = useTheme()
  const isMobile = useIsMobile()

  const [clientId, setClientId] = useState(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [moisFilter, setMoisFilter] = useState('default') // 'default' | '1'..'12'
  const [lieuFilter, setLieuFilter] = useState(null) // id du lieu sélectionné
  const [lieux, setLieux] = useState([])
  // budgets indexés par `${jds}_${lieu_id}_${service}`
  const [budgets, setBudgets] = useState({})
  const [defaultBudgets, setDefaultBudgets] = useState({})
  const [raison, setRaison] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [okMsg, setOkMsg] = useState('')
  const [saving, setSaving] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [wizardOpen, setWizardOpen] = useState(false)
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

  const moisValue = moisFilter === 'default' ? null : Number(moisFilter)

  const loadData = useCallback(async () => {
    if (!clientId) return
    setLoading(true)
    setError('')
    setOkMsg('')
    try {
      const [lieuxRes, defaultRes, currentRes] = await Promise.all([
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
            'id, jour_semaine, lieu_service_id, service, couverts_cible, ca_food_cible, ca_bev_20_cible, ca_bev_10_cible, ca_autre_cible'
          )
          .eq('client_id', clientId)
          .is('mois', null),
        moisValue == null
          ? Promise.resolve({ data: null, error: null })
          : supabase
              .from('ca_budgets')
              .select(
                'id, jour_semaine, lieu_service_id, service, couverts_cible, ca_food_cible, ca_bev_20_cible, ca_bev_10_cible, ca_autre_cible'
              )
              .eq('client_id', clientId)
              .eq('mois', moisValue),
      ])
      if (lieuxRes.error) throw lieuxRes.error
      if (defaultRes.error) throw defaultRes.error
      if (currentRes.error) throw currentRes.error

      setLieux(lieuxRes.data || [])

      const idxDefault = {}
      ;(defaultRes.data || []).forEach((b) => {
        idxDefault[`${b.jour_semaine}_${b.lieu_service_id}_${b.service}`] = {
          id: b.id,
          couverts_cible: b.couverts_cible,
          ca_food_cible: b.ca_food_cible,
          ca_bev_20_cible: b.ca_bev_20_cible,
          ca_bev_10_cible: b.ca_bev_10_cible,
          ca_autre_cible: b.ca_autre_cible,
        }
      })
      setDefaultBudgets(idxDefault)

      const dataToShow = moisValue == null ? defaultRes.data : currentRes.data
      const idxShow = {}
      ;(dataToShow || []).forEach((b) => {
        idxShow[`${b.jour_semaine}_${b.lieu_service_id}_${b.service}`] = {
          id: b.id,
          couverts_cible: b.couverts_cible ?? '',
          ca_food_cible: b.ca_food_cible ?? '',
          ca_bev_20_cible: b.ca_bev_20_cible ?? '',
          ca_bev_10_cible: b.ca_bev_10_cible ?? '',
          ca_autre_cible: b.ca_autre_cible ?? '',
        }
      })
      setBudgets(idxShow)
    } catch (e) {
      setError(e.message || 'Erreur de chargement')
    } finally {
      setLoading(false)
    }
  }, [clientId, moisValue])

  useEffect(() => {
    if (authChecked) loadData()
  }, [authChecked, loadData])

  // Sélectionne le 1er lieu par défaut une fois la liste chargée
  useEffect(() => {
    if (lieux.length === 0) return
    if (lieuFilter == null || !lieux.find((l) => l.id === lieuFilter)) {
      setLieuFilter(lieux[0].id)
    }
  }, [lieux, lieuFilter])

  const updateCell = useCallback((jds, lieuId, service, field, value) => {
    setBudgets((prev) => {
      const key = `${jds}_${lieuId}_${service}`
      const current = prev[key] || emptyCell()
      return { ...prev, [key]: { ...current, [field]: value } }
    })
  }, [])

  // Appelé par le wizard : pré-remplit les cellules pour 1 lieu × N jours.
  // services = { lunch: { couverts_cible, ca_food_cible, … }, dinner: {…} }
  const applyWizard = useCallback((lieuId, jours, services) => {
    setBudgets((prev) => {
      const next = { ...prev }
      for (const jds of jours) {
        for (const svcCode of Object.keys(services)) {
          const data = services[svcCode]
          if (!data) continue
          const key = `${jds}_${lieuId}_${svcCode}`
          const existing = prev[key] || emptyCell()
          next[key] = { ...existing, ...data }
        }
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
      for (const j of JOURS_SEMAINE) {
        for (const lieu of lieux) {
          for (const svc of SERVICES) {
            const cell = budgets[`${j.code}_${lieu.id}_${svc.code}`]
            if (!cell || !hasAnyValue(cell)) continue
            rows.push({
              client_id: clientId,
              mois: moisValue,
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
  }, [clientId, moisValue, lieux, budgets, raison, loadData])

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
      const consolidated = consolidateRows(parsed)
      const sectionNames = [...new Set(consolidated.map((r) => r.section))]
      const existingNames = lieux.map((l) => l.nom)
      const lieuxToCreate = sectionNames.filter((n) => !existingNames.includes(n))
      const defaultsCount = consolidated.filter((r) => r.mois == null).length
      const overridesCount = consolidated.length - defaultsCount
      setImportPreview({
        rows: consolidated,
        sectionNames,
        lieuxToCreate,
        defaultsCount,
        overridesCount,
      })
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

  // Totaux pour le lieu sélectionné uniquement
  const lieuTotals = useMemo(() => {
    const t = { couverts: 0, ca: 0 }
    if (!lieuFilter) return t
    for (const j of JOURS_SEMAINE) {
      for (const svc of SERVICES) {
        const cell = budgets[`${j.code}_${lieuFilter}_${svc.code}`]
        if (!cell) continue
        t.couverts += Number(cell.couverts_cible || 0)
        t.ca += cellTotalCA(cell)
      }
    }
    return t
  }, [lieuFilter, budgets])

  if (!authChecked) return null

  const selectedLieu = lieux.find((l) => l.id === lieuFilter)

  return (
    <div style={{ minHeight: '100vh', background: c.fond }}>
      <Navbar section="cuisine" />
      <div style={{ padding: isMobile ? 16 : 24, paddingBottom: 96, maxWidth: 1200, margin: '0 auto' }}>
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
            Budgets de CA
          </h1>
          <p style={{ margin: 0, fontSize: 14, color: c.texteMuted }}>
            Objectifs par jour de la semaine et service. Chaque modification est tracée.
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
            moisFilter={moisFilter}
            setMoisFilter={setMoisFilter}
            onOpenWizard={() => setWizardOpen(true)}
            onClickImport={() => fileInputRef.current?.click()}
            onOpenHistory={() => setHistoryOpen(true)}
            c={c}
            isMobile={isMobile}
          />
        )}

        {moisValue != null && (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: 8,
              border: `1px dashed ${c.bordure}`,
              background: c.fond,
              fontSize: 13,
              color: c.texteMuted,
              marginBottom: 16,
            }}
          >
            <strong style={{ color: c.texte }}>Override pour {MOIS_LABEL[moisValue]} 2026.</strong>{' '}
            Les cellules vides utiliseront le budget par défaut. Modifie uniquement ce qui change pour ce mois.
          </div>
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
          <>
            <LieuTable
              lieu={selectedLieu}
              budgets={budgets}
              defaultBudgets={defaultBudgets}
              isOverride={moisValue != null}
              updateCell={updateCell}
              isMobile={isMobile}
              c={c}
            />

            <div
              style={{
                marginTop: 16,
                padding: 16,
                background: c.blanc,
                borderRadius: 12,
                border: `0.5px solid ${c.bordure}`,
                display: 'grid',
                gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)',
                gap: 12,
              }}
            >
              <KPI label={`Couverts/sem (${selectedLieu.nom})`} value={lieuTotals.couverts || '—'} c={c} />
              <KPI label={`CA/sem (${selectedLieu.nom})`} value={formatEur(lieuTotals.ca)} c={c} />
              <KPI
                label="Couverts/an (~52 sem.)"
                value={lieuTotals.couverts ? Math.round(lieuTotals.couverts * 52).toLocaleString('fr-FR') : '—'}
                c={c}
              />
              <KPI
                label="CA/an (~52 sem.)"
                value={lieuTotals.ca ? formatEur(lieuTotals.ca * 52) : '—'}
                c={c}
              />
            </div>

            <div
              style={{
                marginTop: 16,
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
          </>
        )}
      </div>

      {!loading && lieux.length > 0 && (
        <div
          style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            background: c.blanc,
            borderTop: `1px solid ${c.bordure}`,
            padding: isMobile ? '12px 16px' : '12px 24px',
            display: 'flex',
            justifyContent: 'center',
            zIndex: 100,
            boxShadow: '0 -6px 20px rgba(0,0,0,0.08)',
          }}
        >
          <button
            onClick={handleSave}
            disabled={saving || loading}
            style={{
              padding: '14px 32px',
              borderRadius: 8,
              fontSize: 16,
              border: 'none',
              background: c.accent,
              color: c.texte,
              cursor: saving || loading ? 'not-allowed' : 'pointer',
              fontWeight: 600,
              opacity: saving || loading ? 0.5 : 1,
              width: isMobile ? '100%' : 'auto',
              minWidth: isMobile ? 'auto' : 320,
            }}
          >
            {saving ? 'Enregistrement…' : 'Enregistrer les budgets'}
          </button>
        </div>
      )}

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
    </div>
  )
}

/* ─── TopBar : filtres lieu/mois + boutons d'action ──────────────────────── */

function TopBar({
  lieux,
  lieuFilter,
  setLieuFilter,
  moisFilter,
  setMoisFilter,
  onOpenWizard,
  onClickImport,
  onOpenHistory,
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
      <div style={{ display: 'flex', gap: 10, flex: 1, minWidth: 0, flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: c.texteMuted }}>
          Lieu
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
              minWidth: 180,
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
          Vue
          <select
            value={moisFilter}
            onChange={(e) => setMoisFilter(e.target.value)}
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
            <option value="default">Toute l&apos;année (défaut)</option>
            {MOIS_LABEL.slice(1).map((nom, i) => (
              <option key={i + 1} value={String(i + 1)}>
                {nom} (override)
              </option>
            ))}
          </select>
        </label>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          onClick={onOpenWizard}
          style={{
            padding: '8px 14px',
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 600,
            border: 'none',
            background: c.accent,
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
      </div>
    </div>
  )
}

/* ─── LieuTable : grille 7 jours × 2 services pour 1 lieu ────────────────── */

function LieuTable({ lieu, budgets, defaultBudgets, isOverride, updateCell, isMobile, c }) {
  // Sur desktop : tableau dense ; sur mobile : cards par jour empilées.
  if (isMobile) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {JOURS_SEMAINE.map((j) => (
          <JourCardMobile
            key={j.code}
            jour={j}
            lieu={lieu}
            budgets={budgets}
            defaultBudgets={defaultBudgets}
            isOverride={isOverride}
            updateCell={updateCell}
            c={c}
          />
        ))}
      </div>
    )
  }

  return (
    <div
      style={{
        background: c.blanc,
        borderRadius: 12,
        border: `0.5px solid ${c.bordure}`,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '10px 16px',
          borderBottom: `1px solid ${c.bordure}`,
          background: c.fond,
          fontSize: 14,
          fontWeight: 600,
          color: c.texte,
        }}
      >
        {lieu.nom}
      </div>
      {JOURS_SEMAINE.map((j) => (
        <JourRowDesktop
          key={j.code}
          jour={j}
          lieu={lieu}
          budgets={budgets}
          defaultBudgets={defaultBudgets}
          isOverride={isOverride}
          updateCell={updateCell}
          c={c}
        />
      ))}
    </div>
  )
}

function JourRowDesktop({ jour, lieu, budgets, defaultBudgets, isOverride, updateCell, c }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '90px 1fr 1fr',
        borderTop: `0.5px solid ${c.bordure}`,
      }}
    >
      <div
        style={{
          padding: '10px 16px',
          fontSize: 13,
          fontWeight: 500,
          color: c.texte,
          borderRight: `0.5px solid ${c.bordure}`,
          display: 'flex',
          alignItems: 'center',
        }}
      >
        {jour.label}
      </div>
      {SERVICES.map((svc) => {
        const key = `${jour.code}_${lieu.id}_${svc.code}`
        const cell = budgets[key] || emptyCell()
        const def = defaultBudgets[key]
        const total = cellTotalCA(cell)
        return (
          <div
            key={svc.code}
            style={{
              padding: '8px 12px',
              borderRight: svc.code === 'lunch' ? `0.5px solid ${c.bordure}` : 'none',
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
            }}
          >
            <div
              style={{
                fontSize: 10,
                fontWeight: 600,
                color: c.texteMuted,
                textTransform: 'uppercase',
                letterSpacing: 0.4,
              }}
            >
              {svc.label}
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {FIELDS.map((f) => {
                const placeholder =
                  isOverride && def != null ? `défaut : ${def[f.key] ?? 0}` : '0'
                return (
                  <FieldInline
                    key={f.key}
                    field={f}
                    value={cell[f.key]}
                    placeholder={placeholder}
                    onChange={(v) => updateCell(jour.code, lieu.id, svc.code, f.key, v)}
                    c={c}
                  />
                )
              })}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  marginLeft: 'auto',
                  fontSize: 12,
                  color: c.texte,
                  fontWeight: 600,
                }}
              >
                = {formatEur(total)}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function FieldInline({ field, value, placeholder, onChange, c }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 10, color: c.texteMuted }}>
        {field.label}
        {field.suffix ? ` (${field.suffix})` : ''}
      </span>
      <input
        type="number"
        inputMode="decimal"
        min="0"
        step={field.step}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          padding: '5px 8px',
          borderRadius: 6,
          border: `1px solid ${c.bordure}`,
          background: c.blanc,
          color: c.texte,
          fontSize: 12,
          width: 72,
          textAlign: 'right',
          outline: 'none',
        }}
      />
    </div>
  )
}

function JourCardMobile({ jour, lieu, budgets, defaultBudgets, isOverride, updateCell, c }) {
  return (
    <div
      style={{
        background: c.blanc,
        borderRadius: 12,
        border: `0.5px solid ${c.bordure}`,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '10px 14px',
          borderBottom: `1px solid ${c.bordure}`,
          background: c.fond,
          fontSize: 14,
          fontWeight: 600,
          color: c.texte,
        }}
      >
        {jour.label}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {SERVICES.map((svc) => {
          const key = `${jour.code}_${lieu.id}_${svc.code}`
          const cell = budgets[key] || emptyCell()
          const def = defaultBudgets[key]
          const total = cellTotalCA(cell)
          return (
            <div
              key={svc.code}
              style={{
                padding: '12px 14px',
                borderTop: svc.code === 'dinner' ? `0.5px solid ${c.bordure}` : 'none',
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: c.texteMuted,
                  textTransform: 'uppercase',
                  letterSpacing: 0.4,
                  marginBottom: 8,
                }}
              >
                {svc.label}
              </div>
              {FIELDS.map((f) => {
                const placeholder =
                  isOverride && def != null ? `défaut : ${def[f.key] ?? 0}` : '0'
                return (
                  <div
                    key={f.key}
                    style={{
                      marginBottom: 6,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 8,
                    }}
                  >
                    <label style={{ fontSize: 12, color: c.texte, flex: 1 }}>{f.label}</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <input
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step={f.step}
                        value={cell[f.key]}
                        onChange={(e) =>
                          updateCell(jour.code, lieu.id, svc.code, f.key, e.target.value)
                        }
                        placeholder={placeholder}
                        style={{
                          padding: '6px 8px',
                          borderRadius: 6,
                          border: `1px solid ${c.bordure}`,
                          background: c.blanc,
                          color: c.texte,
                          fontSize: 12,
                          width: 100,
                          textAlign: 'right',
                          outline: 'none',
                        }}
                      />
                      <span style={{ fontSize: 12, color: c.texteMuted, width: 12 }}>
                        {f.suffix || ''}
                      </span>
                    </div>
                  </div>
                )
              })}
              <div
                style={{
                  marginTop: 6,
                  paddingTop: 6,
                  borderTop: `1px dashed ${c.bordure}`,
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: 12,
                }}
              >
                <span style={{ color: c.texteMuted }}>Total CA cible</span>
                <span style={{ fontWeight: 600, color: c.texte }}>{formatEur(total)}</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ─── WizardModal : saisie guidée en 3 étapes ────────────────────────────── */

function WizardModal({ lieux, initialLieuId, onApply, onClose, c, isMobile }) {
  const [step, setStep] = useState(1)
  const [lieuId, setLieuId] = useState(initialLieuId || (lieux[0] && lieux[0].id))
  const [joursSelected, setJoursSelected] = useState([])
  const [services, setServices] = useState({
    lunch: { ...emptyCell() },
    dinner: { ...emptyCell() },
  })

  const toggleJour = (code) => {
    setJoursSelected((prev) =>
      prev.includes(code) ? prev.filter((j) => j !== code) : [...prev, code]
    )
  }
  const applyPreset = (jours) => setJoursSelected(jours)

  const updateService = (svcCode, field, value) => {
    setServices((prev) => ({
      ...prev,
      [svcCode]: { ...prev[svcCode], [field]: value },
    }))
  }

  const lieuObj = lieux.find((l) => l.id === lieuId)
  const joursLabels = joursSelected
    .map((c) => JOURS_SEMAINE.find((j) => j.code === c))
    .filter(Boolean)
    .sort((a, b) => a.code - b.code)
  const joursDisplay =
    joursLabels.length === 0
      ? '—'
      : joursLabels.length === 1
        ? joursLabels[0].label
        : joursLabels.length === 7
          ? 'toute la semaine'
          : joursLabels.map((j) => j.short).join(', ')

  const canGoStep2 = lieuId != null
  const canGoStep3 = joursSelected.length > 0
  const canApply = hasAnyValue(services.lunch) || hasAnyValue(services.dinner)

  const handleApply = () => {
    onApply(lieuId, joursSelected, services)
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
              <p style={{ margin: '0 0 12px', fontSize: 14, color: c.texte }}>
                Pour quel lieu de service ?
              </p>
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
              <p style={{ margin: '0 0 12px', fontSize: 14, color: c.texte }}>
                Pour quel(s) jour(s) ?
              </p>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
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
              <p style={{ margin: '0 0 8px', fontSize: 12, color: c.texteMuted }}>
                Ou choisis un raccourci :
              </p>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {JOUR_PRESETS.map((p) => (
                  <button
                    key={p.code}
                    onClick={() => applyPreset(p.jours)}
                    style={{
                      padding: '7px 12px',
                      borderRadius: 8,
                      border: `1px solid ${c.bordure}`,
                      background: c.blanc,
                      color: c.texte,
                      fontSize: 12,
                      cursor: 'pointer',
                    }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 3 && (
            <div>
              <p style={{ margin: '0 0 12px', fontSize: 14, color: c.texte }}>
                Budget pour <strong>{lieuObj?.nom}</strong> × <strong>{joursDisplay}</strong>
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
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: isMobile ? '1fr' : 'repeat(5, 1fr)',
                      gap: 10,
                    }}
                  >
                    {FIELDS.map((f) => (
                      <label
                        key={f.key}
                        style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: c.texteMuted }}
                      >
                        {f.label}
                        {f.suffix ? ` (${f.suffix})` : ''}
                        <input
                          type="number"
                          inputMode="decimal"
                          min="0"
                          step={f.step}
                          value={services[svc.code][f.key]}
                          onChange={(e) => updateService(svc.code, f.key, e.target.value)}
                          placeholder="0"
                          style={{
                            padding: '8px 10px',
                            borderRadius: 6,
                            border: `1px solid ${c.bordure}`,
                            background: c.blanc,
                            color: c.texte,
                            fontSize: 14,
                            outline: 'none',
                            textAlign: 'right',
                          }}
                        />
                      </label>
                    ))}
                  </div>
                  <div
                    style={{
                      marginTop: 8,
                      paddingTop: 8,
                      borderTop: `1px dashed ${c.bordure}`,
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: 12,
                    }}
                  >
                    <span style={{ color: c.texteMuted }}>Total CA</span>
                    <span style={{ fontWeight: 600, color: c.texte }}>
                      {formatEur(cellTotalCA(services[svc.code]))}
                    </span>
                  </div>
                </div>
              ))}
              <p style={{ margin: '0 0 0', fontSize: 12, color: c.texteMuted }}>
                Sera appliqué à <strong>{joursLabels.length} jour(s)</strong>. Tu pourras encore corriger
                manuellement dans le tableau avant d&apos;enregistrer.
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
              ✓ Appliquer aux {joursSelected.length} jour(s)
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/* ─── Modals existantes (inchangées) ─────────────────────────────────────── */

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
          Le fichier sera converti en budgets « par défaut » + overrides mensuels pour les mois qui
          diffèrent. Répartition appliquée : 65 % Food / 28 % Alcool / 7 % Soft.
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
            <strong>{preview.rows.length} lignes</strong> à importer (
            {preview.defaultsCount} par défaut + {preview.overridesCount} overrides)
          </div>
          <div style={{ marginBottom: 4 }}>
            Lieux concernés : {preview.sectionNames.join(', ')}
          </div>
          {preview.lieuxToCreate.length > 0 && (
            <div style={{ color: '#B45309' }}>
              ⚠ Lieux à créer automatiquement : {preview.lieuxToCreate.join(', ')}
            </div>
          )}
        </div>

        <div style={{ fontSize: 12, color: c.texteMuted, marginBottom: 16 }}>
          Note : seules les sections « Salle à manger » et « Table de partage » sont importées.
          Les Privats utilisent un format event/revenu différent — saisis-les à la main si besoin.
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
