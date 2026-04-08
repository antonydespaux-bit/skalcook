'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, getClientId, getParametres } from '../../../lib/supabase'
import { useIsMobile } from '../../../lib/useIsMobile'
import { useTheme } from '../../../lib/useTheme'
import { useRole } from '../../../lib/useRole'
import { getSeuilsFromParams } from '../../../lib/foodCost'
import Navbar from '../../../components/Navbar'
import * as XLSX from 'xlsx'
import DateSelector from '../../../components/marges/DateSelector'
import StatsCards from '../../../components/marges/StatsCards'
import Charts from '../../../components/marges/Charts'
import SalesTable from '../../../components/marges/SalesTable'
import ConsoTable from '../../../components/marges/ConsoTable'

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

function computeConsoTheorique(lignes, ficheIngsMap, ficheNbPortions) {
  const map = new Map()
  for (const ligne of lignes) {
    const nbPortions = ficheNbPortions[ligne.fiche_id]
    if (!nbPortions || nbPortions <= 0) continue
    for (const fi of (ficheIngsMap[ligne.fiche_id] || [])) {
      const conso = (ligne.quantiteVendue * (Number(fi.quantite) || 0)) / nbPortions
      const ingId = fi.ingredient_id
      if (!map.has(ingId)) {
        map.set(ingId, {
          ingredient_id: ingId,
          nom: fi.ingredients?.nom ?? `Ingrédient (${ingId})`,
          unite: fi.unite ?? '—',
          qteTotale: 0,
        })
      }
      map.get(ingId).qteTotale += conso
    }
  }
  return Array.from(map.values()).sort((a, b) => a.nom.localeCompare(b.nom, 'fr'))
}

// ─── Composant principal ─────────────────────────────────────────────────────

