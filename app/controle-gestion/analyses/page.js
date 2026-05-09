'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, getClientId } from '../../../lib/supabase'
import { useIsMobile } from '../../../lib/useIsMobile'
import { useTheme } from '../../../lib/useTheme'
import { useTenant } from '../../../lib/useTenant'
import { useRole } from '../../../lib/useRole'
import {
  getPeriodDates,
  shiftPeriodByYears,
  aggregateTotals,
  aggregateByDay,
  periodBudgetTotal,
  fromIsoDate,
} from '../../../lib/caAnalyses'
import {
  WIDGET_BY_ID,
  DEFAULT_LAYOUT,
  isWidgetAvailable,
  getAnalysesLayout,
  saveAnalysesLayout,
  resetAnalysesLayout,
} from '../../../lib/analysesPreferences'
import Navbar from '../../../components/Navbar'
import WidgetsCustomizeModal from '../../../components/dashboard/WidgetsCustomizeModal'
import FilterBar, { COMPARAISON_LABELS } from '../../../components/analyses/FilterBar'
import KpiCouverts from '../../../components/analyses/widgets/KpiCouverts'
import KpiCaTtc from '../../../components/analyses/widgets/KpiCaTtc'
import KpiCaHt from '../../../components/analyses/widgets/KpiCaHt'
import KpiTm from '../../../components/analyses/widgets/KpiTm'
import KpiEcartBudgetPct from '../../../components/analyses/widgets/KpiEcartBudgetPct'
import SectionTableauJourJour from '../../../components/analyses/widgets/SectionTableauJourJour'

const DEFAULT_PERIODE = 'mois-en-cours'

