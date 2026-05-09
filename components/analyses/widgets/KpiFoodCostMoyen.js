import { foodCostColor } from '../../../lib/foodCost'

// Food cost moyen sur la période = coût matière total / CA HT couvert × 100.
// Pondéré par les ventes (≠ moyenne arithmétique sur les fiches du dashboard
// cuisine, qui pondère 1/fiche). Mêmes seuils couleur que le dashboard.
export default function KpiFoodCostMoyen({ c, isMobile, foodCostPct, nbFiches, seuilVert, seuilOrange }) {
  const colorEnv = foodCostPct != null ? foodCostColor(foodCostPct, seuilVert, seuilOrange) : null
  const bg = colorEnv?.bg ?? c.blanc
  const color = colorEnv?.color ?? c.texte
  return (
    <div style={{
      background: bg, borderRadius: '12px',
      padding: isMobile ? '14px' : '20px',
      border: `0.5px solid ${c.bordure}`,
    }}>
      <div className="sk-label-muted" style={{ color: c.texteMuted, marginBottom: '8px' }}>Food cost moyen</div>
      <div className="sk-stat-value" style={{ fontSize: isMobile ? '22px' : '28px', color }}>
        {foodCostPct != null ? `${foodCostPct.toFixed(1)} %` : '—'}
      </div>
      <div style={{ fontSize: '11px', color: c.texteMuted, marginTop: '6px' }}>
        Pondéré ventes — sur {nbFiches} fiche{nbFiches > 1 ? 's' : ''} couverte{nbFiches > 1 ? 's' : ''}
      </div>
    </div>
  )
}