export default function MargesDashboardPage() {
  const router = useRouter()
  const isMobile = useIsMobile()
  const { c } = useTheme()

  const { role, loading: roleLoading } = useRole()

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

  useEffect(() => {
    if (roleLoading || !role) return
    if (role !== 'admin' && role !== 'directeur') router.replace('/dashboard')
  }, [role, roleLoading, router])

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
      const { data: fichesRows } = await supabase
        .from('fiches')
        .select('id, nom, cout_portion, nb_portions, categorie')
        .in('id', ficheIds)

      ficheMap = Object.fromEntries((fichesRows || []).map((f) => [f.id, f]))

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

  const ficheNbPortions = useMemo(() => {
    const map = {}
    Object.entries(ficheById).forEach(([id, f]) => {
      if (f.nb_portions != null) map[id] = Number(f.nb_portions)
    })
    return map
  }, [ficheById])

  const consoLignes = useMemo(
    () => computeConsoTheorique(lignes, ficheIngsMap, ficheNbPortions),
    [lignes, ficheIngsMap, ficheNbPortions]
  )

  const menuEngineeringData = useMemo(() => {
    const withData = lignes.filter((L) => L.margePct != null && L.quantiteVendue > 0)
    if (withData.length === 0) return { points: [], avgQte: 0, avgMarge: 0 }
    const avgQte = withData.reduce((s, L) => s + L.quantiteVendue, 0) / withData.length
    const avgMarge = withData.reduce((s, L) => s + L.margePct, 0) / withData.length
    const points = withData.map((L) => {
      const isPopular = L.quantiteVendue >= avgQte
      const isProfitable = L.margePct >= avgMarge
      const quadrant = isPopular && isProfitable ? 'Star'
        : isPopular ? 'Vache à lait'
        : isProfitable ? 'Dilemme'
        : 'Poids mort'
      const quadrantColor = quadrant === 'Star' ? '#3B6D11'
        : quadrant === 'Vache à lait' ? '#6366F1'
        : quadrant === 'Dilemme' ? '#D97706'
        : '#A32D2D'
      return { x: L.quantiteVendue, y: L.margePct, nom: L.designation, quadrant, quadrantColor, ca: L.caNet }
    })
    return { points, avgQte, avgMarge }
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

  // ── Seuils couleur ──────────────────────────────────────────────────────────

  const { seuilVert, seuilOrange } = getSeuilsFromParams(params, 'cuisine')
  const margeSeuilVert = 100 - seuilVert
  const margeSeuilOrange = 100 - seuilOrange

  function margeColor(pct) {
    if (pct == null) return { bg: null, color: c.texte }
    if (pct >= margeSeuilVert) return { bg: '#EAF3DE', color: '#3B6D11' }
    if (pct >= margeSeuilOrange) return { bg: '#FAEEDA', color: '#854F0B' }
    return { bg: '#FCEBEB', color: '#A32D2D' }
  }

  // ── Export Menu Engineering ──────────────────────────────────────────────────

  function exportMenuEngineering() {
    const { avgQte, avgMarge } = menuEngineeringData
    const rows = lignes.map((L) => {
      const isPopular = L.quantiteVendue >= avgQte
      const isProfitable = (L.margePct ?? 0) >= avgMarge
      const quadrant = L.margePct == null ? '—'
        : isPopular && isProfitable ? 'Star ⭐'
        : isPopular ? 'Vache à lait 🐄'
        : isProfitable ? 'Dilemme ❓'
        : 'Poids mort 🐕'
      return {
        'Désignation': L.designation,
        'Catégorie': L.categorie ?? '—',
        'Qté vendue': L.quantiteVendue,
        'CA HT (€)': L.caNet != null ? Number(L.caNet.toFixed(2)) : '',
        'Coût matière (€)': L.coutMatiere != null ? Number(L.coutMatiere.toFixed(2)) : '',
        'Marge brute (€)': L.margeBrute != null ? Number(L.margeBrute.toFixed(2)) : '',
        'Marge (%)': L.margePct != null ? Number(L.margePct.toFixed(1)) : '',
        'Classification': quadrant,
      }
    })
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Menu Engineering')
    XLSX.writeFile(wb, `menu-engineering_${dateDebut}_${dateFin}.xlsx`)
  }

  // ── Tri ─────────────────────────────────────────────────────────────────────

  function handleTri(col) {
    if (triColonne === col) {
      setTriSens(triSens === 'asc' ? 'desc' : 'asc')
    } else {
      setTriColonne(col)
      setTriSens(col === 'designation' ? 'asc' : 'desc')
    }
  }

  // ── Rendu ────────────────────────────────────────────────────────────────────

  if (!authReady) {
    return (
      <div style={{ minHeight: '100vh', background: c.fond, display: 'flex', alignItems: 'center', justifyContent: 'center', color: c.texteMuted, fontSize: 14 }}>
        Chargement…
      </div>
    )
  }

  const margePctVal = totaux.margePct
  const margeCardColors = margeColor(margePctVal)
  const coverageCardColors = coveragePct == null ? { bg: null, color: c.texte }
    : coveragePct >= 80 ? { bg: '#EAF3DE', color: '#3B6D11' }
    : { bg: '#FAEEDA', color: '#854F0B' }

  return (
    <div style={{ minHeight: '100vh', background: c.fond }}>
      <Navbar section="cuisine" />
      <div style={{ padding: isMobile ? '16px' : '24px', maxWidth: '1200px', margin: '0 auto' }}>

        <h1 style={{ margin: '0 0 4px', fontSize: isMobile ? 22 : 26, fontWeight: 600, color: c.texte }}>
          Dashboard Marges
        </h1>
        <p style={{ margin: '0 0 20px', fontSize: 14, color: c.texteMuted }}>
          Analyse des marges sur ventes — CA, coût matière et rentabilité par plat.
        </p>

        <DateSelector
          periode={periode}
          dateDebut={dateDebut}
          dateFin={dateFin}
          onPeriode={handlePeriode}
          onDateDebut={setDateDebut}
          onDateFin={setDateFin}
        />

        {/* Boutons d'action */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
          {role === 'admin' && (
            <button
              onClick={() => router.push('/controle-gestion/import')}
              style={{
                padding: '7px 14px', borderRadius: 8, fontSize: 13,
                border: `1px solid ${c.bordure}`, background: c.blanc, color: c.texte, cursor: 'pointer',
              }}
            >
              ⬆ Importer les ventes
            </button>
          )}
          {lignes.length > 0 && (
            <button
              onClick={exportMenuEngineering}
              style={{
                padding: '7px 14px', borderRadius: 8, fontSize: 13,
                border: `1px solid ${c.bordure}`, background: c.blanc, color: c.texteMuted, cursor: 'pointer',
              }}
            >
              📊 {!isMobile && 'Export '}Menu Engineering
            </button>
          )}
        </div>

        {error && <p style={{ color: '#B91C1C', fontSize: 14, marginBottom: 16 }}>{error}</p>}
        {loading && <p style={{ color: c.texteMuted, fontSize: 14, marginBottom: 24 }}>Chargement des données…</p>}

        {!loading && !error && clientId && (
          <>
            <StatsCards
              totaux={totaux}
              totalAchatsHT={totalAchatsHT}
              lignesCount={lignes.length}
              margePctVal={margePctVal}
              margeCardColors={margeCardColors}
              coverageCardColors={coverageCardColors}
              coveragePct={coveragePct}
            />

            <Charts chartData={chartData} menuEngineeringData={menuEngineeringData} />

            <SalesTable
              lignes={lignes}
              lignesFiltrees={lignesFiltrees}
              categories={categories}
              filtreCategorie={filtreCategorie}
              onFiltreCategorie={setFiltreCategorie}
              triColonne={triColonne}
              triSens={triSens}
              onTri={handleTri}
              margeColor={margeColor}
            />

            <ConsoTable consoLignes={consoLignes} hasVentes={lignes.length > 0} />
          </>
        )}
      </div>
    </div>
  )
}