export default function AnalysesPage() {
  const router = useRouter()
  const isMobile = useIsMobile()
  const { c } = useTheme()
  const { tenant } = useTenant()
  const { role, loading: roleLoading } = useRole()
  const modulesActifs = tenant?.modules_actifs || []

  const [authReady, setAuthReady] = useState(false)
  const [clientId, setClientId] = useState(null)

  // ── Filtres globaux ──────────────────────────────────────────────────────
  const [periode, setPeriode] = useState(DEFAULT_PERIODE)
  const initialDates = useMemo(() => getPeriodDates(DEFAULT_PERIODE) || { debut: '', fin: '' }, [])
  const [dateDebut, setDateDebut] = useState(initialDates.debut)
  const [dateFin, setDateFin] = useState(initialDates.fin)
  const [comparaison, setComparaison] = useState('aucune')
  const [lieuId, setLieuId] = useState('all')
  const [service, setService] = useState('tout')

  // ── Layout widgets ───────────────────────────────────────────────────────
  const [layout, setLayout] = useState(null)
  const [showCustomize, setShowCustomize] = useState(false)

  // ── Données ──────────────────────────────────────────────────────────────
  const [lieux, setLieux] = useState([])
  const [rawCa, setRawCa] = useState([])
  const [rawCaCompare, setRawCaCompare] = useState([])
  // budgetByYear : { 2026: rows, 2025: rows } pour gérer périodes à cheval.
  const [budgetByYear, setBudgetByYear] = useState({})
  const [budgetByYearCompare, setBudgetByYearCompare] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // ── Auth + redirect role ─────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (cancelled) return
      if (!session) { router.replace('/'); return }
      setAuthReady(true)
    })()
    return () => { cancelled = true }
  }, [router])

  useEffect(() => {
    if (roleLoading || !role) return
    if (role !== 'admin' && role !== 'directeur') router.replace('/dashboard')
  }, [role, roleLoading, router])

  // ── Récup tenant client_id + lieux + layout (une seule fois) ─────────────
  useEffect(() => {
    if (!authReady) return
    let cancelled = false
    ;(async () => {
      const cid = await getClientId()
      if (!cid || cancelled) return
      setClientId(cid)
      const [lieuxRes, layoutRes] = await Promise.all([
        supabase
          .from('lieux_service')
          .select('id, nom, ordre')
          .eq('client_id', cid)
          .eq('actif', true)
          .order('ordre').order('nom'),
        getAnalysesLayout(),
      ])
      if (cancelled) return
      setLieux(lieuxRes.data || [])
      setLayout(layoutRes)
    })()
    return () => { cancelled = true }
  }, [authReady])

  // ── Recalcul des dates quand on change de période ────────────────────────
  function handlePeriode(p) {
    setPeriode(p)
    if (p !== 'custom') {
      const { debut, fin } = getPeriodDates(p) || { debut: dateDebut, fin: dateFin }
      setDateDebut(debut)
      setDateFin(fin)
    }
  }

  // ── Liste des années couvertes par une plage (pour la query budgets) ─────
  const yearsCovered = useCallback((debut, fin) => {
    const y0 = fromIsoDate(debut).getFullYear()
    const y1 = fromIsoDate(fin).getFullYear()
    const out = []
    for (let y = y0; y <= y1; y++) out.push(y)
    return out
  }, [])

  // ── Chargement des données pour la période courante ──────────────────────
  const loadData = useCallback(async () => {
    if (!clientId || !dateDebut || !dateFin) return
    setLoading(true)
    setError('')
    try {
      const compareRange = comparaison === 'n-1'
        ? shiftPeriodByYears({ debut: dateDebut, fin: dateFin }, -1)
        : null

      const years = yearsCovered(dateDebut, dateFin)
      const compareYears = compareRange ? yearsCovered(compareRange.debut, compareRange.fin) : []

      const caQuery = supabase
        .from('ca_journalier')
        .select('jour, service, lieu_service_id, couverts, ca_food, ca_bev_20, ca_bev_10, ca_autre')
        .eq('client_id', clientId)
        .gte('jour', dateDebut)
        .lte('jour', dateFin)

      const compareCaQuery = compareRange
        ? supabase
            .from('ca_journalier')
            .select('jour, service, lieu_service_id, couverts, ca_food, ca_bev_20, ca_bev_10, ca_autre')
            .eq('client_id', clientId)
            .gte('jour', compareRange.debut)
            .lte('jour', compareRange.fin)
        : Promise.resolve({ data: [], error: null })

      const budgetQuery = supabase
        .from('ca_budgets')
        .select('annee, mois, jour_semaine, lieu_service_id, service, ca_food_cible, ca_bev_20_cible, ca_bev_10_cible, ca_autre_cible')
        .eq('client_id', clientId)
        .in('annee', years)

      const compareBudgetQuery = compareYears.length > 0
        ? supabase
            .from('ca_budgets')
            .select('annee, mois, jour_semaine, lieu_service_id, service, ca_food_cible, ca_bev_20_cible, ca_bev_10_cible, ca_autre_cible')
            .eq('client_id', clientId)
            .in('annee', compareYears)
        : Promise.resolve({ data: [], error: null })

      const [caRes, compareCaRes, budgetRes, compareBudgetRes] = await Promise.all([
        caQuery, compareCaQuery, budgetQuery, compareBudgetQuery,
      ])
      if (caRes.error) throw caRes.error
      if (compareCaRes.error) throw compareCaRes.error
      if (budgetRes.error) throw budgetRes.error
      if (compareBudgetRes.error) throw compareBudgetRes.error

      const groupByYear = (rows) => rows.reduce((acc, r) => {
        ;(acc[r.annee] ||= []).push(r)
        return acc
      }, {})

      setRawCa(caRes.data || [])
      setRawCaCompare(compareCaRes.data || [])
      setBudgetByYear(groupByYear(budgetRes.data || []))
      setBudgetByYearCompare(groupByYear(compareBudgetRes.data || []))
    } catch (e) {
      setError(e.message || 'Erreur de chargement')
    } finally {
      setLoading(false)
    }
  }, [clientId, dateDebut, dateFin, comparaison, yearsCovered])

  useEffect(() => {
    if (clientId && dateDebut && dateFin) loadData()
  }, [clientId, dateDebut, dateFin, comparaison, loadData])

  // ── Filtrage côté JS sur lieu / service ──────────────────────────────────
  const filterRows = useCallback((rows) => {
    return rows.filter((r) => {
      if (lieuId !== 'all' && r.lieu_service_id !== lieuId) return false
      if (service !== 'tout' && r.service !== service) return false
      return true
    })
  }, [lieuId, service])

  const filterBudgets = useCallback((budgetRowsByYear) => {
    const out = {}
    for (const [annee, rows] of Object.entries(budgetRowsByYear)) {
      out[annee] = rows.filter((r) => {
        if (lieuId !== 'all' && r.lieu_service_id !== lieuId) return false
        if (service !== 'tout' && r.service !== service) return false
        return true
      })
    }
    return out
  }, [lieuId, service])

  // ── Totals + days + budget ───────────────────────────────────────────────
  const filteredRows = useMemo(() => filterRows(rawCa), [rawCa, filterRows])
  const filteredCompareRows = useMemo(() => filterRows(rawCaCompare), [rawCaCompare, filterRows])
  const filteredBudgetByYear = useMemo(() => filterBudgets(budgetByYear), [budgetByYear, filterBudgets])
  const filteredCompareBudgetByYear = useMemo(() => filterBudgets(budgetByYearCompare), [budgetByYearCompare, filterBudgets])

  const totals = useMemo(() => aggregateTotals(filteredRows), [filteredRows])
  const totalsCompare = useMemo(() => aggregateTotals(filteredCompareRows), [filteredCompareRows])
  const days = useMemo(() => aggregateByDay(filteredRows, dateDebut, dateFin), [filteredRows, dateDebut, dateFin])

  const periodBudget = useMemo(
    () => periodBudgetTotal(filteredBudgetByYear, dateDebut, dateFin),
    [filteredBudgetByYear, dateDebut, dateFin]
  )

  const compareBudgetRange = useMemo(
    () => comparaison === 'n-1' ? shiftPeriodByYears({ debut: dateDebut, fin: dateFin }, -1) : null,
    [comparaison, dateDebut, dateFin]
  )

  const periodBudgetCompare = useMemo(() => {
    if (!compareBudgetRange) return 0
    return periodBudgetTotal(filteredCompareBudgetByYear, compareBudgetRange.debut, compareBudgetRange.fin)
  }, [filteredCompareBudgetByYear, compareBudgetRange])

  // ── Comparison props injectés dans les KPIs ──────────────────────────────
  // - 'aucune' → pas de comparaison
  // - 'n-1' → cible = totaux N-1
  // - 'budget' → cible = totaux extrapolés depuis le budget de la période
  //   (on met ca_ttc_cible = budget agrégé, et on laisse les autres champs
  //   vides → seuls KpiCaTtc + KpiEcartBudgetPct affichent qqch d'utile)
  const comparisonTotals = useMemo(() => {
    if (comparaison === 'aucune') return null
    if (comparaison === 'n-1') return totalsCompare
    if (comparaison === 'budget') {
      // Budget ne distingue pas couverts/HT/TM → on n'expose que caTtc.
      // Les autres KPIs n'affichent pas de comparaison faute de cible utile.
      return { caTtc: periodBudget, couverts: null, caHt: null, tm: null }
    }
    return null
  }, [comparaison, totalsCompare, periodBudget])

  const comparisonLabel = comparaison === 'aucune' ? '' : (COMPARAISON_LABELS[comparaison] || '')

  // Pour le tableau jour-jour, on injecte le budget journalier dans chaque
  // jour en réutilisant periodBudgetTotal sur une seule date.
  const daysWithBudget = useMemo(() => {
    return days.map((d) => {
      const budget = periodBudgetTotal(filteredBudgetByYear, d.iso, d.iso)
      return { ...d, budget }
    })
  }, [days, filteredBudgetByYear])

  const tableauTotals = useMemo(() => {
    let lunchCouverts = 0, dinnerCouverts = 0, budget = 0
    for (const d of daysWithBudget) {
      lunchCouverts += d.lunchCouverts
      dinnerCouverts += d.dinnerCouverts
      budget += d.budget
    }
    return {
      ...totals,
      lunchCouverts, dinnerCouverts,
      bev20: totals.bev20, bev10: totals.bev10,
      budget,
    }
  }, [daysWithBudget, totals])

  // ── Rendu d'un widget par id ─────────────────────────────────────────────
  const renderWidget = (id) => {
    const common = { c, isMobile, totals, comparisonTotals, comparisonLabel }
    switch (id) {
      case 'kpi-couverts':         return <KpiCouverts {...common} />
      case 'kpi-ca-ttc':           return <KpiCaTtc {...common} />
      case 'kpi-ca-ht':            return <KpiCaHt {...common} />
      case 'kpi-tm':               return <KpiTm {...common} />
      case 'kpi-ecart-budget-pct': return <KpiEcartBudgetPct c={c} isMobile={isMobile} totals={totals} budget={periodBudget} />
      case 'section-tableau-jour-jour':
        return <SectionTableauJourJour c={c} isMobile={isMobile} days={daysWithBudget} totals={tableauTotals} />
      default: return null
    }
  }

  if (!authReady || !layout) {
    return (
      <div style={{
        minHeight: '100vh', background: c.fond,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: c.texteMuted, fontSize: 14,
      }}>
        Chargement…
      </div>
    )
  }

  // ── Layout splits (KPIs vs sections) ─────────────────────────────────────
  const visibleLayout = layout.filter((l) => l.visible && WIDGET_BY_ID[l.id] && isWidgetAvailable(WIDGET_BY_ID[l.id], modulesActifs))
  const kpiLayout = visibleLayout.filter((l) => WIDGET_BY_ID[l.id].size === 'kpi')
  const sectionLayout = visibleLayout.filter((l) => WIDGET_BY_ID[l.id].size !== 'kpi')

  const kpiCols = isMobile
    ? Math.min(Math.max(kpiLayout.length, 1), 2)
    : Math.min(Math.max(kpiLayout.length, 1), 5)

  return (
    <div style={{ minHeight: '100vh', background: c.fond }}>
      <Navbar section="cuisine" />
      <div style={{ padding: isMobile ? 16 : 24, maxWidth: 1300, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
          <div>
            <h1 style={{ margin: '0 0 4px', fontSize: isMobile ? 22 : 26, fontWeight: 600, color: c.texte }}>
              Analyses CA
            </h1>
            <p style={{ margin: 0, fontSize: 14, color: c.texteMuted }}>
              {humanRange(dateDebut, dateFin)}
            </p>
          </div>
          <button
            onClick={() => setShowCustomize(true)}
            title="Personnaliser mes analyses"
            style={{
              background: 'transparent', border: `0.5px solid ${c.bordure}`, color: c.texteMuted,
              borderRadius: 8, padding: '6px 12px', fontSize: 12, cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}
          >
            ⚙{isMobile ? '' : ' Personnaliser'}
          </button>
        </div>

        <FilterBar
          c={c} isMobile={isMobile}
          periode={periode} onPeriode={handlePeriode}
          dateDebut={dateDebut} dateFin={dateFin}
          onDateDebut={setDateDebut} onDateFin={setDateFin}
          comparaison={comparaison} onComparaison={setComparaison}
          lieux={lieux} lieuId={lieuId} onLieu={setLieuId}
          service={service} onService={setService}
        />

        {error && <p style={{ color: '#B91C1C', fontSize: 14, marginBottom: 16 }}>{error}</p>}
        {loading && <p style={{ color: c.texteMuted, fontSize: 14 }}>Chargement…</p>}

        {!loading && !error && kpiLayout.length > 0 && (
          <div style={{
            display: 'grid', gridTemplateColumns: `repeat(${kpiCols}, 1fr)`,
            gap: isMobile ? 10 : 16, marginBottom: 24,
          }}>
            {kpiLayout.map((l) => <div key={l.id}>{renderWidget(l.id)}</div>)}
          </div>
        )}

        {!loading && !error && sectionLayout.map((l) => (
          <div key={l.id} style={{ marginBottom: isMobile ? 12 : 16 }}>
            {renderWidget(l.id)}
          </div>
        ))}

        {showCustomize && (
          <WidgetsCustomizeModal
            c={c}
            initialLayout={layout}
            modulesActifs={modulesActifs}
            widgetById={WIDGET_BY_ID}
            defaultLayout={DEFAULT_LAYOUT}
            saveLayout={saveAnalysesLayout}
            resetLayout={resetAnalysesLayout}
            isWidgetAvailable={isWidgetAvailable}
            title="Personnaliser ma page Analyses"
            onClose={() => setShowCustomize(false)}
            onSaved={(next) => { setLayout(next); setShowCustomize(false) }}
          />
        )}
      </div>
    </div>
  )
}

function humanRange(debut, fin) {
  if (!debut || !fin) return ''
  if (debut === fin) return formatDate(debut)
  return `${formatDate(debut)} → ${formatDate(fin)}`
}

function formatDate(iso) {
  const d = fromIsoDate(iso)
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
}
