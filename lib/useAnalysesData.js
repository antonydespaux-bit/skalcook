'use client'

// Hook de données pour la refonte Analyses (v2). Encapsule le fetch
// ca_journalier / ca_budgets / overrides + les dérivations nécessaires aux
// vues Synthèse et Détail. Porté de app/controle-gestion/analyses/page.js
// (périmètre v1 : pas de split multi-séries ni de données marges).
//
// Filtres en entrée (mêmes sémantiques que la page actuelle) :
//   - lieuxSelected / servicesSelected / joursSelected : [] = "Tous".
//   - comparaison : 'aucune' | 'n-1' | 'budget'.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase'
import {
  shiftPeriodByYears,
  aggregateTotals,
  aggregateByDay,
  periodBudgetTotal,
  pickGranularity,
  bucketDays,
  zipCompareBuckets,
  mixSegments,
  aggregateBySerie,
  buildBreakdown,
  fromIsoDate,
} from './caAnalyses'
import { buildElectedDatesMap } from './caJoursHelpers'
import { ALL_SERVICES, ALL_JOURS } from '../components/analyses/FilterBar'

export function useAnalysesData({
  c,
  clientId,
  dateDebut,
  dateFin,
  comparaison,
  lieux,
  lieuxSelected,
  servicesSelected,
  joursSelected,
}) {
  const [rawCa, setRawCa] = useState([])
  const [rawCaCompare, setRawCaCompare] = useState([])
  const [budgetByYear, setBudgetByYear] = useState({})
  const [budgetByYearCompare, setBudgetByYearCompare] = useState({})
  const [overridesNbJours, setOverridesNbJours] = useState(new Map())
  const [electedDatesMap, setElectedDatesMap] = useState(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const yearsCovered = useCallback((debut, fin) => {
    const y0 = fromIsoDate(debut).getFullYear()
    const y1 = fromIsoDate(fin).getFullYear()
    const out = []
    for (let y = y0; y <= y1; y++) out.push(y)
    return out
  }, [])

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
        .eq('client_id', clientId).gte('jour', dateDebut).lte('jour', dateFin)

      const compareCaQuery = compareRange
        ? supabase.from('ca_journalier')
            .select('jour, service, lieu_service_id, couverts, ca_food, ca_bev_20, ca_bev_10, ca_autre')
            .eq('client_id', clientId).gte('jour', compareRange.debut).lte('jour', compareRange.fin)
        : Promise.resolve({ data: [], error: null })

      const budgetQuery = supabase
        .from('ca_budgets')
        .select('annee, mois, jour_semaine, lieu_service_id, service, ca_food_cible, ca_bev_20_cible, ca_bev_10_cible, ca_autre_cible')
        .eq('client_id', clientId).in('annee', years)

      const compareBudgetQuery = compareYears.length > 0
        ? supabase.from('ca_budgets')
            .select('annee, mois, jour_semaine, lieu_service_id, service, ca_food_cible, ca_bev_20_cible, ca_bev_10_cible, ca_autre_cible')
            .eq('client_id', clientId).in('annee', compareYears)
        : Promise.resolve({ data: [], error: null })

      const overridesYears = Array.from(new Set([...years, ...compareYears]))
      const overridesQuery = overridesYears.length > 0
        ? supabase.from('ca_budget_jours_override')
            .select('annee, mois, jour_semaine, service, lieu_service_id, nb_jours')
            .eq('client_id', clientId).in('annee', overridesYears)
        : Promise.resolve({ data: [], error: null })

      const [caRes, compareCaRes, budgetRes, compareBudgetRes, overridesRes] = await Promise.all([
        caQuery, compareCaQuery, budgetQuery, compareBudgetQuery, overridesQuery,
      ])
      for (const r of [caRes, compareCaRes, budgetRes, compareBudgetRes, overridesRes]) {
        if (r.error) throw r.error
      }

      const groupByYear = (rows) => rows.reduce((acc, r) => {
        ;(acc[r.annee] ||= []).push(r)
        return acc
      }, {})

      const overridesMap = new Map()
      for (const o of overridesRes.data || []) {
        const svcKey = o.service ?? '__all__'
        const lieuKey = o.lieu_service_id ?? '__all__'
        overridesMap.set(`${o.annee}_${o.mois}_${o.jour_semaine}_${svcKey}_${lieuKey}`, Number(o.nb_jours))
      }

      setRawCa(caRes.data || [])
      setRawCaCompare(compareCaRes.data || [])
      setBudgetByYear(groupByYear(budgetRes.data || []))
      setBudgetByYearCompare(groupByYear(compareBudgetRes.data || []))
      setOverridesNbJours(overridesMap)
      setElectedDatesMap(buildElectedDatesMap(overridesRes.data || []))
    } catch (e) {
      setError(e.message || 'Erreur de chargement')
    } finally {
      setLoading(false)
    }
  }, [clientId, dateDebut, dateFin, comparaison, yearsCovered])

  useEffect(() => {
    if (clientId && dateDebut && dateFin) loadData()
  }, [clientId, dateDebut, dateFin, comparaison, loadData])

  // ── Remap lieux enfants → parent (regroupement analytique) ────────────────
  const lieuxAffiches = useMemo(() => lieux.filter((l) => !l.parent_lieu_service_id), [lieux])
  const lieuToParent = useMemo(() => {
    const m = new Map()
    for (const l of lieux) m.set(l.id, l.parent_lieu_service_id || l.id)
    return m
  }, [lieux])
  const lieuxLabels = useMemo(() => {
    const noms = new Map(lieux.map((l) => [l.id, l.nom]))
    const out = new Map()
    for (const l of lieux) out.set(l.id, noms.get(l.parent_lieu_service_id || l.id) || l.nom)
    return out
  }, [lieux])
  const remapRow = useCallback(
    (r) => ({ ...r, lieu_service_id: lieuToParent.get(r.lieu_service_id) || r.lieu_service_id }),
    [lieuToParent]
  )

  const filterJoursActive = joursSelected.length > 0 && joursSelected.length < ALL_JOURS.length
  const joursSet = useMemo(() => new Set(joursSelected), [joursSelected])

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
        const parentOrSelf = lieuToParent.get(raw.lieu_service_id) || raw.lieu_service_id
        if (filterLieu && !lieuxSet.has(parentOrSelf)) return acc
        if (filterService && !servicesSet.has(raw.service)) return acc
        if (filterJoursActive && !joursSet.has(raw.jour_semaine)) return acc
        acc.push({ ...raw, lieu_parent_id: parentOrSelf })
        return acc
      }, [])
    }
    return out
  }, [lieuxSelected, servicesSelected, lieuxAffiches.length, filterJoursActive, joursSet, lieuToParent])

  // ── Dérivations ───────────────────────────────────────────────────────────
  const filteredRows = useMemo(() => filterRows(rawCa), [rawCa, filterRows])
  const filteredCompareRows = useMemo(() => filterRows(rawCaCompare), [rawCaCompare, filterRows])
  const filteredBudgetByYear = useMemo(() => filterBudgets(budgetByYear), [budgetByYear, filterBudgets])
  const filteredCompareBudgetByYear = useMemo(() => filterBudgets(budgetByYearCompare), [budgetByYearCompare, filterBudgets])

  const totals = useMemo(() => aggregateTotals(filteredRows), [filteredRows])
  const totalsCompare = useMemo(() => aggregateTotals(filteredCompareRows), [filteredCompareRows])

  const days = useMemo(() => {
    const all = aggregateByDay(filteredRows, dateDebut, dateFin)
    if (!filterJoursActive) return all
    return all.filter((d) => joursSet.has(d.isoJds))
  }, [filteredRows, dateDebut, dateFin, filterJoursActive, joursSet])

  const compareRange = useMemo(
    () => comparaison === 'n-1' ? shiftPeriodByYears({ debut: dateDebut, fin: dateFin }, -1) : null,
    [comparaison, dateDebut, dateFin]
  )

  const compareDays = useMemo(() => {
    if (!compareRange) return null
    const all = aggregateByDay(filteredCompareRows, compareRange.debut, compareRange.fin)
    if (!filterJoursActive) return all
    return all.filter((d) => joursSet.has(d.isoJds))
  }, [filteredCompareRows, compareRange, filterJoursActive, joursSet])

  const periodBudget = useMemo(
    () => periodBudgetTotal(filteredBudgetByYear, dateDebut, dateFin, filterJoursActive ? joursSet : null, overridesNbJours, electedDatesMap),
    [filteredBudgetByYear, dateDebut, dateFin, filterJoursActive, joursSet, overridesNbJours, electedDatesMap]
  )

  const periodBudgetCompare = useMemo(() => {
    if (!compareRange) return 0
    return periodBudgetTotal(filteredCompareBudgetByYear, compareRange.debut, compareRange.fin, filterJoursActive ? joursSet : null, overridesNbJours, electedDatesMap)
  }, [filteredCompareBudgetByYear, compareRange, filterJoursActive, joursSet, overridesNbJours, electedDatesMap])

  const daysWithBudget = useMemo(() => days.map((d) => ({
    ...d,
    budget: periodBudgetTotal(filteredBudgetByYear, d.iso, d.iso, null, overridesNbJours, electedDatesMap),
  })), [days, filteredBudgetByYear, overridesNbJours, electedDatesMap])

  const compareDaysWithBudget = useMemo(() => {
    if (!compareDays) return null
    return compareDays.map((d) => ({
      ...d,
      budget: periodBudgetTotal(filteredCompareBudgetByYear, d.iso, d.iso, null, overridesNbJours, electedDatesMap),
    }))
  }, [compareDays, filteredCompareBudgetByYear, overridesNbJours, electedDatesMap])

  const granularity = useMemo(() => pickGranularity(dateDebut, dateFin), [dateDebut, dateFin])

  // Évolution (granularité auto) avec overlay N-1.
  const evolutionBuckets = useMemo(() => {
    const base = bucketDays(daysWithBudget, granularity)
    if (!compareDays) return base
    return zipCompareBuckets(base, bucketDays(compareDays, granularity))
  }, [daysWithBudget, granularity, compareDays])

  // Buckets mensuels (toujours par mois) pour CA cumulé + CA vs Objectif.
  const monthlyBuckets = useMemo(() => bucketDays(daysWithBudget, 'month'), [daysWithBudget])
  const monthlyCompare = useMemo(
    () => compareDays ? bucketDays(compareDays, 'month') : null,
    [compareDays]
  )

  // Cumulé : on aligne positionnellement N et N-1 par index de mois.
  const cumulBuckets = useMemo(() => {
    let accN = 0, accN1 = 0
    return monthlyBuckets.map((b, i) => {
      accN += b.caTot
      const n1 = monthlyCompare?.[i]
      if (n1) accN1 += n1.caTot
      return { key: b.key, label: b.label, caTot: accN, caTotN1: monthlyCompare ? accN1 : null }
    })
  }, [monthlyBuckets, monthlyCompare])

  const mix = useMemo(() => mixSegments(totals, c), [totals, c])
  const mixCompare = useMemo(
    () => comparaison === 'n-1' ? mixSegments(totalsCompare, c) : null,
    [comparaison, totalsCompare, c]
  )

  // Classement des lieux par CA TTC (sur les rows déjà filtrées/remappées).
  const classement = useMemo(() => {
    const series = aggregateBySerie(filteredRows, ['lieu'], lieuxLabels)
    return buildBreakdown(series, 'caTtc') // [{ serie, value, pct }] trié desc
  }, [filteredRows, lieuxLabels])
  const classementCompare = useMemo(() => {
    if (comparaison !== 'n-1') return null
    const series = aggregateBySerie(filteredCompareRows, ['lieu'], lieuxLabels)
    return buildBreakdown(series, 'caTtc')
  }, [comparaison, filteredCompareRows, lieuxLabels])

  const hasBudget = periodBudget > 0

  return {
    loading, error,
    totals, totalsCompare,
    periodBudget, periodBudgetCompare, hasBudget,
    granularity,
    evolutionBuckets, monthlyBuckets, monthlyCompare, cumulBuckets,
    mix, mixCompare, classement, classementCompare,
    daysWithBudget, compareDaysWithBudget,
    lieuxAffiches,
  }
}
