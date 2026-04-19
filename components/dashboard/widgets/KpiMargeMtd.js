import { useEffect, useState } from 'react'
import { supabase, getClientId } from '../../../lib/supabase'

function firstDayOfMonthIso(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

export default function KpiMargeMtd({ c, isMobile }) {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const clientId = await getClientId()
      if (!clientId) { setLoading(false); return }
      const debut = firstDayOfMonthIso()
      const [{ data: ventes }, { data: fiches }] = await Promise.all([
        supabase
          .from('ventes_journalieres')
          .select('fiche_id, quantite_vendue, prix_vente_net')
          .eq('client_id', clientId)
          .gte('jour', debut),
        supabase
          .from('fiches')
          .select('id, cout_portion')
          .eq('client_id', clientId),
      ])
      if (cancelled) return
      const coutById = new Map((fiches || []).map((f) => [f.id, f.cout_portion == null ? null : Number(f.cout_portion)]))
      let ca = 0
      let caAvecCout = 0
      let coutTotal = 0
      for (const row of ventes || []) {
        const q = Number(row.quantite_vendue) || 0
        const pu = Number(row.prix_vente_net) || 0
        ca += q * pu
        const cp = coutById.get(row.fiche_id)
        if (cp != null) {
          caAvecCout += q * pu
          coutTotal += q * cp
        }
      }
      const marge = caAvecCout - coutTotal
      const margePct = caAvecCout > 0 ? (marge / caAvecCout) * 100 : null
      setStats({ ca, marge, margePct })
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [])

  const valeur = loading
    ? '…'
    : !stats || stats.ca === 0
      ? '—'
      : `${stats.marge.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} €`
  const pct = stats?.margePct != null ? `${stats.margePct.toFixed(1)}%` : null

  return (
    <div style={{ background: c.blanc, borderRadius: '12px', padding: isMobile ? '14px' : '20px', border: `0.5px solid ${c.bordure}` }}>
      <div className="sk-label-muted" style={{ color: c.texteMuted, marginBottom: '8px' }}>Marge mois en cours</div>
      <div className="sk-stat-value" style={{ fontSize: isMobile ? '24px' : '30px', color: c.texte }}>{valeur}</div>
      <div style={{ fontSize: '11px', color: c.texteMuted, marginTop: '4px' }}>
        {pct ? `${pct} sur CA avec coût connu` : 'Marge brute sur fiches renseignées'}
      </div>
    </div>
  )
}
