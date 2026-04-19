export default function KpiFoodCostMoyen({ c, isMobile, foodCostMoyen, nbFiches, fichesFCColor }) {
  const bg = foodCostMoyen ? fichesFCColor(foodCostMoyen).bg : c.blanc
  const color = foodCostMoyen ? fichesFCColor(foodCostMoyen).color : c.texte
  return (
    <div style={{ background: bg, borderRadius: '12px', padding: isMobile ? '14px' : '20px', border: `0.5px solid ${c.bordure}` }}>
      <div className="sk-label-muted" style={{ color: c.texteMuted, marginBottom: '8px' }}>Food cost moyen</div>
      <div className="sk-stat-value" style={{ fontSize: isMobile ? '28px' : '36px', color }}>
        {foodCostMoyen ? `${foodCostMoyen.toFixed(1)}%` : '—'}
      </div>
      <div style={{ fontSize: '11px', color: c.texteMuted, marginTop: '4px' }}>Sur {nbFiches} fiches</div>
    </div>
  )
}
