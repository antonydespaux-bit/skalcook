export default function KpiFichesAlerte({ c, isMobile, nbAlertes, seuilOrange }) {
  return (
    <div style={{ background: nbAlertes > 0 ? '#FCEBEB' : '#EAF3DE', borderRadius: '12px', padding: isMobile ? '14px' : '20px', border: `0.5px solid ${c.bordure}` }}>
      <div className="sk-label-muted" style={{ color: c.texteMuted, marginBottom: '8px' }}>Fiches en alerte</div>
      <div className="sk-stat-value" style={{ fontSize: isMobile ? '28px' : '36px', color: nbAlertes > 0 ? '#A32D2D' : '#3B6D11' }}>{nbAlertes}</div>
      <div style={{ fontSize: '11px', color: c.texteMuted, marginTop: '4px' }}>Food cost {'>'} {seuilOrange}%</div>
    </div>
  )
}
