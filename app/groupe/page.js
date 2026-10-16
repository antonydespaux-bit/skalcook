'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import { useIsMobile } from '../../lib/useIsMobile'
import { useTheme } from '../../lib/useTheme'
import Navbar from '../../components/Navbar'

// Vue groupe : compare les établissements d'un même groupe sur une période.
// Données : GET /api/groupe/liste puis /api/groupe/synthese (l'API ne renvoie
// que les établissements accessibles à l'utilisateur, en admin ou directeur).

const iso = (d) => {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), j = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${j}`
}

// Mois complet précédent : la fenêtre la plus lisible pour un ratio achats / CA.
function moisPrecedent() {
  const t = new Date()
  return { debut: iso(new Date(t.getFullYear(), t.getMonth() - 1, 1)), fin: iso(new Date(t.getFullYear(), t.getMonth(), 0)) }
}

async function apiGet(path) {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch(path, { headers: { Authorization: `Bearer ${session?.access_token}` } })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error || res.statusText)
  return json
}

export default function GroupePage() {
  const router = useRouter()
  const isMobile = useIsMobile()
  const { c } = useTheme()
  const { t, i18n } = useTranslation()
  const locale = i18n.language || 'fr'

  const [authReady, setAuthReady] = useState(false)
  const [groupes, setGroupes] = useState(null)
  const [groupeId, setGroupeId] = useState('')
  const [dateDebut, setDateDebut] = useState(() => moisPrecedent().debut)
  const [dateFin, setDateFin] = useState(() => moisPrecedent().fin)
  const [data, setData] = useState(null)
  const [prix, setPrix] = useState(null)
  const [recherchePrix, setRecherchePrix] = useState('')
  const [nbPrixAffiches, setNbPrixAffiches] = useState(30)
  const [rechercheFourn, setRechercheFourn] = useState('')
  const [nbFournAffiches, setNbFournAffiches] = useState(30)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const fmtEur = useCallback((n) => (n == null ? '—'
    : Number(n).toLocaleString(locale, { maximumFractionDigits: 0 }) + ' €'), [locale])
  const fmtEur2 = useCallback((n) => (n == null ? '—'
    : Number(n).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'), [locale])
  const fmtInt = useCallback((n) => (n == null ? '—' : Number(n).toLocaleString(locale)), [locale])
  const fmtPct = useCallback((n) => (n == null ? '—'
    : Number(n).toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' %'), [locale])
  const fmtDate = useCallback((s) => (s
    ? new Date(`${s}T00:00:00`).toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: '2-digit' })
    : ''), [locale])

  const couleurStatut = useCallback((statut) => (
    statut === 'vert' ? { color: c.vert, background: c.vertClair }
      : statut === 'orange' ? { color: c.orange, background: c.orangeClair }
        : statut === 'rouge' ? { color: c.rouge, background: c.rougeClair }
          : { color: c.texteMuted, background: 'transparent' }
  ), [c])

  // ─── Auth + liste des groupes ─────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (cancelled) return
      if (!session) { router.replace('/'); return }
      setAuthReady(true)
      try {
        const res = await apiGet('/api/groupe/liste')
        if (cancelled) return
        setGroupes(res.groupes || [])
        if (res.groupes?.length) setGroupeId(res.groupes[0].id)
      } catch (e) {
        if (!cancelled) { setGroupes([]); setError(e.message) }
      }
    })()
    return () => { cancelled = true }
  }, [router])

  // ─── Synthèse ───────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!groupeId || !dateDebut || !dateFin || dateFin < dateDebut) return
    setLoading(true); setError('')
    try {
      const params = new URLSearchParams({ groupeId, debut: dateDebut, fin: dateFin })
      const [synthese, prixRes] = await Promise.all([
        apiGet(`/api/groupe/synthese?${params}`),
        apiGet(`/api/groupe/prix?${params}`),
      ])
      setData(synthese)
      setPrix(prixRes)
      setNbPrixAffiches(30)
      setNbFournAffiches(30)
    } catch (e) {
      setData(null); setPrix(null); setError(e.message || t('groupe.errorLoad'))
    } finally {
      setLoading(false)
    }
  }, [groupeId, dateDebut, dateFin, t])

  useEffect(() => { if (authReady) load() }, [authReady, load])

  const applyPreset = useCallback((preset) => {
    const today = new Date()
    if (preset === 'mois') { setDateDebut(iso(new Date(today.getFullYear(), today.getMonth(), 1))); setDateFin(iso(today)) }
    else if (preset === 'mois-precedent') { const m = moisPrecedent(); setDateDebut(m.debut); setDateFin(m.fin) }
    else if (preset === '90j') { const d = new Date(today); d.setDate(d.getDate() - 90); setDateDebut(iso(d)); setDateFin(iso(today)) }
    else if (preset === 'annee') { setDateDebut(`${today.getFullYear()}-01-01`); setDateFin(iso(today)) }
  }, [])

  const etabs = useMemo(() => data?.etablissements ?? [], [data])
  const produitsFiltres = useMemo(() => {
    const q = recherchePrix.trim().toLowerCase()
    const liste = prix?.produits ?? []
    return q ? liste.filter((p) => p.nom.toLowerCase().includes(q)) : liste
  }, [prix, recherchePrix])
  const fournFiltres = useMemo(() => {
    const q = rechercheFourn.trim().toLowerCase()
    const liste = prix?.fournisseurs ?? []
    return q ? liste.filter((f) => f.nom.toLowerCase().includes(q)) : liste
  }, [prix, rechercheFourn])
  const totaux = data?.totaux
  // Échelle commune des barres de ratio : le plus haut ratio (au moins 40 %).
  const ratioMax = useMemo(
    () => Math.max(40, ...etabs.map((e) => e.ratioCuisine ?? 0)),
    [etabs],
  )

  if (!authReady || groupes === null) {
    return (
      <div style={{ minHeight: '100vh', background: c.fond, display: 'flex', alignItems: 'center', justifyContent: 'center', color: c.texteMuted, fontSize: 14 }}>
        {t('groupe.loading')}
      </div>
    )
  }

  const inputStyle = { padding: '7px 10px', borderRadius: 8, fontSize: 13, border: `1px solid ${c.bordure}`, background: c.blanc, color: c.texte, outline: 'none' }
  const badge = (valeur, statut) => (
    <span style={{ ...couleurStatut(statut), padding: '2px 8px', borderRadius: 6, fontWeight: 600, whiteSpace: 'nowrap' }}>{fmtPct(valeur)}</span>
  )

  const kpis = totaux ? [
    { label: t('groupe.kpi.caHt'), value: fmtEur(totaux.caHt) },
    { label: t('groupe.kpi.covers'), value: fmtInt(totaux.couverts) },
    { label: t('groupe.kpi.avgTicket'), value: fmtEur2(totaux.ticketMoyenTtc) },
    { label: t('groupe.kpi.purchasesKitchen'), value: fmtEur(totaux.achatsCuisineHt) },
    { label: t('groupe.kpi.ratioKitchen'), value: fmtPct(totaux.ratioCuisine) },
    { label: t('groupe.kpi.ratioBev'), value: fmtPct(totaux.ratioBoissons) },
  ] : []

  const cols = [
    { k: 'nom', label: t('groupe.cols.establishment'), align: 'left' },
    { k: 'caHt', label: t('groupe.cols.caHt') },
    { k: 'couverts', label: t('groupe.cols.covers') },
    { k: 'ticket', label: t('groupe.cols.avgTicket') },
    { k: 'achatsCuisine', label: t('groupe.cols.purchasesKitchen') },
    { k: 'ratioCuisine', label: t('groupe.cols.ratioKitchen') },
    { k: 'achatsBar', label: t('groupe.cols.purchasesBar') },
    { k: 'ratioBoissons', label: t('groupe.cols.ratioBev') },
    { k: 'stock', label: t('groupe.cols.stockKitchen') },
    { k: 'factures', label: t('groupe.cols.invoices') },
  ]
  const td = (align = 'right') => ({ padding: '10px 14px', textAlign: align, color: c.texte, whiteSpace: 'nowrap' })

  return (
    <div style={{ minHeight: '100vh', background: c.fond }}>
      <Navbar />
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: isMobile ? '20px 16px' : '32px 32px' }}>

        {/* ── En-tête ── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: isMobile ? 22 : 28, fontWeight: 700, color: c.texte }}>
              {data?.groupe?.nom ? `${t('groupe.title')} · ${data.groupe.nom}` : t('groupe.title')}
            </h1>
            <p style={{ margin: '4px 0 0', fontSize: 14, color: c.texteMuted }}>{t('groupe.subtitle')}</p>
          </div>
          {groupes.length > 1 && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: c.texteMuted }}>
              {t('groupe.groupLabel')}
              <select value={groupeId} onChange={(e) => setGroupeId(e.target.value)} style={inputStyle}>
                {groupes.map((g) => <option key={g.id} value={g.id}>{g.nom}</option>)}
              </select>
            </label>
          )}
        </div>

        {groupes.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: c.texteMuted, fontSize: 14, background: c.blanc, border: `1px solid ${c.bordure}`, borderRadius: 12 }}>
            {t('groupe.noGroup')}
          </div>
        ) : (
          <>
            {/* ── Période ── */}
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: c.texteMuted }}>
                {t('groupe.from')}
                <input type="date" value={dateDebut} onChange={(e) => setDateDebut(e.target.value)} style={inputStyle} />
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: c.texteMuted }}>
                {t('groupe.to')}
                <input type="date" value={dateFin} onChange={(e) => setDateFin(e.target.value)} style={inputStyle} />
              </label>
              {[
                { k: 'mois-precedent', label: t('groupe.presets.prevMonth') },
                { k: 'mois', label: t('groupe.presets.thisMonth') },
                { k: '90j', label: t('groupe.presets.d90') },
                { k: 'annee', label: t('groupe.presets.year') },
              ].map((p) => (
                <button key={p.k} onClick={() => applyPreset(p.k)}
                  style={{ padding: '6px 10px', borderRadius: 8, fontSize: 12, border: `1px solid ${c.bordure}`, background: c.blanc, color: c.texte, cursor: 'pointer' }}>
                  {p.label}
                </button>
              ))}
            </div>

            {error && (
              <div style={{ background: c.rougeClair, border: `1px solid ${c.rouge}`, borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 14, color: c.rouge }}>
                {error}
              </div>
            )}

            {loading && !data ? (
              <div style={{ textAlign: 'center', padding: 40, color: c.texteMuted, fontSize: 14 }}>{t('groupe.loading')}</div>
            ) : etabs.length === 0 ? (
              !error && <div style={{ textAlign: 'center', padding: 40, color: c.texteMuted, fontSize: 14 }}>{t('groupe.empty')}</div>
            ) : (
              <div style={{ opacity: loading ? 0.6 : 1, transition: 'opacity 0.15s' }}>
                {/* ── Indicateurs du groupe ── */}
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(6, 1fr)', gap: 12, marginBottom: 20 }}>
                  {kpis.map((k) => (
                    <div key={k.label} style={{ background: c.blanc, border: `1px solid ${c.bordure}`, borderRadius: 12, padding: '14px 16px' }}>
                      <div style={{ fontSize: 11, color: c.texteMuted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{k.label}</div>
                      <div style={{ fontSize: isMobile ? 18 : 20, fontWeight: 700, color: c.texte, marginTop: 4 }}>{k.value}</div>
                    </div>
                  ))}
                </div>

                {/* ── Ratio cuisine par établissement ── */}
                <div style={{ background: c.blanc, border: `1px solid ${c.bordure}`, borderRadius: 12, padding: isMobile ? 14 : 20, marginBottom: 20 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: c.texte, marginBottom: 14 }}>{t('groupe.chartTitle')}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {etabs.map((e) => {
                      const st = couleurStatut(e.statutCuisine)
                      const w = e.ratioCuisine == null ? 0 : Math.min(100, (e.ratioCuisine / ratioMax) * 100)
                      return (
                        <div key={e.clientId} style={{ display: 'grid', gridTemplateColumns: isMobile ? '110px 1fr 56px' : '220px 1fr 64px', alignItems: 'center', gap: 10 }}>
                          <span style={{ fontSize: 13, color: c.texte, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={e.nom}>{e.nom}</span>
                          <div style={{ height: 14, background: c.fond, borderRadius: 7, overflow: 'hidden' }}>
                            <div style={{ width: `${w}%`, height: '100%', background: e.statutCuisine ? st.color : c.texteMuted, borderRadius: 7 }} />
                          </div>
                          <span style={{ fontSize: 13, fontWeight: 600, color: e.statutCuisine ? st.color : c.texteMuted, textAlign: 'right' }}>{fmtPct(e.ratioCuisine)}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* ── Détail par établissement ── */}
                {isMobile ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {etabs.map((e) => (
                      <div key={e.clientId} style={{ background: c.blanc, border: `1px solid ${c.bordure}`, borderRadius: 10, padding: '12px 14px' }}>
                        <p style={{ margin: 0, fontWeight: 600, fontSize: 14, color: c.texte }}>{e.nom}</p>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px', marginTop: 8, fontSize: 13, color: c.texteMuted }}>
                          <span>{t('groupe.cols.caHt')} : <strong style={{ color: c.texte }}>{fmtEur(e.caHt)}</strong></span>
                          <span>{t('groupe.cols.covers')} : <strong style={{ color: c.texte }}>{fmtInt(e.couverts)}</strong></span>
                          <span>{t('groupe.cols.ratioKitchen')} : {badge(e.ratioCuisine, e.statutCuisine)}</span>
                          <span>{t('groupe.cols.ratioBev')} : {badge(e.ratioBoissons, e.statutBoissons)}</span>
                          <span>{t('groupe.cols.purchasesKitchen')} : <strong style={{ color: c.texte }}>{fmtEur(e.achatsCuisineHt)}</strong></span>
                          <span>{t('groupe.cols.avgTicket')} : <strong style={{ color: c.texte }}>{fmtEur2(e.ticketMoyenTtc)}</strong></span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ background: c.blanc, border: `1px solid ${c.bordure}`, borderRadius: 12, overflow: 'hidden' }}>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                          <tr style={{ background: c.fond, borderBottom: `2px solid ${c.bordure}` }}>
                            {cols.map((col) => (
                              <th key={col.k} style={{ padding: '10px 14px', textAlign: col.align || 'right', fontWeight: 600, color: c.texteMuted, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
                                {col.label}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {etabs.map((e, idx) => (
                            <tr key={e.clientId} style={{ borderBottom: `1px solid ${c.bordure}`, background: idx % 2 === 0 ? c.blanc : c.fond }}>
                              <td style={{ ...td('left'), fontWeight: 500 }}>{e.nom}</td>
                              <td style={td()}>{fmtEur(e.caHt)}</td>
                              <td style={td()}>{fmtInt(e.couverts)}</td>
                              <td style={td()}>{fmtEur2(e.ticketMoyenTtc)}</td>
                              <td style={td()}>{fmtEur(e.achatsCuisineHt)}</td>
                              <td style={td()}>{badge(e.ratioCuisine, e.statutCuisine)}</td>
                              <td style={td()}>{fmtEur(e.achatsBarHt)}</td>
                              <td style={td()}>{badge(e.ratioBoissons, e.statutBoissons)}</td>
                              <td style={td()}>
                                {e.stockCuisineHt == null ? '—' : (
                                  <>
                                    {fmtEur(e.stockCuisineHt)}
                                    <div style={{ fontSize: 11, color: c.texteMuted }}>{t('groupe.stockAt', { date: fmtDate(e.stockCuisineDate) })}</div>
                                  </>
                                )}
                              </td>
                              <td style={td()}>{fmtInt(e.nbFactures)}</td>
                            </tr>
                          ))}
                          {totaux && etabs.length > 1 && (
                            <tr style={{ borderTop: `2px solid ${c.bordure}`, background: c.fond, fontWeight: 600 }}>
                              <td style={td('left')}>{t('groupe.total')}</td>
                              <td style={td()}>{fmtEur(totaux.caHt)}</td>
                              <td style={td()}>{fmtInt(totaux.couverts)}</td>
                              <td style={td()}>{fmtEur2(totaux.ticketMoyenTtc)}</td>
                              <td style={td()}>{fmtEur(totaux.achatsCuisineHt)}</td>
                              <td style={td()}>{fmtPct(totaux.ratioCuisine)}</td>
                              <td style={td()}>{fmtEur(totaux.achatsBarHt)}</td>
                              <td style={td()}>{fmtPct(totaux.ratioBoissons)}</td>
                              <td style={td()}>—</td>
                              <td style={td()}>{fmtInt(totaux.nbFactures)}</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                <p style={{ marginTop: 12, fontSize: 12, color: c.texteMuted, lineHeight: 1.5 }}>{t('groupe.method')}</p>

                {/* ── Prix d'achat comparés ── */}
                {prix && (
                  <div style={{ marginTop: 28 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
                      <div>
                        <h2 style={{ margin: 0, fontSize: isMobile ? 18 : 20, fontWeight: 700, color: c.texte }}>{t('groupe.prix.title')}</h2>
                        <p style={{ margin: '4px 0 0', fontSize: 14, color: c.texteMuted }}>
                          {t('groupe.prix.summary', { count: prix.nbProduitsCompares, economie: fmtEur(prix.economieTotale) })}
                        </p>
                      </div>
                      {prix.nbProduitsCompares > 0 && (
                        <input value={recherchePrix} onChange={(e) => { setRecherchePrix(e.target.value); setNbPrixAffiches(30) }}
                          placeholder={t('groupe.prix.search')} style={{ ...inputStyle, minWidth: 220 }} />
                      )}
                    </div>

                    {prix.nbProduitsCompares === 0 ? (
                      <div style={{ textAlign: 'center', padding: 32, color: c.texteMuted, fontSize: 14, background: c.blanc, border: `1px solid ${c.bordure}`, borderRadius: 12 }}>
                        {t('groupe.prix.empty')}
                      </div>
                    ) : (
                      <div style={{ background: c.blanc, border: `1px solid ${c.bordure}`, borderRadius: 12, overflow: 'hidden' }}>
                        <div style={{ overflowX: 'auto' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                            <thead>
                              <tr style={{ background: c.fond, borderBottom: `2px solid ${c.bordure}` }}>
                                {[
                                  { k: 'p', label: t('groupe.prix.cols.product'), align: 'left' },
                                  { k: 'min', label: t('groupe.prix.cols.best') },
                                  { k: 'max', label: t('groupe.prix.cols.highest') },
                                  { k: 'ecart', label: t('groupe.prix.cols.gap') },
                                  { k: 'eco', label: t('groupe.prix.cols.saving') },
                                ].map((col) => (
                                  <th key={col.k} style={{ padding: '10px 14px', textAlign: col.align || 'right', fontWeight: 600, color: c.texteMuted, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
                                    {col.label}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {produitsFiltres.slice(0, nbPrixAffiches).map((p, idx) => {
                                const moinsCher = p.etablissements[0]
                                const plusCher = p.etablissements[p.etablissements.length - 1]
                                return (
                                  <tr key={p.cle} style={{ borderBottom: `1px solid ${c.bordure}`, background: idx % 2 === 0 ? c.blanc : c.fond }}>
                                    <td style={{ ...td('left'), whiteSpace: 'normal', minWidth: 200 }}>
                                      <div style={{ fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                        {p.nom} <span style={{ color: c.texteMuted, fontWeight: 400 }}>/ {p.unite || '—'}</span>
                                        {p.aVerifier && (
                                          <span title={t('groupe.prix.checkHint')} style={{ fontSize: 10, color: c.orange, background: c.orangeClair, padding: '1px 6px', borderRadius: 4, whiteSpace: 'nowrap' }}>
                                            {t('groupe.prix.check')}
                                          </span>
                                        )}
                                      </div>
                                      <div style={{ fontSize: 11, color: c.texteMuted, marginTop: 2 }}>
                                        {p.etablissements.map((e) => `${e.nom} ${fmtEur2(e.prixMoyen)}${e.fournisseurPrincipal ? ` (${e.fournisseurPrincipal})` : ''}`).join(' · ')}
                                      </div>
                                      {p.meilleurFournisseur && p.meilleurFournisseur.prix < p.prixMin - 0.005 && (
                                        <div style={{ fontSize: 11, color: c.vert, marginTop: 2 }}>
                                          {t('groupe.prix.bestSupplier', { fournisseur: p.meilleurFournisseur.fournisseur, prix: fmtEur2(p.meilleurFournisseur.prix), etablissement: p.meilleurFournisseur.etablissement })}
                                        </div>
                                      )}
                                    </td>
                                    <td style={td()}>
                                      <span style={{ color: c.vert, fontWeight: 600 }}>{fmtEur2(p.prixMin)}</span>
                                      <div style={{ fontSize: 11, color: c.texteMuted }}>{moinsCher.nom}</div>
                                      {moinsCher.fournisseurPrincipal && <div style={{ fontSize: 11, color: c.texteMuted }}>{moinsCher.fournisseurPrincipal}</div>}
                                    </td>
                                    <td style={td()}>
                                      {fmtEur2(p.prixMax)}
                                      <div style={{ fontSize: 11, color: c.texteMuted }}>{plusCher.nom}</div>
                                      {plusCher.fournisseurPrincipal && <div style={{ fontSize: 11, color: c.texteMuted }}>{plusCher.fournisseurPrincipal}</div>}
                                    </td>
                                    <td style={td()}>+{fmtPct(p.ecartPct)}</td>
                                    <td style={{ ...td(), fontWeight: 600 }}>{fmtEur(p.economiePotentielle)}</td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                        {produitsFiltres.length > nbPrixAffiches && (
                          <div style={{ padding: 12, textAlign: 'center', borderTop: `1px solid ${c.bordure}` }}>
                            <button onClick={() => setNbPrixAffiches((n) => n + 50)}
                              style={{ padding: '6px 14px', borderRadius: 8, fontSize: 13, border: `1px solid ${c.bordure}`, background: c.blanc, color: c.texte, cursor: 'pointer' }}>
                              {t('groupe.prix.more', { count: produitsFiltres.length - nbPrixAffiches })}
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                    <p style={{ marginTop: 12, fontSize: 12, color: c.texteMuted, lineHeight: 1.5 }}>{t('groupe.prix.method')}</p>
                  </div>
                )}

                {/* ── Fournisseurs du groupe ── */}
                {prix && (
                  <div style={{ marginTop: 28 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
                      <div>
                        <h2 style={{ margin: 0, fontSize: isMobile ? 18 : 20, fontWeight: 700, color: c.texte }}>{t('groupe.fournisseurs.title')}</h2>
                        <p style={{ margin: '4px 0 0', fontSize: 14, color: c.texteMuted }}>
                          {t('groupe.fournisseurs.summary', { communs: prix.nbFournisseursCommuns, total: prix.nbFournisseurs, montant: fmtEur(prix.montantFournisseursCommuns) })}
                        </p>
                      </div>
                      {prix.nbFournisseurs > 0 && (
                        <input value={rechercheFourn} onChange={(e) => { setRechercheFourn(e.target.value); setNbFournAffiches(30) }}
                          placeholder={t('groupe.fournisseurs.search')} style={{ ...inputStyle, minWidth: 220 }} />
                      )}
                    </div>

                    {prix.nbFournisseurs === 0 ? (
                      <div style={{ textAlign: 'center', padding: 32, color: c.texteMuted, fontSize: 14, background: c.blanc, border: `1px solid ${c.bordure}`, borderRadius: 12 }}>
                        {t('groupe.fournisseurs.empty')}
                      </div>
                    ) : (
                      <div style={{ background: c.blanc, border: `1px solid ${c.bordure}`, borderRadius: 12, overflow: 'hidden' }}>
                        <div style={{ overflowX: 'auto' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                            <thead>
                              <tr style={{ background: c.fond, borderBottom: `2px solid ${c.bordure}` }}>
                                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: c.texteMuted, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('groupe.fournisseurs.cols.supplier')}</th>
                                <th style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600, color: c.texteMuted, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{t('groupe.fournisseurs.cols.total')}</th>
                                {etabs.map((e) => (
                                  <th key={e.clientId} style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600, color: c.texteMuted, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{e.nom}</th>
                                ))}
                                <th style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600, color: c.texteMuted, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('groupe.fournisseurs.cols.invoices')}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {fournFiltres.slice(0, nbFournAffiches).map((f, idx) => {
                                const parEtab = new Map(f.etablissements.map((e) => [e.clientId, e]))
                                return (
                                  <tr key={f.cle} style={{ borderBottom: `1px solid ${c.bordure}`, background: idx % 2 === 0 ? c.blanc : c.fond }}>
                                    <td style={{ ...td('left'), fontWeight: 500 }}>
                                      {f.nom}
                                      {f.nbEtablissements > 1 && (
                                        <span style={{ marginLeft: 6, fontSize: 10, color: c.accent, background: c.accentClair, padding: '1px 6px', borderRadius: 4 }}>
                                          {t('groupe.fournisseurs.shared', { count: f.nbEtablissements })}
                                        </span>
                                      )}
                                    </td>
                                    <td style={{ ...td(), fontWeight: 600 }}>{fmtEur(f.montantTotal)}</td>
                                    {etabs.map((e) => {
                                      const v = parEtab.get(e.clientId)
                                      return <td key={e.clientId} style={{ ...td(), color: v ? c.texte : c.texteMuted }}>{v ? fmtEur(v.montant) : '—'}</td>
                                    })}
                                    <td style={td()}>{fmtInt(f.etablissements.reduce((s, e) => s + e.nbFactures, 0))}</td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                        {fournFiltres.length > nbFournAffiches && (
                          <div style={{ padding: 12, textAlign: 'center', borderTop: `1px solid ${c.bordure}` }}>
                            <button onClick={() => setNbFournAffiches((n) => n + 50)}
                              style={{ padding: '6px 14px', borderRadius: 8, fontSize: 13, border: `1px solid ${c.bordure}`, background: c.blanc, color: c.texte, cursor: 'pointer' }}>
                              {t('groupe.prix.more', { count: fournFiltres.length - nbFournAffiches })}
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                    <p style={{ marginTop: 12, fontSize: 12, color: c.texteMuted, lineHeight: 1.5 }}>{t('groupe.fournisseurs.method')}</p>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
