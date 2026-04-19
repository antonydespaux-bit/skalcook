import { useEffect, useState } from 'react'
import { supabase, getClientId } from '../../../lib/supabase'

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
      const { data } = await supabase
        .from('ventes_journalieres')
        .select('quantite_vendue, prix_vente_net')
        .eq('client_id', clientId)
        .gte('jour', debut)
      if (cancelled) return
      const total = (data || []).reduce(
        (sum, row) => sum + (Number(row.quantite_vendue) || 0) * (Number(row.prix_vente_net) || 0),
        0,
      )
      setCa(total)
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
