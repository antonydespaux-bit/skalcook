import KpiCard from './KpiCard'
import { formatDeltaPct, formatEur } from '../../../lib/caAnalyses'

// Écart en % entre le CA TTC réel et le budget cumulé sur la période.
// Positif = au-dessus du budget (vert), < -5 % = rouge, sinon orange.
// Affiche systématiquement la valeur, indépendamment du sélecteur
// "Comparaison" (qui ne pilote que les KPIs Couverts/CA/TM).
export default function KpiEcartBudgetPct({ c, isMobile, totals, budget }) {
  const real = totals?.caTtc ?? 0
  const noBudget = !budget || budget === 0
  const ratioPct = noBudget ? null : ((real - budget) / budget) * 100

  const valueColor = noBudget ? c.texteMuted
    : ratioPct >= 0 ? c.vert
    : ratioPct < -5 ? c.rouge
    : c.orange

  return (
    <div style={{
      background: c.blanc, borderRadius: '12px',
      padding: isMobile ? '14px' : '20px',
      border: `0.5px solid ${c.bordure}`,
    }}>
      <div className="sk-label-muted" style={{ color: c.texteMuted, marginBottom: '8px' }}>
        Écart vs Budget
      </div>
      <div className="sk-stat-value" style={{ fontSize: isMobile ? '22px' : '28px', color: valueColor }}>
        {noBudget ? '—' : formatDeltaPct(ratioPct)}
      </div>
      <div style={{ fontSize: '11px', color: c.texteMuted, marginTop: '6px' }}>
        {noBudget
          ? 'Pas de budget cible défini sur cette période'
          : `Réel ${formatEur(real)} / Budget ${formatEur(budget)}`}
      </div>
    </div>
  )
}
