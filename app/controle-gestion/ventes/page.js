'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useTranslation } from 'react-i18next'
import { supabase, getClientId } from '../../../lib/supabase'
import { useIsMobile } from '../../../lib/useIsMobile'
import { useTheme } from '../../../lib/useTheme'
import Navbar from '../../../components/Navbar'
import { buildElectedDatesMap, isCellElectedForDate } from '../../../lib/caJoursHelpers'

const DEBUG_FALLBACK_CLIENT_ID = 'fa725e66-2cad-4ea4-892a-7eb3e90496a7'

function currentMonthIso() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function monthRange(monthIso) {
  const [y, m] = monthIso.split('-').map(Number)
  const debut = new Date(y, m - 1, 1)
  const fin = new Date(y, m, 0)
  const toIso = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return { debut: toIso(debut), fin: toIso(fin) }
}

function* eachDay(monthIso) {
  const [y, m] = monthIso.split('-').map(Number)
  const last = new Date(y, m, 0).getDate()
  for (let d = 1; d <= last; d++) {
    const date = new Date(y, m - 1, d)
    const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    yield { iso, day: d, weekday: date.getDay(), date }
  }
}

function formatEur(n, locale = 'fr') {
  if (n == null || isNaN(n) || n === 0) return '—'
  return new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
}

function formatEur2(n, locale = 'fr') {
  if (n == null || isNaN(n) || n === 0) return '—'
  return new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' }).format(n)
}

function formatDeltaEur(n, locale = 'fr') {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
    signDisplay: 'always',
  }).format(n)
}

// jsWeekday : 0 = dimanche … 6 = samedi (Date.getDay)
// jour_semaine ISO en BDD : 1 = lundi … 7 = dimanche
function jsWeekdayToIso(jsWeekday) {
  return jsWeekday === 0 ? 7 : jsWeekday
}

// Combien de fois `isoJds` (1=lundi … 7=dimanche) tombe dans `mois` de `annee`.
// Utilisé pour le Δ Budget total (équivalent à joursDansMois côté budgets).
function nbWeekdayInMonth(annee, mois, isoJds) {
  const lastDay = new Date(annee, mois, 0).getDate()
  let count = 0
  for (let d = 1; d <= lastDay; d++) {
    const date = new Date(annee, mois - 1, d)
    const dow = date.getDay() === 0 ? 7 : date.getDay()
    if (dow === isoJds) count++
  }
  return count
}

