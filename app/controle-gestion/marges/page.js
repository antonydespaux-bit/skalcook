'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, getClientId, getParametres } from '../../../lib/supabase'
import { useIsMobile } from '../../../lib/useIsMobile'
import { useTheme } from '../../../lib/useTheme'
import { getSeuilsFromParams } from '../../../lib/foodCost'
import Navbar from '../../../components/Navbar'
import {
  AreaChart, Area, BarChart, Bar, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'

/** Fallback temporaire si `getClientId()` est vide (debug multi-établissement). */
const DEBUG_FALLBACK_CLIENT_ID = 'fa725e66-2cad-4ea4-892a-7eb3e90496a7'

// ─── Helpers de date ─────────────────────────────────────────────────────────

function toIsoDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function getPeriodDates(periode) {
  const today = new Date()
  if (periode === '7j') {
    const start = new Date(today)
    start.setDate(start.getDate() - 6)
    return { debut: toIsoDate(start), fin: toIsoDate(today) }
  }
  if (periode === '30j') {
    const start = new Date(today)
    start.setDate(start.getDate() - 29)
    return { debut: toIsoDate(start), fin: toIsoDate(today) }
  }
  if (periode === 'mois-precedent') {
    const firstOfThisMonth = new Date(today.getFullYear(), today.getMonth(), 1)
    const lastOfPrevMonth = new Date(firstOfThisMonth - 1)
    const firstOfPrevMonth = new Date(lastOfPrevMonth.getFullYear(), lastOfPrevMonth.getMonth(), 1)
    return { debut: toIsoDate(firstOfPrevMonth), fin: toIsoDate(lastOfPrevMonth) }
  }
  return null
}

// ─── Helpers de formatage ─────────────────────────────────────────────────────

function formatEuro(n) {
  if (n == null || Number.isNaN(n)) return '—'
  return `${Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
}

function formatPct(n) {
  if (n == null || Number.isNaN(n)) return '—'
  return `${Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`
}

// ─── Logique d'agrégation ────────────────────────────────────────────────────

function aggregateByFiche(rawVentes, ficheById) {
  const map = new Map()
  for (const row of rawVentes) {
    const fid = row.fiche_id
    const q = Number(row.quantite_vendue) || 0
    const pu = Number(row.prix_vente_net) || 0
    const fiche = ficheById[fid] ?? null
    const nom = fiche?.nom ?? (fid ? `Fiche non trouvée (${fid})` : '—')
    const coutPortion = fiche?.cout_portion != null ? Number(fiche.cout_portion) : null
    const categorie = fiche?.categorie ?? null

    if (!map.has(fid)) {
      map.set(fid, { fiche_id: fid, designation: nom, categorie, quantiteVendue: 0, caNet: 0, coutPortion })
    }
    const agg = map.get(fid)
    agg.quantiteVendue += q
    agg.caNet += q * pu
    if (nom && fid) agg.designation = nom
    if (agg.coutPortion == null && coutPortion != null) agg.coutPortion = coutPortion
    if (agg.categorie == null && categorie != null) agg.categorie = categorie
  }

  return Array.from(map.values())
    .map((r) => {
      const coutMatiere = r.coutPortion != null ? r.quantiteVendue * r.coutPortion : null
      const margeBrute = coutMatiere != null ? r.caNet - coutMatiere : null
      const margePct = margeBrute != null && r.caNet > 0 ? (margeBrute / r.caNet) * 100 : null
      return { ...r, coutMatiere, margeBrute, margePct }
    })
    .sort((a, b) => a.designation.localeCompare(b.designation, 'fr'))
}

function buildChartData(rawVentes, ficheById) {
  const byDay = new Map()
  for (const row of rawVentes) {
    const jour = row.jour
    if (!jour) continue
    const q = Number(row.quantite_vendue) || 0
    const pu = Number(row.prix_vente_net) || 0
    const fiche = ficheById[row.fiche_id] ?? null
    const coutPortion = fiche?.cout_portion != null ? Number(fiche.cout_portion) : 0
    if (!byDay.has(jour)) byDay.set(jour, { ca: 0, cout: 0 })
    const d = byDay.get(jour)
    d.ca += q * pu
    d.cout += q * coutPortion
  }
  return Array.from(byDay.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([jour, vals]) => ({
      date: jour.slice(5).replace('-', '/'),
      ca: Math.round(vals.ca * 100) / 100,
      cout: Math.round(vals.cout * 100) / 100,
    }))
}

// ─── Composant principal ─────────────────────────────────────────────────────

export default function MargesDashboardPage() {
  const router = useRouter()
  const isMobile = useIsMobile()
  const { c } = useTheme()

  const [authReady, setAuthReady] = useState(false)
  const [clientId, setClientId] = useState(null)
  const [params, setParams] = useState({})

  // Période
  const [periode, setPeriode] = useState('30j')
  const [dateDebut, setDateDebut] = useState(() => getPeriodDates('30j').debut)
  const [dateFin, setDateFin] = useState(() => getPeriodDates('30j').fin)

  // Données
  const [rawVentes, setRawVentes] = useState([])
  const [ficheById, setFicheById] = useState({})
  const [ficheIngsMap, setFicheIngsMap] = useState({})
  const [totalAchatsHT, setTotalAchatsHT] = useState(null)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Tableau
  const [filtreCategorie, setFiltreCategorie] = useState('all')
  const [triColonne, setTriColonne] = useState('designation')
  const [triSens, setTriSens] = useState('asc')

  // ── Auth ────────────────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (cancelled) return
        if (!session) { router.replace('/'); return }
        setAuthReady(true)
      } catch {
        if (!cancelled) router.replace('/')
      }
    })()
    return () => { cancelled = true }
  }, [router])

  // ── Changement de période ────────────────────────────────────────────────────

  function handlePeriode(p) {
    setPeriode(p)
    if (p !== 'custom') {
      const { debut, fin } = getPeriodDates(p)
      setDateDebut(debut)
      setDateFin(fin)
    }
  }

  // ── Chargement des données ───────────────────────────────────────────────────

  const loadData = useCallback(async (debut, fin) => {
    setError('')
    setLoading(true)
    let cid = await getClientId()
    if (!cid) {
      console.warn('getClientId vide — fallback debug:', DEBUG_FALLBACK_CLIENT_ID)
      cid = DEBUG_FALLBACK_CLIENT_ID
    }
    setClientId(cid)

    const p = await getParametres()
    setParams(p)

    // 1. Ventes sur la période
    const { data: ventesRaw, error: vErr } = await supabase
      .from('ventes_journalieres')
      .select('fiche_id, quantite_vendue, prix_vente_net, jour')
      .eq('client_id', cid)
      .gte('jour', debut)
      .lte('jour', fin)

    if (vErr) {
      setError(vErr.message || 'Impossible de charger les ventes.')
      setRawVentes([])
      setFicheById({})
      setFicheIngsMap({})
      setTotalAchatsHT(null)
      setLoading(false)
      return
    }

    const ventes = ventesRaw || []
    const ficheIds = [...new Set(ventes.map((v) => v.fiche_id).filter(Boolean))]

    let ficheMap = {}
    let ingsMap = {}

    if (ficheIds.length > 0) {
      // 2. Fiches (avec catégorie)
      const { data: fichesRows } = await supabase
        .from('fiches')
        .select('id, nom, cout_portion, nb_portions, categorie')
        .in('id', ficheIds)

      ficheMap = Object.fromEntries((fichesRows || []).map((f) => [f.id, f]))

      // 3. Compositions
      const { data: fiRows } = await supabase
        .from('fiche_ingredients')
        .select('fiche_id, ingredient_id, quantite, unite, ingredients(id, nom)')
        .in('fiche_id', ficheIds)
        .eq('client_id', cid)

      for (const fi of (fiRows || [])) {
        if (!ingsMap[fi.fiche_id]) ingsMap[fi.fiche_id] = []
        ingsMap[fi.fiche_id].push(fi)
      }
    }

    // 4. Achats sur la période
    const { data: achatsRows } = await supabase
      .from('achats_lignes')
      .select('montant_ht, achats_factures!inner(date_facture)')
      .eq('client_id', cid)
      .gte('achats_factures.date_facture', debut)
      .lte('achats_factures.date_facture', fin)

    const sumAchats = (achatsRows || []).reduce((s, r) => s + (Number(r.montant_ht) || 0), 0)

    setRawVentes(ventes)
    setFicheById(ficheMap)
    setFicheIngsMap(ingsMap)
    setTotalAchatsHT(sumAchats)
    setLoading(false)
  }, [])

  useEffect(() => {
    if (!authReady) return
    loadData(dateDebut, dateFin)
  }, [authReady, dateDebut, dateFin, loadData])

  // ── Données calculées ────────────────────────────────────────────────────────

  const lignes = useMemo(() => aggregateByFiche(rawVentes, ficheById), [rawVentes, ficheById])

  const totaux = useMemo(() => {
    let q = 0, ca = 0, cout = 0, caAvecCout = 0
    for (const L of lignes) {
      q += L.quantiteVendue
      ca += L.caNet
      if (L.coutMatiere != null) { cout += L.coutMatiere; caAvecCout += L.caNet }
    }
    const margeBrute = ca > 0 && caAvecCout > 0 ? caAvecCout - cout : null
    const margePct = margeBrute != null && caAvecCout > 0 ? (margeBrute / caAvecCout) * 100 : null
    return { quantiteVendue: q, caNet: ca, coutMatiere: cout > 0 ? cout : null, margeBrute, margePct, caAvecCout }
  }, [lignes])

  const coveragePct = useMemo(() => {
    if (!totaux.caNet || totaux.caNet === 0) return null
    return (totaux.caAvecCout / totaux.caNet) * 100
  }, [totaux])

  const chartData = useMemo(() => buildChartData(rawVentes, ficheById), [rawVentes, ficheById])

  const top10Data = useMemo(() => {
    return [...lignes]
      .filter((L) => L.margePct != null)
      .sort((a, b) => b.margePct - a.margePct)
      .slice(0, 10)
      .map((L) => ({ nom: L.designation.slice(0, 22), marge: Math.round(L.margePct * 10) / 10 }))
      .reverse()
  }, [lignes])

  const categories = useMemo(() => {
    const cats = [...new Set(lignes.map((L) => L.categorie).filter(Boolean))]
    return cats.sort()
  }, [lignes])

  const lignesFiltrees = useMemo(() => {
    let rows = filtreCategorie === 'all' ? lignes : lignes.filter((L) => L.categorie === filtreCategorie)
    return [...rows].sort((a, b) => {
      let va = a[triColonne], vb = b[triColonne]
      if (triColonne === 'designation') {
        va = va ?? ''
        vb = vb ?? ''
        const cmp = va.localeCompare(vb, 'fr')
        return triSens === 'asc' ? cmp : -cmp
      }
      va = va ?? -Infinity
      vb = vb ?? -Infinity
      return triSens === 'asc' ? va - vb : vb - va
    })
  }, [lignes, filtreCategorie, triColonne, triSens])

  // ── Seuils couleur (food cost = 100 - marge) ─────────────────────────────────

  const { seuilVert, seuilOrange } = getSeuilsFromParams(params, 'cuisine')
  // Seuils food cost → seuils marge (inverser)
  const margeSeuilVert = 100 - seuilVert     // ex : 100 - 28 = 72%
  const margeSeuilOrange = 100 - seuilOrange  // ex : 100 - 35 = 65%

  function margeColor(pct) {
    if (pct == null) return { bg: null, color: c.texte }
    if (pct >= margeSeuilVert) return { bg: '#EAF3DE', color: '#3B6D11' }
    if (pct >= margeSeuilOrange) return { bg: '#FAEEDA', color: '#854F0B' }
    return { bg: '#FCEBEB', color: '#A32D2D' }
  }

  function barColor(marge) {
    if (marge >= margeSeuilVert) return '#3B6D11'
    if (marge >= margeSeuilOrange) return '#854F0B'
    return '#A32D2D'
  }

  // ── Tri tableau ─────────────────────────────────────────────────────────────

  function handleTri(col) {
    if (triColonne === col) {
      setTriSens(triSens === 'asc' ? 'desc' : 'asc')
    } else {
      setTriColonne(col)
      setTriSens(col === 'designation' ? 'asc' : 'desc')
    }
  }

  function sortIndicator(col) {
    if (triColonne !== col) return ''
    return triSens === 'asc' ? ' ▲' : ' ▼'
  }

  // ── Rendu ────────────────────────────────────────────────────────────────────

  if (!authReady) {
    return (
      <div style={{ minHeight: '100vh', background: c.fond, display: 'flex', alignItems: 'center', justifyContent: 'center', color: c.texteMuted, fontSize: 14 }}>
        Chargement…
      </div>
    )
  }

  const th = {
    padding: isMobile ? '10px 8px' : '12px 14px',
    textAlign: 'left',
    fontWeight: 600,
    fontSize: 12,
    color: c.texteMuted,
    borderBottom: `1px solid ${c.bordure}`,
    whiteSpace: 'nowrap',
  }
  const thNum = { ...th, textAlign: 'right', cursor: 'pointer', userSelect: 'none' }
  const thSort = { ...th, cursor: 'pointer', userSelect: 'none' }
  const td = { padding: isMobile ? '10px 8px' : '12px 14px', fontSize: 14, color: c.texte, borderBottom: `1px solid ${c.bordure}` }
  const tdNum = { ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }
  const tdMuted = { ...tdNum, color: c.texteMuted }

  const periodes = [
    { id: '7j', label: '7 jours' },
    { id: '30j', label: '30 jours' },
    { id: 'mois-precedent', label: 'Mois dernier' },
    { id: 'custom', label: 'Personnalisé' },
  ]

  const margePctVal = totaux.margePct
  const margeCardColors = margeColor(margePctVal)
  const coverageCardColors = coveragePct == null ? { bg: null, color: c.texte }
    : coveragePct >= 80 ? { bg: '#EAF3DE', color: '#3B6D11' }
    : { bg: '#FAEEDA', color: '#854F0B' }

  return (
    <div style={{ minHeight: '100vh', background: c.fond }}>
      <Navbar section="cuisine" />
      <div style={{ padding: isMobile ? '16px' : '24px', maxWidth: '1200px', margin: '0 auto' }}>

        {/* ── En-tête ── */}
        <h1 style={{ margin: '0 0 4px', fontSize: isMobile ? 22 : 26, fontWeight: 600, color: c.texte }}>
          Dashboard Marges
        </h1>
        <p style={{ margin: '0 0 20px', fontSize: 14, color: c.texteMuted }}>
          Analyse des marges sur ventes — CA, coût matière et rentabilité par plat.
        </p>

        {/* ── Sélecteur de période ── */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 20 }}>
          {periodes.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => handlePeriode(id)}
              style={{
                padding: '7px 14px',
                borderRadius: 8,
                border: `1px solid ${periode === id ? c.accent : c.bordure}`,
                background: periode === id ? c.accent : c.blanc,
                color: periode === id ? '#fff' : c.texte,
                fontSize: 13,
                fontWeight: periode === id ? 600 : 400,
                cursor: 'pointer',
              }}
            >
              {label}
            </button>
          ))}

          {periode === 'custom' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginLeft: 4 }}>
              <input
                type="date"
                value={dateDebut}
                onChange={(e) => setDateDebut(e.target.value)}
                style={{ padding: '7px 10px', borderRadius: 8, border: `1px solid ${c.bordure}`, background: c.blanc, color: c.texte, fontSize: 13 }}
              />
              <span style={{ fontSize: 13, color: c.texteMuted }}>→</span>
              <input
                type="date"
                value={dateFin}
                onChange={(e) => setDateFin(e.target.value)}
                style={{ padding: '7px 10px', borderRadius: 8, border: `1px solid ${c.bordure}`, background: c.blanc, color: c.texte, fontSize: 13 }}
              />
            </div>
          )}
        </div>

        {error && (
          <p style={{ color: '#B91C1C', fontSize: 14, marginBottom: 16 }}>{error}</p>
        )}

        {loading && (
          <p style={{ color: c.texteMuted, fontSize: 14, marginBottom: 24 }}>Chargement des données…</p>
        )}

        {!loading && !error && clientId && (
          <>
            {/* ── KPI Cards ── */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)',
              gap: isMobile ? 10 : 16,
              marginBottom: 24,
            }}>
              {/* CA Total */}
              <div style={{ background: c.accentClair, borderRadius: 12, padding: isMobile ? 14 : 20, border: `0.5px solid ${c.bordure}` }}>
                <div style={{ fontSize: 11, color: c.texteMuted, fontWeight: 500, textTransform: 'uppercase', marginBottom: 8 }}>CA Total (HT)</div>
                <div style={{ fontSize: isMobile ? 24 : 32, fontWeight: 600, color: c.accent }}>
                  {formatEuro(totaux.caNet)}
                </div>
                <div style={{ fontSize: 11, color: c.texteMuted, marginTop: 4 }}>
                  {lignes.length} plat{lignes.length !== 1 ? 's' : ''} vendus
                </div>
              </div>

              {/* Marge Théorique */}
              <div style={{ background: margeCardColors.bg ?? c.blanc, borderRadius: 12, padding: isMobile ? 14 : 20, border: `0.5px solid ${c.bordure}` }}>
                <div style={{ fontSize: 11, color: c.texteMuted, fontWeight: 500, textTransform: 'uppercase', marginBottom: 8 }}>Marge Théorique</div>
                <div style={{ fontSize: isMobile ? 24 : 32, fontWeight: 600, color: margeCardColors.color }}>
                  {formatPct(margePctVal)}
                </div>
                <div style={{ fontSize: 11, color: c.texteMuted, marginTop: 4 }}>Basée sur les fiches techniques</div>
              </div>

              {/* Coût Matière */}
              <div style={{ background: c.blanc, borderRadius: 12, padding: isMobile ? 14 : 20, border: `0.5px solid ${c.bordure}` }}>
                <div style={{ fontSize: 11, color: c.texteMuted, fontWeight: 500, textTransform: 'uppercase', marginBottom: 8 }}>Coût Matière</div>
                <div style={{ fontSize: isMobile ? 24 : 32, fontWeight: 600, color: c.texte }}>
                  {formatEuro(totaux.coutMatiere)}
                </div>
                <div style={{ fontSize: 11, color: c.texteMuted, marginTop: 4 }}>
                  {totalAchatsHT != null && totalAchatsHT > 0 ? `Achats réels : ${formatEuro(totalAchatsHT)}` : 'Depuis les fiches techniques'}
                </div>
              </div>

              {/* Indice de Performance */}
              <div style={{ background: coverageCardColors.bg ?? c.blanc, borderRadius: 12, padding: isMobile ? 14 : 20, border: `0.5px solid ${c.bordure}` }}>
                <div style={{ fontSize: 11, color: c.texteMuted, fontWeight: 500, textTransform: 'uppercase', marginBottom: 8 }}>Indice de Performance</div>
                <div style={{ fontSize: isMobile ? 24 : 32, fontWeight: 600, color: coverageCardColors.color }}>
                  {coveragePct != null ? `${Math.round(coveragePct)} %` : '—'}
                </div>
                <div style={{ fontSize: 11, color: c.texteMuted, marginTop: 4 }}>CA couvert par les fiches</div>
              </div>
            </div>

            {/* ── Graphiques ── */}
            {chartData.length > 0 && (
              <div style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
                gap: isMobile ? 12 : 16,
                marginBottom: 24,
              }}>
                {/* AreaChart — CA vs Coût Matière */}
                <div style={{ background: c.blanc, borderRadius: 12, border: `0.5px solid ${c.bordure}`, padding: isMobile ? '14px 8px' : '20px' }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: c.texte, marginBottom: 12 }}>
                    Évolution CA vs Coût Matière
                  </div>
                  <ResponsiveContainer width="100%" height={isMobile ? 180 : 220}>
                    <AreaChart data={chartData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={c.bordure} />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: c.texteMuted }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: c.texteMuted }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}€`} />
                      <Tooltip
                        contentStyle={{ borderRadius: 8, border: `0.5px solid ${c.bordure}`, fontSize: 12 }}
                        formatter={(v) => [`${Number(v).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`]}
                      />
                      <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                      <Area type="monotone" dataKey="ca" name="CA HT" stroke={c.accent} fill={c.accentClair} strokeWidth={2} dot={false} />
                      <Area type="monotone" dataKey="cout" name="Coût Matière" stroke="#D97706" fill="#FEF3C7" strokeWidth={2} dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>

                {/* BarChart — Top 10 plats par marge */}
                {top10Data.length > 0 && (
                  <div style={{ background: c.blanc, borderRadius: 12, border: `0.5px solid ${c.bordure}`, padding: isMobile ? '14px 8px' : '20px' }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: c.texte, marginBottom: 12 }}>
                      Top 10 plats — Taux de marge
                    </div>
                    <ResponsiveContainer width="100%" height={isMobile ? 220 : 260}>
                      <BarChart data={top10Data} layout="vertical" margin={{ top: 0, right: 24, left: 0, bottom: 0 }}>
                        <XAxis
                          type="number"
                          tick={{ fontSize: 10, fill: c.texteMuted }}
                          axisLine={false}
                          tickLine={false}
                          tickFormatter={(v) => `${v}%`}
                        />
                        <YAxis
                          dataKey="nom"
                          type="category"
                          tick={{ fontSize: 10, fill: c.texteMuted }}
                          width={isMobile ? 90 : 110}
                          axisLine={false}
                          tickLine={false}
                        />
                        <Tooltip
                          contentStyle={{ borderRadius: 8, border: `0.5px solid ${c.bordure}`, fontSize: 12 }}
                          formatter={(v) => [`${Number(v).toFixed(1)} %`, 'Marge']}
                        />
                        <Bar dataKey="marge" name="Marge (%)">
                          {top10Data.map((entry, i) => (
                            <Cell key={i} fill={barColor(entry.marge)} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            )}

            {/* ── Tableau détail ── */}
            {lignes.length === 0 ? (
              <p style={{ color: c.texteMuted, fontSize: 14 }}>Aucune vente enregistrée sur cette période.</p>
            ) : (
              <div style={{ background: c.blanc, borderRadius: 12, border: `0.5px solid ${c.bordure}`, overflow: 'hidden' }}>
                {/* En-tête tableau avec filtres */}
                <div style={{ padding: '14px 16px', borderBottom: `0.5px solid ${c.bordure}`, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: c.texte, marginRight: 4 }}>Détail par plat</span>
                  <button
                    onClick={() => setFiltreCategorie('all')}
                    style={{
                      padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 500,
                      border: `1px solid ${filtreCategorie === 'all' ? c.accent : c.bordure}`,
                      background: filtreCategorie === 'all' ? c.accent : c.blanc,
                      color: filtreCategorie === 'all' ? '#fff' : c.texteMuted,
                      cursor: 'pointer',
                    }}
                  >
                    Tout
                  </button>
                  {categories.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setFiltreCategorie(cat)}
                      style={{
                        padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 500,
                        border: `1px solid ${filtreCategorie === cat ? c.accent : c.bordure}`,
                        background: filtreCategorie === cat ? c.accent : c.blanc,
                        color: filtreCategorie === cat ? '#fff' : c.texteMuted,
                        cursor: 'pointer',
                      }}
                    >
                      {cat}
                    </button>
                  ))}
                </div>

                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: isMobile ? 600 : 0 }}>
                    <thead>
                      <tr style={{ background: c.fond }}>
                        <th style={thSort} onClick={() => handleTri('designation')}>
                          Désignation{sortIndicator('designation')}
                        </th>
                        <th style={{ ...thNum }} onClick={() => handleTri('quantiteVendue')}>
                          Qté{sortIndicator('quantiteVendue')}
                        </th>
                        <th style={thNum} onClick={() => handleTri('caNet')}>
                          CA net{sortIndicator('caNet')}
                        </th>
                        <th style={{ ...th, textAlign: 'right' }}>Coût matière</th>
                        <th style={{ ...th, textAlign: 'right' }}>Marge brute</th>
                        <th style={thNum} onClick={() => handleTri('margePct')}>
                          Marge %{sortIndicator('margePct')}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {lignesFiltrees.map((L) => {
                        const mc = margeColor(L.margePct)
                        return (
                          <tr key={L.fiche_id}>
                            <td style={td}>
                              {L.designation}
                              {L.categorie && (
                                <span style={{ marginLeft: 6, fontSize: 10, color: c.texteMuted, background: c.fond, borderRadius: 4, padding: '1px 5px' }}>
                                  {L.categorie}
                                </span>
                              )}
                            </td>
                            <td style={tdNum}>{Number(L.quantiteVendue).toLocaleString('fr-FR', { maximumFractionDigits: 2 })}</td>
                            <td style={tdNum}>{formatEuro(L.caNet)}</td>
                            <td style={tdMuted}>{formatEuro(L.coutMatiere)}</td>
                            <td style={tdNum}>{formatEuro(L.margeBrute)}</td>
                            <td style={{ ...tdNum, color: mc.color, fontWeight: L.margePct != null ? 600 : 400 }}>
                              {formatPct(L.margePct)}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr style={{ fontWeight: 600, background: c.fond }}>
                        <td style={{ ...td, color: c.texte }}>Total ({lignesFiltrees.length} plat{lignesFiltrees.length !== 1 ? 's' : ''})</td>
                        <td style={{ ...tdNum, color: c.texte }}>
                          {Number(lignesFiltrees.reduce((s, L) => s + L.quantiteVendue, 0)).toLocaleString('fr-FR', { maximumFractionDigits: 2 })}
                        </td>
                        <td style={{ ...tdNum, color: c.texte }}>
                          {formatEuro(lignesFiltrees.reduce((s, L) => s + L.caNet, 0))}
                        </td>
                        <td style={{ ...tdNum, color: c.texte }}>
                          {formatEuro(lignesFiltrees.some((L) => L.coutMatiere != null)
                            ? lignesFiltrees.reduce((s, L) => s + (L.coutMatiere ?? 0), 0)
                            : null)}
                        </td>
                        <td style={{ ...tdNum, color: c.texte }}>
                          {formatEuro(lignesFiltrees.some((L) => L.margeBrute != null)
                            ? lignesFiltrees.reduce((s, L) => s + (L.margeBrute ?? 0), 0)
                            : null)}
                        </td>
                        <td style={{ ...tdNum, color: c.texte }}>
                          {(() => {
                            const totalCa = lignesFiltrees.reduce((s, L) => s + L.caNet, 0)
                            const totalMarge = lignesFiltrees.some((L) => L.margeBrute != null)
                              ? lignesFiltrees.reduce((s, L) => s + (L.margeBrute ?? 0), 0)
                              : null
                            return totalMarge != null && totalCa > 0 ? formatPct((totalMarge / totalCa) * 100) : '—'
                          })()}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
