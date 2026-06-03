'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, getClientId } from '../../../lib/supabase'
import { useIsMobile } from '../../../lib/useIsMobile'
import { useTheme } from '../../../lib/useTheme'
import { useRole } from '../../../lib/useRole'
import { getPeriodDates, fromIsoDate } from '../../../lib/caAnalyses'
import { useAnalysesData } from '../../../lib/useAnalysesData'
import Navbar from '../../../components/Navbar'
import AnalysesRail from '../../../components/analyses/v2/AnalysesRail'
import SyntheseView from '../../../components/analyses/v2/SyntheseView'
import DetailView from '../../../components/analyses/v2/DetailView'

const DEFAULT_PERIODE = 'mois-en-cours'

export default function AnalysesV2Page() {
  const router = useRouter()
  const isMobile = useIsMobile()
  const { c } = useTheme()
  const { role, loading: roleLoading } = useRole()

  const [authReady, setAuthReady] = useState(false)
  const [clientId, setClientId] = useState(null)
  const [lieux, setLieux] = useState([])

  const [tab, setTab] = useState('synthese')
  const [periode, setPeriode] = useState(DEFAULT_PERIODE)
  const initialDates = useMemo(() => getPeriodDates(DEFAULT_PERIODE) || { debut: '', fin: '' }, [])
  const [dateDebut, setDateDebut] = useState(initialDates.debut)
  const [dateFin, setDateFin] = useState(initialDates.fin)
  const [comparaison, setComparaison] = useState('n-1')
  const [lieuxSelected, setLieuxSelected] = useState([])
  const [servicesSelected, setServicesSelected] = useState([])
  const [joursSelected, setJoursSelected] = useState([])

  // ── Auth + rôle ───────────────────────────────────────────────────────────
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

  useEffect(() => {
    if (!authReady) return
    let cancelled = false
    ;(async () => {
      const cid = await getClientId()
      if (!cid || cancelled) return
      setClientId(cid)
      const { data } = await supabase
        .from('lieux_service')
        .select('id, nom, ordre, parent_lieu_service_id')
        .eq('client_id', cid).eq('actif', true)
        .order('ordre').order('nom')
      if (!cancelled) setLieux(data || [])
    })()
    return () => { cancelled = true }
  }, [authReady])

  function handlePeriode(p) {
    setPeriode(p)
    if (p !== 'custom') {
      const { debut, fin } = getPeriodDates(p) || { debut: dateDebut, fin: dateFin }
      setDateDebut(debut); setDateFin(fin)
    }
  }

  const data = useAnalysesData({
    c, clientId, dateDebut, dateFin, comparaison,
    lieux, lieuxSelected, servicesSelected, joursSelected,
  })

  const yearLabels = useMemo(() => {
    if (!dateDebut) return { current: '', compare: '' }
    const y = fromIsoDate(dateDebut).getFullYear()
    return { current: String(y), compare: String(y - 1) }
  }, [dateDebut])

  if (!authReady) {
    return (
      <div style={{ minHeight: '100vh', background: c.fond, display: 'flex', alignItems: 'center', justifyContent: 'center', color: c.texteMuted, fontSize: 14 }}>
        Chargement…
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: c.fond }}>
      <Navbar section="cuisine" />

      {/* En-tête : titre + onglets + badge */}
      <div style={{
        background: c.blanc, borderBottom: `1px solid ${c.bordure}`,
        padding: isMobile ? '12px 16px' : '12px 24px',
        display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
      }}>
        <h1 style={{ fontSize: isMobile ? 18 : 20, fontWeight: 700, color: c.texte, margin: 0 }}>Analyses CA</h1>
        <div style={{ display: 'flex', gap: 4 }}>
          {[['synthese', 'Synthèse'], ['detail', 'Détail']].map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)} style={{
              padding: '7px 16px', borderRadius: 9, fontSize: 14, fontWeight: tab === id ? 600 : 500,
              border: 'none', cursor: 'pointer',
              background: tab === id ? c.accentClair : 'transparent',
              color: tab === id ? c.accent : c.texteMuted,
            }}>{label}</button>
          ))}
        </div>
        <span style={{ fontSize: 11, fontWeight: 600, color: c.accent, background: c.accentClair, padding: '3px 9px', borderRadius: 20 }}>
          Nouvelle version
        </span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 13, color: c.texteMuted }}>{humanRange(dateDebut, dateFin)}</span>
      </div>

      {/* Corps : rail + contenu */}
      <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: 'stretch', minHeight: 'calc(100vh - 130px)' }}>
        <AnalysesRail
          c={c} isMobile={isMobile}
          periode={periode} onPeriode={handlePeriode}
          dateDebut={dateDebut} dateFin={dateFin} onDateDebut={setDateDebut} onDateFin={setDateFin}
          comparaison={comparaison} onComparaison={setComparaison}
          lieux={data.lieuxAffiches} lieuxSelected={lieuxSelected} onLieuxSelected={setLieuxSelected}
          servicesSelected={servicesSelected} onServicesSelected={setServicesSelected}
          joursSelected={joursSelected} onJoursSelected={setJoursSelected}
        />

        <main style={{ flex: 1, padding: isMobile ? 16 : 24, minWidth: 0 }}>
          {data.error && <p style={{ color: '#B91C1C', fontSize: 14, marginBottom: 16 }}>{data.error}</p>}
          {data.loading ? (
            <p style={{ color: c.texteMuted, fontSize: 14 }}>Chargement…</p>
          ) : tab === 'synthese' ? (
            <SyntheseView
              c={c} isMobile={isMobile} data={data} comparaison={comparaison}
              currentLabel={yearLabels.current} compareLabel={yearLabels.compare}
            />
          ) : (
            <DetailView c={c} isMobile={isMobile} days={data.daysWithBudget} />
          )}
        </main>
      </div>
    </div>
  )
}

function humanRange(debut, fin) {
  if (!debut || !fin) return ''
  const f = (iso) => fromIsoDate(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
  return debut === fin ? f(debut) : `${f(debut)} → ${f(fin)}`
}
