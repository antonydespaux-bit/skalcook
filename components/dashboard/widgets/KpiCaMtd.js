import { useEffect, useState } from 'react'
import { supabase, getClientId } from '../../../lib/supabase'
import { aggregateTotals } from '../../../lib/caAnalyses'

function firstDayOfMonthIso(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

export default function KpiCaMtd({ c, isMobile }) {
  const [ca, setCa] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const clientId = await getClientId()
      if (!clientId) { setLoading(false); return }
      const debut = firstDayOfMonthIso()
      // Source = ca_journalier (saisie CA agrégé par jour × lieu × service),
      // alignée avec /controle-gestion/ventes et /controle-gestion/analyses.
      // L'ancien widget lisait ventes_journalieres (saisie fiche-par-fiche)
      // → restituait 0 € pour les clients qui ne saisissent pas ticket par
      // ticket. aggregateTotals applique le TTC → HT par catégorie (food/soft
      // 10 %, alcool 20 %) cohéremment avec les autres pages.
      const { data } = await supabase
        .from('ca_journalier')
        .select('couverts, ca_food, ca_bev_20, ca_bev_10, ca_autre')
        .eq('client_id', clientId)
        .gte('jour', debut)
      if (cancelled) return
      const totals = aggregateTotals(data || [])
      setCa(totals.caHt)
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [])

  const valeur = loading ? '…' : ca == null ? '—' : `${ca.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} €`

  return (
    <div style={{ background: c.blanc, borderRadius: '12px', padding: isMobile ? '14px' : '20px', border: `0.5px solid ${c.bordure}` }}>
      <div className="sk-label-muted" style={{ color: c.texteMuted, marginBottom: '8px' }}>CA cumulé mois en cours</div>
      <div className="sk-stat-value" style={{ fontSize: isMobile ? '24px' : '30px', color: c.texte }}>{valeur}</div>
      <div style={{ fontSize: '11px', color: c.texteMuted, marginTop: '4px' }}>Ventes du mois (HT net)</div>
    </div>
  )
}
