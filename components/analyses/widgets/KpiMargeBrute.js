import { foodCostColor } from '../../../lib/foodCost'
import { formatEur } from '../../../lib/caAnalyses'

// Marge brute (€) sur la période + marge en % en sous-titre. La couleur du
// fond reflète la santé via les seuils food-cost (un food-cost > seuilOrange
// = marge faible → rouge), pour rester cohérent avec KpiFoodCostMoyen.
export default function KpiMargeBrute({ c, isMobile, margeBrute, margePct, foodCostPct, seuilVert, seuilOrange }) {
  const colorEnv = foodCostPct != null ? foodCostColor(foodCostPct, seuilVert, seuilOrange) : null
  const bg = colorEnv?.bg ?? c.blanc
  const color = colorEnv?.color ?? c.texte
  return (
    <div style={{
      background: bg, borderRadius: '12px',
      padding: isMobile ? '14px' : '20px',
      border: `0.5px solid ${c.bordure}`,
    }}>
      <div className="sk-label-muted" style={{ color: c.texteMuted, marginBottom: '8px' }}>Marge brute</div>
      <div className="sk-stat-value" style={{ fontSize: isMobile ? '22px' : '28px', color }}>
        {margeBrute != null ? formatEur(margeBrute) : '—'}
      </div>
      <div style={{ fontSize: '11px', color: c.texteMuted, marginTop: '6px' }}>
        {margePct != null ? `${margePct.toFixed(1)} % du CA HT couvert` : 'Aucune fiche avec coût matière'}
      </div>
    </div>
  )
}