export default function VentesMensuelPage() {
  const router = useRouter()
  const { c } = useTheme()
  const isMobile = useIsMobile()
  const { t, i18n } = useTranslation()

  const [clientId, setClientId] = useState(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [mois, setMois] = useState(currentMonthIso())
  const [rawRows, setRawRows] = useState([])
  const [budgetRows, setBudgetRows] = useState([])
  // Overrides nb_jours par (mois, jds, service) — utilisé pour aligner le
  // TOTAL du mois sur le Récapitulatif annuel de la page Budgets.
  const [joursOverrideRows, setJoursOverrideRows] = useState([])
  // Lieux marqués `couverts_indicatifs` (= lieux Privat) : leur CA réel est
  // lissé sur le mois (cf. enveloppe privatisation ci-dessous).
  const [privatLieuIds, setPrivatLieuIds] = useState(() => new Set())
  // Enveloppe budgétaire privatisation du mois (montant forfaitaire global,
  // null si non saisie). Quand elle existe, le lissage privat est actif.
  const [privatBudgetMois, setPrivatBudgetMois] = useState(null)
  // Champ de saisie de l'enveloppe privatisation (string) + état d'envoi.
  const [privatInput, setPrivatInput] = useState('')
  const [savingPrivat, setSavingPrivat] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

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
    if (!clientId || !mois) return
    setLoading(true)
    setError('')
    try {
      const { debut, fin } = monthRange(mois)
      const [y, m] = mois.split('-').map(Number)
      const [caRes, budgetRes, overrideRes, lieuxRes, privatRes] = await Promise.all([
        supabase
          .from('ca_journalier')
          .select('jour, lieu_service_id, service, couverts, ca_food, ca_bev_20, ca_bev_10, ca_autre')
          .eq('client_id', clientId)
          .gte('jour', debut)
          .lte('jour', fin),
        supabase
          .from('ca_budgets')
          .select(
            'mois, jour_semaine, lieu_service_id, service, ca_food_cible, ca_bev_20_cible, ca_bev_10_cible, ca_autre_cible'
          )
          .eq('client_id', clientId)
          .eq('annee', y)
          // mois IN (NULL, m) — couvre les défauts + override mensuel
          .or(`mois.is.null,mois.eq.${m}`),
        supabase
          .from('ca_budget_jours_override')
          .select('annee, mois, jour_semaine, service, lieu_service_id, nb_jours')
          .eq('client_id', clientId)
          .eq('annee', y)
          .eq('mois', m),
        // Lieux Privat (couverts_indicatifs) : leur CA réel est lissé sur le mois.
        supabase
          .from('lieux_service')
          .select('id')
          .eq('client_id', clientId)
          .eq('couverts_indicatifs', true),
        // Enveloppe budgétaire privatisation du mois (0 ou 1 ligne).
        supabase
          .from('ca_budget_privatisations')
          .select('montant')
          .eq('client_id', clientId)
          .eq('annee', y)
          .eq('mois', m)
          .maybeSingle(),
      ])
      if (caRes.error) throw caRes.error
      if (budgetRes.error) throw budgetRes.error
      if (overrideRes.error) throw overrideRes.error
      if (lieuxRes.error) throw lieuxRes.error
      if (privatRes.error) throw privatRes.error
      setRawRows(caRes.data || [])
      setBudgetRows(budgetRes.data || [])
      setJoursOverrideRows(overrideRes.data || [])
      setPrivatLieuIds(new Set((lieuxRes.data || []).map((l) => l.id)))
      // null = pas d'enveloppe saisie → lissage privat inactif (comportement
      // historique inchangé). Une ligne (même montant 0) active le lissage.
      setPrivatBudgetMois(privatRes.data ? Number(privatRes.data.montant || 0) : null)
    } catch (e) {
      setError(e.message || t('cgVentes.common.loadError'))
    } finally {
      setLoading(false)
    }
  }, [clientId, mois, t])

  useEffect(() => {
    if (authChecked) loadData()
  }, [authChecked, loadData])

  // Synchronise le champ de saisie avec l'enveloppe chargée pour le mois.
  useEffect(() => {
    setPrivatInput(privatBudgetMois == null ? '' : String(privatBudgetMois))
  }, [privatBudgetMois, mois])

  // Enregistre (ou efface) l'enveloppe budgétaire privatisation du mois.
  // Champ vide → on supprime la ligne (lissage désactivé pour ce mois).
  const savePrivatBudget = useCallback(async () => {
    if (!clientId || !mois) return
    setSavingPrivat(true)
    setError('')
    try {
      const [y, m] = mois.split('-').map(Number)
      const trimmed = privatInput.trim()
      if (trimmed === '') {
        const { error: delErr } = await supabase
          .from('ca_budget_privatisations')
          .delete()
          .eq('client_id', clientId)
          .eq('annee', y)
          .eq('mois', m)
        if (delErr) throw delErr
      } else {
        const montant = Number(trimmed.replace(',', '.'))
        if (!Number.isFinite(montant) || montant < 0) {
          throw new Error('Montant de privatisation invalide.')
        }
        const { error: upErr } = await supabase
          .from('ca_budget_privatisations')
          .upsert(
            { client_id: clientId, annee: y, mois: m, montant },
            { onConflict: 'client_id,annee,mois' }
          )
        if (upErr) throw upErr
      }
      await loadData()
    } catch (e) {
      setError(e.message || t('cgVentes.common.loadError'))
    } finally {
      setSavingPrivat(false)
    }
  }, [clientId, mois, privatInput, loadData, t])

  const days = useMemo(() => {
    const byDay = new Map()
    for (const r of rawRows) {
      const key = r.jour
      if (!byDay.has(key)) {
        byDay.set(key, {
          lunchCouverts: 0,
          dinnerCouverts: 0,
          food: 0,
          bev_20: 0,
          bev_10: 0,
          autre: 0,
          // privatReal : CA réel des lieux Privat ce jour-là. Servira à le
          // retirer du jour réel pour le lisser sur le mois (écart au budget).
          privatReal: 0,
        })
      }
      const acc = byDay.get(key)
      const cv = Number(r.couverts || 0)
      if (r.service === 'lunch') acc.lunchCouverts += cv
      else acc.dinnerCouverts += cv
      const rowFood = Number(r.ca_food || 0)
      const rowBev20 = Number(r.ca_bev_20 || 0)
      const rowBev10 = Number(r.ca_bev_10 || 0)
      const rowAutre = Number(r.ca_autre || 0)
      acc.food += rowFood
      acc.bev_20 += rowBev20
      acc.bev_10 += rowBev10
      acc.autre += rowAutre
      if (privatLieuIds.has(r.lieu_service_id)) {
        acc.privatReal += rowFood + rowBev20 + rowBev10 + rowAutre
      }
    }
    const result = []
    for (const d of eachDay(mois)) {
      const agg = byDay.get(d.iso) || {
        lunchCouverts: 0,
        dinnerCouverts: 0,
        food: 0,
        bev_20: 0,
        bev_10: 0,
        autre: 0,
        privatReal: 0,
      }
      const couvertsTot = agg.lunchCouverts + agg.dinnerCouverts
      const caTot = agg.food + agg.bev_20 + agg.bev_10 + agg.autre
      result.push({
        ...d,
        ...agg,
        couvertsTot,
        caTot,
        tm: couvertsTot > 0 ? caTot / couvertsTot : null,
        hasData: caTot > 0 || couvertsTot > 0,
      })
    }
    return result
  }, [rawRows, mois, privatLieuIds])

  // Lissage des privatisations sur le mois.
  // Actif uniquement si une enveloppe budgétaire privatisation est saisie pour
  // le mois (privatBudgetMois != null) — sinon comportement historique.
  // On répartit également, sur tous les jours calendaires du mois :
  //   - le budget privatisation (montant forfaitaire / nbJours)
  //   - le CA réel des lieux Privat (total mois / nbJours)
  // → l'écart au budget ne fait plus de pic le jour de l'event, et le cumul
  //   mensuel reste exact.
  const privatLissage = useMemo(() => {
    const active = privatBudgetMois != null
    const nbDays = days.length
    const realMonth = days.reduce((s, d) => s + (d.privatReal || 0), 0)
    const budgetMonth = active ? Number(privatBudgetMois || 0) : 0
    return {
      active,
      nbDays,
      realMonth,
      budgetMonth,
      realPerDay: active && nbDays > 0 ? realMonth / nbDays : 0,
      budgetPerDay: active && nbDays > 0 ? budgetMonth / nbDays : 0,
    }
  }, [days, privatBudgetMois])

  // Budget journalier par date ISO du mois affiché.
  // Override mensuel (mois = m) prioritaire sur le défaut (mois = NULL) au
  // niveau de la cellule (jds, lieu, service).
  // Pour les overrides par lieu (ex : « Privat = 1 mardi/mois »), seules
  // les N dernières occurrences du jour-de-semaine reçoivent le budget de
  // la cellule (cf. caJoursHelpers.isCellElectedForDate). Les autres mardis
  // affichent 0 pour cette cellule → le cumul mensuel reste cohérent avec
  // `monthlyBudgetAligned` et la coloration jour-par-jour reste juste.
  const budgetByDateIso = useMemo(() => {
    const [yStr, mStr] = mois.split('-')
    const annee = Number(yStr)
    const monthNum = Number(mStr)
    const cellMap = new Map() // key = `${jds}_${lieu}_${svc}`
    for (const b of budgetRows) {
      // Seul le mois courant (override) ou le défaut annuel (mois = null) compte.
      // Une cellule d'un autre mois précis ne doit jamais servir de fallback,
      // sinon le budget d'un mois fuite sur un autre (ex : Privat de mai en juin).
      if (b.mois !== monthNum && b.mois != null) continue
      const key = `${b.jour_semaine}_${b.lieu_service_id}_${b.service}`
      if (b.mois === monthNum) {
        cellMap.set(key, b)
      } else if (!cellMap.has(key)) {
        cellMap.set(key, b)
      }
    }
    const electedMap = buildElectedDatesMap(joursOverrideRows)
    const out = new Map() // key = iso date → total budget
    for (const d of days) {
      const isoJds = jsWeekdayToIso(d.weekday)
      let total = 0
      for (const cell of cellMap.values()) {
        if (cell.jour_semaine !== isoJds) continue
        // Lissage actif : les cellules budget des lieux Privat sont ignorées
        // ici (le budget privat passe par l'enveloppe lissée) pour éviter le
        // double comptage.
        if (privatLissage.active && privatLieuIds.has(cell.lieu_service_id)) continue
        if (!isCellElectedForDate(cell, d.iso, annee, monthNum, electedMap)) continue
        total +=
          Number(cell.ca_food_cible || 0) +
          Number(cell.ca_bev_20_cible || 0) +
          Number(cell.ca_bev_10_cible || 0) +
          Number(cell.ca_autre_cible || 0)
      }
      // Part lissée du budget privatisation (0 si lissage inactif).
      total += privatLissage.budgetPerDay
      out.set(d.iso, total)
    }
    return out
  }, [budgetRows, joursOverrideRows, mois, days, privatLissage, privatLieuIds])

  const daysWithBudget = useMemo(() => {
    return days.map((d) => {
      // caTotEcart : CA du jour utilisé pour l'écart au budget. Quand le
      // lissage est actif, on retire le CA privat réel du jour et on le
      // remplace par la part lissée → plus de pic le jour de l'event.
      // (La colonne CA total affichée reste, elle, le CA réel honnête.)
      const caTotEcart = privatLissage.active
        ? d.caTot - (d.privatReal || 0) + privatLissage.realPerDay
        : d.caTot
      return { ...d, budget: budgetByDateIso.get(d.iso) || 0, caTotEcart }
    })
  }, [days, budgetByDateIso, privatLissage])

  // Cumul "Month to date" par jour : réel cumulé − budget cumulé sur les jours
  // déjà saisis, jusqu'à ce jour inclus. Alimente la colonne Month to date
  // (vrai running total coloré par ligne, distinct de l'écart du jour).
  const daysWithMtd = useMemo(() => {
    let cumReal = 0
    let cumBudget = 0
    return daysWithBudget.map((d) => {
      if (d.hasData) {
        cumReal += d.caTotEcart
        cumBudget += d.budget
      }
      return { ...d, mtdReal: cumReal, mtdBudget: cumBudget }
    })
  }, [daysWithBudget])

  // Budget MENSUEL aligné sur le Récapitulatif annuel de la page Budgets :
  // - Ne prend que les cellules ca_budgets avec mois = monthNum (ignore les
  //   défauts mois = NULL — la page Budgets non plus ne les affiche pas).
  // - Multiplie chaque cellule par nbJours(mois, jds, svc) avec respect de
  //   l'override par service (table ca_budget_jours_override).
  // Volontairement différent de la somme jour-par-jour de daysWithBudget,
  // qui utilise le compte calendaire strict — la coloration par jour reste
  // basée sur le calendrier (un mardi = un mardi, on ne peut pas le couper).
  const monthlyBudgetAligned = useMemo(() => {
    const [yStr, mStr] = mois.split('-')
    const annee = Number(yStr)
    const monthNum = Number(mStr)
    // Index overrides : Map<`${jds}_${svc}_${lieuId|__all__}`, nb_jours>
    // L'override par lieu est prioritaire sur l'override global (lieu=null)
    // qui est prioritaire sur le compte calendaire.
    const overrideMap = new Map()
    for (const o of joursOverrideRows) {
      if (o.mois !== monthNum) continue
      const lieuKey = o.lieu_service_id || '__all__'
      overrideMap.set(`${o.jour_semaine}_${o.service}_${lieuKey}`, Number(o.nb_jours))
    }
    const lookupNbre = (jds, svc, lieuId) => {
      const k1 = `${jds}_${svc}_${lieuId}`
      if (overrideMap.has(k1)) return overrideMap.get(k1)
      const k2 = `${jds}_${svc}___all__`
      if (overrideMap.has(k2)) return overrideMap.get(k2)
      return nbWeekdayInMonth(annee, monthNum, jds)
    }
    let total = 0
    for (const b of budgetRows) {
      // On ignore le fallback mois=NULL : on ne compte que les cellules
      // explicitement définies pour ce mois (cohérent avec /budgets).
      if (b.mois !== monthNum) continue
      // Lissage actif : budget privat des lieux Privat exclu ici (remplacé par
      // l'enveloppe ajoutée plus bas) pour éviter le double comptage.
      if (privatLissage.active && privatLieuIds.has(b.lieu_service_id)) continue
      const cellTotal =
        Number(b.ca_food_cible || 0) +
        Number(b.ca_bev_20_cible || 0) +
        Number(b.ca_bev_10_cible || 0) +
        Number(b.ca_autre_cible || 0)
      if (cellTotal === 0) continue
      const nbre = lookupNbre(b.jour_semaine, b.service, b.lieu_service_id)
      total += nbre * cellTotal
    }
    // Enveloppe privatisation du mois entier (0 si lissage inactif).
    total += privatLissage.budgetMonth
    return total
  }, [budgetRows, joursOverrideRows, mois, privatLissage, privatLieuIds])

  const monthTotals = useMemo(() => {
    const t = {
      lunchCouverts: 0,
      dinnerCouverts: 0,
      food: 0,
      bev_20: 0,
      bev_10: 0,
      autre: 0,
      // mtdBudget : budget cumulé sur les jours déjà saisis (= somme des
      // budgets journaliers calendaires pour chaque jour avec hasData=true).
      // Permet de comparer au CA réel cumulé "à date renseignée" (Month to
      // date) : l'écart représente la position vs budget sur les seuls
      // jours pour lesquels on a de la data.
      mtdBudget: 0,
      // caTotEcartMtd : CA réel cumulé "lissé privat" sur les jours saisis.
      // = caTot tant que le lissage est inactif.
      caTotEcartMtd: 0,
    }
    for (const d of daysWithBudget) {
      t.lunchCouverts += d.lunchCouverts
      t.dinnerCouverts += d.dinnerCouverts
      t.food += d.food
      t.bev_20 += d.bev_20
      t.bev_10 += d.bev_10
      t.autre += d.autre
      if (d.hasData) {
        t.mtdBudget += d.budget
        t.caTotEcartMtd += d.caTotEcart
      }
    }
    const couvertsTot = t.lunchCouverts + t.dinnerCouverts
    const caTot = t.food + t.bev_20 + t.bev_10 + t.autre
    return {
      ...t,
      couvertsTot,
      caTot,
      // budget total mois entier (aligné avec le Récap annuel, overrides
      // respectés). Sert pour la colonne "Δ Mois total".
      budget: monthlyBudgetAligned,
      tm: couvertsTot > 0 ? caTot / couvertsTot : null,
    }
  }, [daysWithBudget, monthlyBudgetAligned])

  if (!authChecked) return null

  return (
    <div style={{ minHeight: '100vh', background: c.fond }}>
      <Navbar section="cuisine" />
      <div style={{ padding: isMobile ? 16 : 24, maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ marginBottom: 16 }}>
          <h1 style={{ margin: '0 0 4px', fontSize: isMobile ? 22 : 26, fontWeight: 600, color: c.texte }}>
            {t('cgVentes.dashboard.title')}
          </h1>
          <p style={{ margin: 0, fontSize: 14, color: c.texteMuted }}>
            {t('cgVentes.dashboard.subtitle')}
          </p>
        </div>

        <div
          style={{
            display: 'flex',
            gap: 12,
            alignItems: 'center',
            flexWrap: 'wrap',
            marginBottom: 16,
          }}
        >
          <label style={{ fontSize: 13, color: c.texte }}>{t('cgVentes.dashboard.monthLabel')}</label>
          <input
            type="month"
            value={mois}
            onChange={(e) => setMois(e.target.value)}
            style={{
              padding: '7px 10px',
              borderRadius: 8,
              border: `1px solid ${c.bordure}`,
              background: c.blanc,
              color: c.texte,
              fontSize: 13,
            }}
          />
          <label
            style={{ fontSize: 13, color: c.texte, marginLeft: 8 }}
            title="Budget privatisations du mois (lissé sur tous les jours). Vide = lissage désactivé."
          >
            Privatisations (budget du mois)
          </label>
          <input
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            value={privatInput}
            onChange={(e) => setPrivatInput(e.target.value)}
            placeholder="€ / mois"
            style={{
              width: 110,
              padding: '7px 10px',
              borderRadius: 8,
              border: `1px solid ${c.bordure}`,
              background: c.blanc,
              color: c.texte,
              fontSize: 13,
            }}
          />
          <button
            onClick={savePrivatBudget}
            disabled={savingPrivat || privatInput.trim() === String(privatBudgetMois ?? '')}
            style={{
              padding: '8px 14px',
              borderRadius: 8,
              fontSize: 13,
              border: 'none',
              background: c.accent,
              color: c.texte,
              fontWeight: 600,
              cursor: savingPrivat ? 'default' : 'pointer',
              opacity:
                savingPrivat || privatInput.trim() === String(privatBudgetMois ?? '') ? 0.5 : 1,
            }}
          >
            {savingPrivat ? '…' : t('cgVentes.common.save', 'Enregistrer')}
          </button>
          <div style={{ flex: 1 }} />
          <Link
            href="/controle-gestion/ventes/budgets"
            style={{
              padding: '8px 14px',
              borderRadius: 8,
              fontSize: 13,
              border: `1px solid ${c.bordure}`,
              background: c.blanc,
              color: c.texte,
              textDecoration: 'none',
              fontWeight: 500,
            }}
          >
            {t('cgVentes.dashboard.budgetsLink')}
          </Link>
          <Link
            href="/controle-gestion/ventes/saisie"
            style={{
              padding: '8px 14px',
              borderRadius: 8,
              fontSize: 13,
              border: `1px solid ${c.bordure}`,
              background: c.blanc,
              color: c.texte,
              textDecoration: 'none',
              fontWeight: 500,
            }}
          >
            {t('cgVentes.dashboard.addDayLink')}
          </Link>
        </div>

        {error && <p style={{ color: '#B91C1C', fontSize: 14, marginBottom: 16 }}>{error}</p>}

        {loading && <p style={{ color: c.texteMuted, fontSize: 14 }}>{t('cgVentes.common.loading')}</p>}

        {!loading && privatLissage.active && (
          <div
            style={{
              marginBottom: 16,
              padding: '10px 14px',
              borderRadius: 10,
              border: `1px solid ${c.bordure}`,
              background: c.fond,
              fontSize: 13,
              color: c.texteMuted,
              lineHeight: 1.5,
            }}
          >
            <strong style={{ color: c.texte }}>Privatisations lissées sur le mois.</strong>{' '}
            Budget {formatEur(privatLissage.budgetMonth, i18n.language || 'fr')} et réel{' '}
            {formatEur(privatLissage.realMonth, i18n.language || 'fr')} répartis également sur{' '}
            {privatLissage.nbDays} jours ({formatEur2(privatLissage.budgetPerDay, i18n.language || 'fr')}/jour
            de budget). Les colonnes <em>Δ</em> sont lissées ; la colonne <em>CA total</em> reste le CA réel
            du jour.
          </div>
        )}

        {!loading && (
          <MonthTable
            days={daysWithMtd}
            totals={monthTotals}
            mois={mois}
            isMobile={isMobile}
            c={c}
            t={t}
            locale={i18n.language || 'fr'}
          />
        )}
      </div>
    </div>
  )
}

