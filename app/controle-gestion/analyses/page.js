'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, getClientId, getParametres } from '../../../lib/supabase'
import { useIsMobile } from '../../../lib/useIsMobile'
import { useTheme } from '../../../lib/useTheme'
import { useTenant } from '../../../lib/useTenant'
import { useRole } from '../../../lib/useRole'
import { getSeuilsFromParams } from '../../../lib/foodCost'
import {
  getPeriodDates,
  shiftPeriodByYears,
  aggregateTotals,
  aggregateByDay,
  periodBudgetTotal,
  pickGranularity,
  bucketDays,
  perfByWeekday,
  mixSegments,
  topBottomDays,
  aggregateBySerie,
  buildBreakdown,
  mixByService,
  bucketDaysMultiSeries,
  perfByWeekdayMultiSeries,
  fromIsoDate,
} from '../../../lib/caAnalyses'
import {
  WIDGET_BY_ID,
  DEFAULT_LAYOUT,
  WIDGETS_REQUIRING_MARGES_DATA,
  isWidgetAvailable,
  getAnalysesLayout,
  saveAnalysesLayout,
  resetAnalysesLayout,
} from '../../../lib/analysesPreferences'
import {
  aggregateByFiche,
  computeMargesTotals,
  buildMargesChartData,
  computeConsoTheorique,
  computeMenuEngineering,
} from '../../../lib/margesData'
import { buildAnalysesWorkbook, buildFilename } from '../../../lib/analysesExport'
import * as XLSX from 'xlsx'
import Navbar from '../../../components/Navbar'
import WidgetsCustomizeModal from '../../../components/dashboard/WidgetsCustomizeModal'
import FilterBar, { COMPARAISON_LABELS, ALL_SERVICES, ALL_JOURS, JOUR_FR_LABELS } from '../../../components/analyses/FilterBar'
import KpiCouverts from '../../../components/analyses/widgets/KpiCouverts'
import KpiCaTtc from '../../../components/analyses/widgets/KpiCaTtc'
import KpiCaHt from '../../../components/analyses/widgets/KpiCaHt'
import KpiTm from '../../../components/analyses/widgets/KpiTm'
import KpiEcartBudgetPct from '../../../components/analyses/widgets/KpiEcartBudgetPct'
import SectionEvolutionCa from '../../../components/analyses/widgets/SectionEvolutionCa'
import SectionEvolutionCouverts from '../../../components/analyses/widgets/SectionEvolutionCouverts'
import SectionPerfJourSemaine from '../../../components/analyses/widgets/SectionPerfJourSemaine'
import SectionMixFoodBev from '../../../components/analyses/widgets/SectionMixFoodBev'
import SectionTopBottomJours from '../../../components/analyses/widgets/SectionTopBottomJours'
import SectionTableauJourJour from '../../../components/analyses/widgets/SectionTableauJourJour'
import KpiFoodCostMoyen from '../../../components/analyses/widgets/KpiFoodCostMoyen'
import KpiMargeBrute from '../../../components/analyses/widgets/KpiMargeBrute'
import SectionChartsMarges from '../../../components/analyses/widgets/SectionChartsMarges'
import SectionCaParFiche from '../../../components/analyses/widgets/SectionCaParFiche'
import SectionConsoIngredient from '../../../components/analyses/widgets/SectionConsoIngredient'

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
  // Multi-select : tableau d'ids cochés. Vide = "Tous" (équivalent à tout
  // cumulé). 1 entrée = filtre simple. 2+ entrées = mode multi-séries.
  const [lieuxSelected, setLieuxSelected] = useState([])
  const [servicesSelected, setServicesSelected] = useState([])
  // Jours de semaine ISO (1=lundi … 7=dimanche). Vide = tous les jours.
  // N'active pas le mode split — sert uniquement à filtrer (ex : "tous les
  // mardis du mois").
  const [joursSelected, setJoursSelected] = useState([])

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
  // Overrides nb_jours (fermetures exceptionnelles) configurés sur /budgets.
  // Stockés en Map<`${annee}_${mois}_${jds}`, nb_jours> pour lookup O(1).
  const [overridesNbJours, setOverridesNbJours] = useState(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Données marges (chargées paresseusement quand au moins un widget marges
  // est visible) — voir margesNeeded plus bas.
  const [params, setParams] = useState({})
  const [rawVentes, setRawVentes] = useState([])
  const [ficheById, setFicheById] = useState({})
  const [ficheIngsMap, setFicheIngsMap] = useState({})
  const [totalAchatsHT, setTotalAchatsHT] = useState(null)

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
          .select('id, nom, ordre, parent_lieu_service_id')
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

      // Overrides nb_jours (fermetures exceptionnelles) sur toutes les années
      // couvertes par la plage et la comparaison. Une seule query suffit, le
      // volume est petit (≤ 84 lignes/an = 12 mois × 7 jours).
      const overridesYears = Array.from(new Set([...years, ...compareYears]))
      const overridesQuery = overridesYears.length > 0
        ? supabase
            .from('ca_budget_jours_override')
            .select('annee, mois, jour_semaine, nb_jours')
            .eq('client_id', clientId)
            .in('annee', overridesYears)
        : Promise.resolve({ data: [], error: null })

      const [caRes, compareCaRes, budgetRes, compareBudgetRes, overridesRes] = await Promise.all([
        caQuery, compareCaQuery, budgetQuery, compareBudgetQuery, overridesQuery,
      ])
      if (caRes.error) throw caRes.error
      if (compareCaRes.error) throw compareCaRes.error
      if (budgetRes.error) throw budgetRes.error
      if (compareBudgetRes.error) throw compareBudgetRes.error
      if (overridesRes.error) throw overridesRes.error

      const groupByYear = (rows) => rows.reduce((acc, r) => {
        ;(acc[r.annee] ||= []).push(r)
        return acc
      }, {})

      const overridesMap = new Map()
      for (const o of overridesRes.data || []) {
        overridesMap.set(`${o.annee}_${o.mois}_${o.jour_semaine}`, Number(o.nb_jours))
      }

      setRawCa(caRes.data || [])
      setRawCaCompare(compareCaRes.data || [])
      setBudgetByYear(groupByYear(budgetRes.data || []))
      setBudgetByYearCompare(groupByYear(compareBudgetRes.data || []))
      setOverridesNbJours(overridesMap)
    } catch (e) {
      setError(e.message || 'Erreur de chargement')
    } finally {
      setLoading(false)
    }
  }, [clientId, dateDebut, dateFin, comparaison, yearsCovered])

  useEffect(() => {
    if (clientId && dateDebut && dateFin) loadData()
  }, [clientId, dateDebut, dateFin, comparaison, loadData])

  // ── Lazy load des données marges (uniquement si un widget marges visible) ─
  const margesNeeded = useMemo(() => {
    if (!layout) return false
    return layout.some((l) => l.visible && WIDGETS_REQUIRING_MARGES_DATA.has(l.id))
  }, [layout])

  const loadMargesData = useCallback(async () => {
    if (!clientId || !dateDebut || !dateFin) return
    try {
      const p = await getParametres()
      setParams(p)

      const { data: ventesRaw, error: vErr } = await supabase
        .from('ventes_journalieres')
        .select('fiche_id, quantite_vendue, prix_vente_net, jour')
        .eq('client_id', clientId)
        .gte('jour', dateDebut)
        .lte('jour', dateFin)
      if (vErr) throw vErr
      const ventes = ventesRaw || []
      const ficheIds = [...new Set(ventes.map((v) => v.fiche_id).filter(Boolean))]

      let ficheMap = {}
      let ingsMap = {}
      if (ficheIds.length > 0) {
        const [fichesRes, fiRes] = await Promise.all([
          supabase.from('fiches').select('id, nom, cout_portion, nb_portions, categorie').in('id', ficheIds),
          supabase
            .from('fiche_ingredients')
            .select('fiche_id, ingredient_id, quantite, unite, ingredients(id, nom)')
            .in('fiche_id', ficheIds)
            .eq('client_id', clientId),
        ])
        ficheMap = Object.fromEntries((fichesRes.data || []).map((f) => [f.id, f]))
        for (const fi of (fiRes.data || [])) {
          if (!ingsMap[fi.fiche_id]) ingsMap[fi.fiche_id] = []
          ingsMap[fi.fiche_id].push(fi)
        }
      }

      const { data: achatsRows } = await supabase
        .from('achats_lignes')
        .select('montant_ht, achats_factures!inner(date_facture)')
        .eq('client_id', clientId)
        .gte('achats_factures.date_facture', dateDebut)
        .lte('achats_factures.date_facture', dateFin)
      const sumAchats = (achatsRows || []).reduce((s, r) => s + (Number(r.montant_ht) || 0), 0)

      setRawVentes(ventes)
      setFicheById(ficheMap)
      setFicheIngsMap(ingsMap)
      setTotalAchatsHT(sumAchats)
    } catch (e) {
      // Erreurs marges silencieuses : les widgets affichent leurs empty
      // states et l'écran principal reste utilisable même si l'I/O foire.
      console.warn('Chargement marges impossible :', e?.message || e)
    }
  }, [clientId, dateDebut, dateFin])

  useEffect(() => {
    if (margesNeeded) loadMargesData()
  }, [margesNeeded, loadMargesData])

  // ── Filtrage côté JS sur lieu / service / jour (multi-select) ────────────
  // Vide = "Tous" → on ne filtre pas. Sinon on garde les rows dont la
  // dimension matche au moins une valeur sélectionnée.
  // Pour le filtre jours-de-semaine, on calcule le jsWeekday de la date r.jour
  // et on le compare (1 = lundi … 7 = dimanche en ISO).
  const filterJoursActive = joursSelected.length > 0 && joursSelected.length < ALL_JOURS.length
  const joursSet = useMemo(() => new Set(joursSelected), [joursSelected])

  // ── Grouping par parent_lieu_service_id ──────────────────────────────────
  // Certains lieux sont des enfants analytiques (ex : Table du chef →
  // Salle à manger). On les remap pour que les agrégations et le filtre
  // les groupent sous leur parent. Le FilterBar n'affiche que les parents
  // (les enfants sont implicitement inclus quand on filtre le parent).
  const lieuxAffiches = useMemo(() => lieux.filter((l) => !l.parent_lieu_service_id), [lieux])
  const lieuToParent = useMemo(() => {
    const m = new Map()
    for (const l of lieux) m.set(l.id, l.parent_lieu_service_id || l.id)
    return m
  }, [lieux])
  const remapRow = useCallback(
    (r) => ({ ...r, lieu_service_id: lieuToParent.get(r.lieu_service_id) || r.lieu_service_id }),
    [lieuToParent]
  )

  const filterRows = useCallback((rows) => {
    const filterLieu = lieuxSelected.length > 0 && lieuxSelected.length < lieuxAffiches.length
    const filterService = servicesSelected.length > 0 && servicesSelected.length < ALL_SERVICES.length
    if (!filterLieu && !filterService && !filterJoursActive) return rows.map(remapRow)
    const lieuxSet = new Set(lieuxSelected)
    const servicesSet = new Set(servicesSelected)
    return rows.reduce((acc, raw) => {
      const r = remapRow(raw)
      if (filterLieu && !lieuxSet.has(r.lieu_service_id)) return acc
      if (filterService && !servicesSet.has(r.service)) return acc
      if (filterJoursActive) {
        const date = new Date(`${r.jour}T00:00:00`)
        const isoJds = date.getDay() === 0 ? 7 : date.getDay()
        if (!joursSet.has(isoJds)) return acc
      }
      acc.push(r)
      return acc
    }, [])
  }, [lieuxSelected, servicesSelected, lieuxAffiches.length, filterJoursActive, joursSet, remapRow])

  const filterBudgets = useCallback((budgetRowsByYear) => {
    const filterLieu = lieuxSelected.length > 0 && lieuxSelected.length < lieuxAffiches.length
    const filterService = servicesSelected.length > 0 && servicesSelected.length < ALL_SERVICES.length
    const lieuxSet = new Set(lieuxSelected)
    const servicesSet = new Set(servicesSelected)
    const out = {}
    for (const [annee, rows] of Object.entries(budgetRowsByYear)) {
      out[annee] = rows.reduce((acc, raw) => {
        const r = remapRow(raw)
        if (filterLieu && !lieuxSet.has(r.lieu_service_id)) return acc
        if (filterService && !servicesSet.has(r.service)) return acc
        if (filterJoursActive && !joursSet.has(r.jour_semaine)) return acc
        acc.push(r)
        return acc
      }, [])
    }
    return out
  }, [lieuxSelected, servicesSelected, lieuxAffiches.length, filterJoursActive, joursSet, remapRow])

  // ── Totals + days + budget ───────────────────────────────────────────────
  const filteredRows = useMemo(() => filterRows(rawCa), [rawCa, filterRows])
  const filteredCompareRows = useMemo(() => filterRows(rawCaCompare), [rawCaCompare, filterRows])
  const filteredBudgetByYear = useMemo(() => filterBudgets(budgetByYear), [budgetByYear, filterBudgets])
  const filteredCompareBudgetByYear = useMemo(() => filterBudgets(budgetByYearCompare), [budgetByYearCompare, filterBudgets])

  const totals = useMemo(() => aggregateTotals(filteredRows), [filteredRows])
  const totalsCompare = useMemo(() => aggregateTotals(filteredCompareRows), [filteredCompareRows])

  // `days` couvre toute la plage [debut, fin]. Quand un filtre jours est
  // actif, on ne garde que les lignes dont le jour-de-semaine matche : utile
  // pour visualiser uniquement les mardis sur 1 mois, par exemple.
  const days = useMemo(() => {
    const all = aggregateByDay(filteredRows, dateDebut, dateFin)
    if (!filterJoursActive) return all
    return all.filter((d) => joursSet.has(d.isoJds))
  }, [filteredRows, dateDebut, dateFin, filterJoursActive, joursSet])

  const periodBudget = useMemo(
    () => periodBudgetTotal(filteredBudgetByYear, dateDebut, dateFin, filterJoursActive ? joursSet : null, overridesNbJours),
    [filteredBudgetByYear, dateDebut, dateFin, filterJoursActive, joursSet, overridesNbJours]
  )

  const compareBudgetRange = useMemo(
    () => comparaison === 'n-1' ? shiftPeriodByYears({ debut: dateDebut, fin: dateFin }, -1) : null,
    [comparaison, dateDebut, dateFin]
  )

  const periodBudgetCompare = useMemo(() => {
    if (!compareBudgetRange) return 0
    return periodBudgetTotal(filteredCompareBudgetByYear, compareBudgetRange.debut, compareBudgetRange.fin, filterJoursActive ? joursSet : null, overridesNbJours)
  }, [filteredCompareBudgetByYear, compareBudgetRange, filterJoursActive, joursSet, overridesNbJours])

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
  // jour en réutilisant periodBudgetTotal sur une seule date. Pas besoin de
  // passer joursSet ici : on est déjà filtré au niveau de `days`.
  const daysWithBudget = useMemo(() => {
    return days.map((d) => {
      const budget = periodBudgetTotal(filteredBudgetByYear, d.iso, d.iso, null, overridesNbJours)
      return { ...d, budget }
    })
  }, [days, filteredBudgetByYear, overridesNbJours])

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

  // ── Données dérivées pour les charts ─────────────────────────────────────
  const granularity = useMemo(() => pickGranularity(dateDebut, dateFin), [dateDebut, dateFin])
  const buckets = useMemo(() => bucketDays(daysWithBudget, granularity), [daysWithBudget, granularity])
  const perfWeekday = useMemo(() => perfByWeekday(daysWithBudget), [daysWithBudget])
  const mix = useMemo(() => mixSegments(totals, c), [totals, c])
  const topBottom = useMemo(() => topBottomDays(daysWithBudget, 5), [daysWithBudget])
  const hasBudget = periodBudget > 0

  // ── Mode multi-séries (split lieu / service) ─────────────────────────────
  // Le split est actif sur une dimension dès qu'au moins 2 entrées sont
  // sélectionnées. "Tous" (tableau vide) compte aussi comme split potentiel
  // si plusieurs valeurs existent — dans ce cas on split par défaut sur la
  // dimension lieu (plus parlant que service à 2 valeurs).
  // lieuxLabels = Map<id, label_du_parent_ou_self> — utilisé par les
  // helpers d'agrégation. Comme les rows sont déjà remappées vers le
  // parent, ce Map ne sert qu'à résoudre les labels (uniquement parents
  // apparaîtront).
  const lieuxLabels = useMemo(() => {
    const noms = new Map(lieux.map((l) => [l.id, l.nom]))
    const out = new Map()
    for (const l of lieux) {
      const parentId = l.parent_lieu_service_id || l.id
      out.set(l.id, noms.get(parentId) || l.nom)
    }
    return out
  }, [lieux])
  const splitByLieu = useMemo(() => {
    if (lieuxSelected.length >= 2) return true
    if (lieuxSelected.length === 0 && lieuxAffiches.length >= 2) return true // "Tous" + plusieurs lieux
    return false
  }, [lieuxSelected.length, lieuxAffiches.length])
  const splitByService = useMemo(() => {
    if (servicesSelected.length === ALL_SERVICES.length) return true
    if (servicesSelected.length === 0) return false // "Tous" mais pas split par défaut
    return false // 1 service sélectionné = pas de split
  }, [servicesSelected.length])

  const splitDims = useMemo(() => {
    const dims = []
    if (splitByLieu) dims.push('lieu')
    if (splitByService) dims.push('service')
    return dims
  }, [splitByLieu, splitByService])

  const isSplit = splitDims.length > 0

  // Séries agrégées sur la période entière : { 'Salle / Déjeuner': totals, … }
  const seriesByGroup = useMemo(
    () => aggregateBySerie(filteredRows, splitDims, lieuxLabels),
    [filteredRows, splitDims, lieuxLabels]
  )

  // Breakdowns 1D pour les KPIs (toujours calculés indépendamment du mode
  // multi-séries 2D — affichés en sous-titre de chaque KPI). On calcule par
  // métrique pour que chaque KPI affiche les bons pourcentages (couverts,
  // caTtc, caHt, tm).
  const seriesByLieu = useMemo(
    () => aggregateBySerie(filteredRows, ['lieu'], lieuxLabels),
    [filteredRows, lieuxLabels]
  )
  const seriesByService = useMemo(
    () => aggregateBySerie(filteredRows, ['service'], lieuxLabels),
    [filteredRows, lieuxLabels]
  )

  const breakdowns = useMemo(() => {
    const make = (metric) => ({
      byLieu: lieuxAffiches.length >= 2 ? buildBreakdown(seriesByLieu, metric) : null,
      byService: buildBreakdown(seriesByService, metric),
    })
    return {
      couverts: make('couverts'),
      caTtc: make('caTtc'),
      caHt: make('caHt'),
    }
  }, [seriesByLieu, seriesByService, lieuxAffiches.length])

  // Days par série (pour line charts multi-séries + perf jour-semaine)
  const daysBySerie = useMemo(() => {
    if (!isSplit) return null
    const groups = new Map()
    for (const r of filteredRows) {
      const parts = []
      if (splitByLieu) parts.push(lieuxLabels.get(r.lieu_service_id) || r.lieu_service_id || '—')
      if (splitByService) parts.push(r.service === 'lunch' ? 'Déjeuner' : 'Dîner')
      const key = parts.join(' / ')
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key).push(r)
    }
    const out = new Map()
    for (const [key, rows] of groups.entries()) {
      out.set(key, aggregateByDay(rows, dateDebut, dateFin))
    }
    return out
  }, [filteredRows, isSplit, splitByLieu, splitByService, lieuxLabels, dateDebut, dateFin])

  const bucketsMultiCa = useMemo(
    () => isSplit ? bucketDaysMultiSeries(daysBySerie, granularity, 'caTot') : null,
    [isSplit, daysBySerie, granularity]
  )
  const bucketsMultiCouverts = useMemo(
    () => isSplit ? bucketDaysMultiSeries(daysBySerie, granularity, 'couverts') : null,
    [isSplit, daysBySerie, granularity]
  )
  const perfMultiCa = useMemo(
    () => isSplit ? perfByWeekdayMultiSeries(daysBySerie, 'ca') : null,
    [isSplit, daysBySerie]
  )
  const mixServiceMatrix = useMemo(
    () => mixByService(filteredRows),
    [filteredRows]
  )

  // ── Données dérivées pour les widgets marges ─────────────────────────────
  const margesLignes = useMemo(() => aggregateByFiche(rawVentes, ficheById), [rawVentes, ficheById])
  const margesTotals = useMemo(() => computeMargesTotals(margesLignes), [margesLignes])
  const margesChartData = useMemo(() => buildMargesChartData(rawVentes, ficheById), [rawVentes, ficheById])
  const ficheNbPortions = useMemo(() => {
    const map = {}
    Object.entries(ficheById).forEach(([id, f]) => {
      if (f.nb_portions != null) map[id] = Number(f.nb_portions)
    })
    return map
  }, [ficheById])
  const consoLignes = useMemo(
    () => computeConsoTheorique(margesLignes, ficheIngsMap, ficheNbPortions),
    [margesLignes, ficheIngsMap, ficheNbPortions]
  )
  const menuEngineeringData = useMemo(() => computeMenuEngineering(margesLignes), [margesLignes])

  // Seuils food-cost depuis les paramètres établissement (mêmes seuils que
  // sur le dashboard cuisine, pour rester cohérent).
  const { seuilVert, seuilOrange } = useMemo(() => getSeuilsFromParams(params, 'cuisine'), [params])
  const margeColor = useCallback((pct) => {
    if (pct == null) return { bg: null, color: c.texte }
    const margeSeuilVert = 100 - seuilVert
    const margeSeuilOrange = 100 - seuilOrange
    if (pct >= margeSeuilVert) return { bg: '#EAF3DE', color: '#3B6D11' }
    if (pct >= margeSeuilOrange) return { bg: '#FAEEDA', color: '#854F0B' }
    return { bg: '#FCEBEB', color: '#A32D2D' }
  }, [c.texte, seuilVert, seuilOrange])

  // ── Rendu d'un widget par id ─────────────────────────────────────────────
  const renderWidget = (id) => {
    const common = { c, isMobile, totals, comparisonTotals, comparisonLabel }
    switch (id) {
      case 'kpi-couverts':         return <KpiCouverts {...common} breakdownByLieu={breakdowns.couverts.byLieu} breakdownByService={breakdowns.couverts.byService} />
      case 'kpi-ca-ttc':           return <KpiCaTtc {...common} breakdownByLieu={breakdowns.caTtc.byLieu} breakdownByService={breakdowns.caTtc.byService} />
      case 'kpi-ca-ht':            return <KpiCaHt {...common} breakdownByLieu={breakdowns.caHt.byLieu} breakdownByService={breakdowns.caHt.byService} />
      case 'kpi-tm':               return <KpiTm {...common} />
      case 'kpi-ecart-budget-pct': return <KpiEcartBudgetPct c={c} isMobile={isMobile} totals={totals} budget={periodBudget} />
      case 'section-evolution-ca':
        return <SectionEvolutionCa c={c} isMobile={isMobile} buckets={buckets} bucketsMulti={bucketsMultiCa} isSplit={isSplit} granularity={granularity} hasBudget={hasBudget} />
      case 'section-evolution-couverts':
        return <SectionEvolutionCouverts c={c} isMobile={isMobile} buckets={buckets} bucketsMulti={bucketsMultiCouverts} isSplit={isSplit} granularity={granularity} />
      case 'section-perf-jour-semaine':
        return <SectionPerfJourSemaine c={c} isMobile={isMobile} perf={perfWeekday} perfMulti={perfMultiCa} isSplit={isSplit} />
      case 'section-mix-food-bev':
        return <SectionMixFoodBev c={c} isMobile={isMobile} segments={mix} totalCaTtc={totals.caTtc} matrix={mixServiceMatrix} />
      case 'section-top-bottom-jours':
        return <SectionTopBottomJours c={c} isMobile={isMobile} topBottom={topBottom} />
      case 'section-tableau-jour-jour':
        return <SectionTableauJourJour c={c} isMobile={isMobile} days={daysWithBudget} totals={tableauTotals} isSplit={isSplit} splitByLieu={splitByLieu} splitByService={splitByService} filteredRows={filteredRows} lieuxLabels={lieuxLabels} filteredBudgetByYear={filteredBudgetByYear} overridesNbJours={overridesNbJours} />
      case 'kpi-food-cost-moyen':
        return (
          <KpiFoodCostMoyen
            c={c} isMobile={isMobile}
            foodCostPct={margesTotals.foodCostPct}
            nbFiches={margesLignes.filter((L) => L.coutMatiere != null).length}
            seuilVert={seuilVert} seuilOrange={seuilOrange}
          />
        )
      case 'kpi-marge-brute':
        return (
          <KpiMargeBrute
            c={c} isMobile={isMobile}
            margeBrute={margesTotals.margeBrute}
            margePct={margesTotals.margePct}
            foodCostPct={margesTotals.foodCostPct}
            seuilVert={seuilVert} seuilOrange={seuilOrange}
          />
        )
      case 'section-charts-marges':
        return <SectionChartsMarges chartData={margesChartData} menuEngineeringData={menuEngineeringData} />
      case 'section-ca-par-fiche':
        return <SectionCaParFiche c={c} lignes={margesLignes} margeColor={margeColor} />
      case 'section-conso-ingredient':
        return <SectionConsoIngredient c={c} consoLignes={consoLignes} hasVentes={margesLignes.length > 0} />
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

  // Groupement des sections en lignes : deux 'half' consécutives s'associent,
  // sinon chaque widget prend la pleine largeur. Même logique que /dashboard.
  const sectionRows = []
  {
    let i = 0
    while (i < sectionLayout.length) {
      const current = sectionLayout[i]
      const next = sectionLayout[i + 1]
      const currentSize = WIDGET_BY_ID[current.id].size
      const nextSize = next ? WIDGET_BY_ID[next.id].size : null
      if (currentSize === 'half' && nextSize === 'half') {
        sectionRows.push([current, next])
        i += 2
      } else {
        sectionRows.push([current])
        i += 1
      }
    }
  }

  // ── Actions TopBar : export Excel + impression ───────────────────────────
  const handleExportExcel = () => {
    const lieuLabel = lieuxSelected.length === 0 || lieuxSelected.length === lieuxAffiches.length
      ? 'Tous lieux'
      : lieuxSelected.map((id) => lieuxLabels.get(id) || id).join(', ')
    const serviceLabel = servicesSelected.length === 0 || servicesSelected.length === ALL_SERVICES.length
      ? 'tout'
      : servicesSelected.join('+')
    const joursLabel = !filterJoursActive
      ? 'Tous'
      : joursSelected.map((j) => JOUR_FR_LABELS[j]).join(', ')
    const visibleIds = new Set(visibleLayout.map((l) => l.id))
    const wb = buildAnalysesWorkbook({
      visibleIds,
      periode, dateDebut, dateFin, comparaison, lieuLabel, service: serviceLabel, joursLabel,
      totals, comparisonTotals, comparisonLabel, periodBudget,
      buckets, granularity, perfWeekday, mix, topBottom, daysWithBudget,
      // PR 5 — données marges (peuvent être à 0 si l'user n'a activé aucun
      // widget marges, mais on les passe systématiquement → l'export ne
      // dump que les onglets dont l'id figure dans visibleIds).
      margesTotals, margesLignes, consoLignes, margesChartData,
      // PR 6 — split lieu/service (pour ajouter la colonne Lieu/Service
      // dans les onglets concernés).
      isSplit, splitByLieu, splitByService,
      bucketsMultiCa, bucketsMultiCouverts, perfMulti: perfMultiCa,
      daysBySerieEntries: daysBySerie ? Array.from(daysBySerie.entries()) : null,
      mixServiceMatrix,
    })
    XLSX.writeFile(wb, buildFilename(dateDebut, dateFin))
  }

  const handlePrint = () => {
    if (typeof window !== 'undefined') window.print()
  }

  return (
    <div className="sk-analyses-page" style={{ minHeight: '100vh', background: c.fond }}>
      <div className="no-print">
        <Navbar section="cuisine" />
      </div>
      <div style={{ padding: isMobile ? 16 : 24, maxWidth: 1300, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
          <div>
            <h1 style={{ margin: '0 0 4px', fontSize: isMobile ? 22 : 26, fontWeight: 600, color: c.texte }}>
              Analyses CA
            </h1>
            <p style={{ margin: 0, fontSize: 14, color: c.texteMuted }}>
              {humanRange(dateDebut, dateFin)}
              {filterJoursActive && ` — uniquement ${joursSelected.map((j) => JOUR_FR_LABELS[j]).join(', ')}`}
              {isSplit && ` — détail par ${splitDims.map((d) => d === 'lieu' ? 'lieu' : 'service').join(' × ')}`}
            </p>
          </div>
          <div className="no-print" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              onClick={handleExportExcel}
              title="Exporter Excel (un onglet par widget visible)"
              style={actionBtnStyle(c)}
            >
              📥{isMobile ? '' : ' Excel'}
            </button>
            <button
              onClick={handlePrint}
              title="Imprimer la page"
              style={actionBtnStyle(c)}
            >
              🖨{isMobile ? '' : ' Imprimer'}
            </button>
            <button
              onClick={() => setShowCustomize(true)}
              title="Personnaliser mes analyses"
              style={actionBtnStyle(c)}
            >
              ⚙{isMobile ? '' : ' Personnaliser'}
            </button>
          </div>
        </div>

        <FilterBar
          c={c} isMobile={isMobile}
          periode={periode} onPeriode={handlePeriode}
          dateDebut={dateDebut} dateFin={dateFin}
          onDateDebut={setDateDebut} onDateFin={setDateFin}
          comparaison={comparaison} onComparaison={setComparaison}
          lieux={lieuxAffiches}
          lieuxSelected={lieuxSelected} onLieuxSelected={setLieuxSelected}
          servicesSelected={servicesSelected} onServicesSelected={setServicesSelected}
          joursSelected={joursSelected} onJoursSelected={setJoursSelected}
        />

        {error && <p style={{ color: '#B91C1C', fontSize: 14, marginBottom: 16 }}>{error}</p>}
        {loading && <p style={{ color: c.texteMuted, fontSize: 14 }}>Chargement…</p>}

        {!loading && !error && kpiLayout.length > 0 && (
          <div style={{
            display: 'grid', gridTemplateColumns: `repeat(${kpiCols}, 1fr)`,
            gap: isMobile ? 10 : 16, marginBottom: 24,
          }}>
            {kpiLayout.map((l) => <div key={l.id} className="sk-print-section">{renderWidget(l.id)}</div>)}
          </div>
        )}

        {!loading && !error && sectionRows.map((row, idx) => (
          <div
            key={row.map((r) => r.id).join('|')}
            style={{
              display: 'grid',
              gridTemplateColumns: isMobile || row.length === 1 ? '1fr' : '1fr 1fr',
              gap: isMobile ? 12 : 16,
              marginBottom: idx < sectionRows.length - 1 ? (isMobile ? 12 : 16) : 0,
            }}
          >
            {row.map((l) => <div key={l.id} className="sk-print-section">{renderWidget(l.id)}</div>)}
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

function actionBtnStyle(c) {
  return {
    background: 'transparent', border: `0.5px solid ${c.bordure}`, color: c.texteMuted,
    borderRadius: 8, padding: '6px 12px', fontSize: 12, cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', gap: 6,
  }
}