function MonthTable({ days, totals, mois, isMobile, c, t, locale }) {
  const cellPad = isMobile ? '8px 6px' : '10px 12px'
  const headPad = isMobile ? '10px 6px' : '12px 12px'
  const baseFont = isMobile ? 12 : 13
  const head = {
    padding: headPad,
    fontSize: baseFont - 1,
    fontWeight: 600,
    color: c.texteMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    textAlign: 'right',
    background: c.fond,
    borderBottom: `1px solid ${c.bordure}`,
    whiteSpace: 'nowrap',
    // Sticky sous la Navbar (hauteur 56px) : on laisse les libellés visibles
    // pendant qu'on scrolle dans le tableau du mois.
    position: 'sticky',
    top: 56,
    zIndex: 1,
  }
  const cell = {
    padding: cellPad,
    fontSize: baseFont,
    color: c.texte,
    textAlign: 'right',
    borderBottom: `1px solid ${c.bordure}`,
    whiteSpace: 'nowrap',
  }
  // Pas de wrapper overflow : la sticky du thead a besoin que son ancêtre
  // direct ne soit pas un scroll-container (overflowX:auto force overflowY
  // en auto par spec et casse la sticky verticale). Sur mobile, le scroll
  // horizontal se fait au niveau du body si la largeur dépasse le viewport.
  return (
    <div
      style={{
        background: c.blanc,
        borderRadius: 12,
        border: `0.5px solid ${c.bordure}`,
      }}
    >
      <div>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
          <thead>
            <tr>
              <th style={{ ...head, textAlign: 'left' }}>{t('cgVentes.dashboard.colDate')}</th>
              <th style={{ ...head, textAlign: 'left' }}>{t('cgVentes.dashboard.colDay')}</th>
              <th style={head}>{t('cgVentes.dashboard.colCoversLunch')}</th>
              <th style={head}>{t('cgVentes.dashboard.colCoversDinner')}</th>
              <th style={head}>{t('cgVentes.common.caFood')}</th>
              <th style={head}>{t('cgVentes.dashboard.colCaAlcool')}</th>
              <th style={head}>{t('cgVentes.dashboard.colCaSoft')}</th>
              <th style={head}>{t('cgVentes.dashboard.colOther')}</th>
              <th style={head}>{t('cgVentes.dashboard.colCaTotal')}</th>
              <th style={head}>{t('cgVentes.dashboard.colObjectif')}</th>
              <th style={head} title={t('cgVentes.dashboard.dayDeltaTooltip')}>{t('cgVentes.dashboard.colDayDelta')}</th>
              <th style={head} title={t('cgVentes.dashboard.mtdTooltip')}>{t('cgVentes.dashboard.colMtd')}</th>
              <th style={head}>{t('cgVentes.common.tm')}</th>
              <th style={head}></th>
            </tr>
          </thead>
          <tbody>
            {days.map((d) => (
              <tr
                key={d.iso}
                style={{
                  background: d.weekday === 0 || d.weekday === 6 ? c.fond : 'transparent',
                  opacity: d.hasData ? 1 : 0.55,
                }}
              >
                <td style={{ ...cell, textAlign: 'left', fontWeight: 500 }}>
                  {String(d.day).padStart(2, '0')}
                </td>
                <td style={{ ...cell, textAlign: 'left', color: c.texteMuted }}>
                  {d.date.toLocaleDateString(locale, { weekday: 'short' })}
                </td>
                <td style={cell}>{d.lunchCouverts || '—'}</td>
                <td style={cell}>{d.dinnerCouverts || '—'}</td>
                <td style={cell}>{formatEur(d.food, locale)}</td>
                <td style={cell}>{formatEur(d.bev_20, locale)}</td>
                <td style={cell}>{formatEur(d.bev_10, locale)}</td>
                <td style={cell}>{formatEur(d.autre, locale)}</td>
                <td style={{ ...cell, fontWeight: 600 }}>{formatEur(d.caTot, locale)}</td>
                <td style={{ ...cell, color: c.texteMuted }}>
                  {d.budget ? formatEur(d.budget, locale) : '—'}
                </td>
                <td style={budgetCellStyle(d, cell, c)} title={budgetCellTitle(d, t, locale)}>
                  {budgetCellLabel(d, locale)}
                </td>
                <td style={mtdRowCellStyle(d, cell, c)} title={mtdRowCellTitle(d, t, locale)}>
                  {mtdRowCellLabel(d, locale)}
                </td>
                <td style={cell}>{formatEur2(d.tm, locale)}</td>
                <td style={{ ...cell, padding: '4px 8px' }}>
                  <Link
                    href={`/controle-gestion/ventes/saisie?date=${d.iso}`}
                    style={{
                      fontSize: baseFont - 1,
                      color: c.texteMuted,
                      textDecoration: 'none',
                      padding: '4px 8px',
                      borderRadius: 6,
                      border: `1px solid ${c.bordure}`,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {d.hasData ? t('cgVentes.common.edit') : t('cgVentes.common.enter')}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ background: c.fond, fontWeight: 600 }}>
              <td style={{ ...cell, textAlign: 'left' }} colSpan={2}>
                {t('cgVentes.dashboard.totalMonth', { mois })}
              </td>
              <td style={cell}>{totals.lunchCouverts || '—'}</td>
              <td style={cell}>{totals.dinnerCouverts || '—'}</td>
              <td style={cell}>{formatEur(totals.food, locale)}</td>
              <td style={cell}>{formatEur(totals.bev_20, locale)}</td>
              <td style={cell}>{formatEur(totals.bev_10, locale)}</td>
              <td style={cell}>{formatEur(totals.autre, locale)}</td>
              <td style={{ ...cell, fontWeight: 700 }}>{formatEur(totals.caTot, locale)}</td>
              <td style={{ ...cell, fontWeight: 700, color: c.texteMuted }}>
                {totals.budget ? formatEur(totals.budget, locale) : '—'}
              </td>
              <td style={{ ...cell, color: c.texteMuted }}>—</td>
              <td style={mtdCellStyle(totals, cell, c)} title={mtdCellTitle(totals, t, locale)}>
                {mtdCellLabel(totals, locale)}
              </td>
              <td style={cell}>{formatEur2(totals.tm, locale)}</td>
              <td style={cell}></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

// Couleur cellule Δ Budget : vert si réel ≥ budget, rouge si < 95 %, orange entre,
// gris si pas de budget cible ou pas de saisie ce jour-là.
function budgetTone(real, budget, hasData) {
  if (!budget) return 'none'
  if (!hasData) return 'none'
  if (real >= budget) return 'success'
  if (real < budget * 0.95) return 'danger'
  return 'warning'
}

function tonePalette(tone, c) {
  if (tone === 'success') return { color: c.vert, bg: c.vertClair }
  if (tone === 'danger') return { color: c.rouge, bg: c.rougeClair }
  if (tone === 'warning') return { color: c.orange, bg: c.orangeClair }
  return { color: c.texteMuted, bg: 'transparent' }
}

function budgetCellStyle(d, base, c) {
  // caTotEcart = CA du jour lissé privat (= caTot si lissage inactif).
  const tone = budgetTone(d.caTotEcart, d.budget, d.hasData)
  const { color, bg } = tonePalette(tone, c)
  return { ...base, color, background: bg, fontWeight: tone === 'none' ? 400 : 600 }
}

function budgetCellLabel(d, locale = 'fr') {
  if (!d.budget || !d.hasData) return '—'
  return formatDeltaEur(d.caTotEcart - d.budget, locale)
}

function budgetCellTitle(d, t, locale = 'fr') {
  if (!d.budget) return t('cgVentes.dashboard.budgetCellNoBudget')
  const ratio = d.caTotEcart > 0 ? (d.caTotEcart / d.budget) * 100 : 0
  return t('cgVentes.dashboard.budgetCellTitle', {
    real: formatEur(d.caTotEcart, locale),
    budget: formatEur(d.budget, locale),
    ratio: ratio.toFixed(0),
  })
}

// Month to date : compare le réel cumulé sur les jours déjà saisis au
// budget cumulé pour ces mêmes jours. Plus parlant en cours de mois qu'une
// comparaison contre le mois entier (qui sera toujours très négative tant
// qu'on n'a pas atteint la fin du mois).
function mtdCellStyle(totals, base, c) {
  const tone = budgetTone(totals.caTotEcartMtd, totals.mtdBudget, totals.caTotEcartMtd > 0)
  const { color, bg } = tonePalette(tone, c)
  return { ...base, color, background: bg, fontWeight: tone === 'none' ? 600 : 700 }
}

function mtdCellLabel(totals, locale = 'fr') {
  if (!totals.mtdBudget || totals.caTotEcartMtd === 0) return '—'
  return formatDeltaEur(totals.caTotEcartMtd - totals.mtdBudget, locale)
}

function mtdCellTitle(totals, t, locale = 'fr') {
  if (!totals.mtdBudget) return t('cgVentes.dashboard.mtdCellNoBudget')
  const ratio = totals.caTotEcartMtd > 0 ? (totals.caTotEcartMtd / totals.mtdBudget) * 100 : 0
  return t('cgVentes.dashboard.mtdCellTitle', {
    real: formatEur(totals.caTotEcartMtd, locale),
    budget: formatEur(totals.mtdBudget, locale),
    ratio: ratio.toFixed(0),
  })
}

// Month to date (par jour) : cumul réel − cumul budget jusqu'à ce jour inclus
// sur les seuls jours saisis. Même code couleur que l'écart au budget.
function mtdRowCellStyle(d, base, c) {
  const tone = budgetTone(d.mtdReal, d.mtdBudget, d.hasData)
  const { color, bg } = tonePalette(tone, c)
  return { ...base, color, background: bg, fontWeight: tone === 'none' ? 400 : 600 }
}

function mtdRowCellLabel(d, locale = 'fr') {
  if (!d.hasData || !d.mtdBudget) return '—'
  return formatDeltaEur(d.mtdReal - d.mtdBudget, locale)
}

function mtdRowCellTitle(d, t, locale = 'fr') {
  if (!d.mtdBudget) return t('cgVentes.dashboard.mtdCellNoBudget')
  const ratio = d.mtdReal > 0 ? (d.mtdReal / d.mtdBudget) * 100 : 0
  return t('cgVentes.dashboard.mtdCellTitle', {
    real: formatEur(d.mtdReal, locale),
    budget: formatEur(d.mtdBudget, locale),
    ratio: ratio.toFixed(0),
  })
}
