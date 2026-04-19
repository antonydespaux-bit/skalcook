export default function KpiFichesActives({ c, isMobile, nbFiches, nbMenus, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{ background: c.blanc, borderRadius: '12px', padding: isMobile ? '14px' : '20px', border: `0.5px solid ${c.bordure}`, cursor: onClick ? 'pointer' : 'default' }}
    >
      <div className="sk-label-muted" style={{ color: c.texteMuted, marginBottom: '8px' }}>Fiches actives</div>
      <div className="sk-stat-value" style={{ fontSize: isMobile ? '28px' : '36px', color: c.texte }}>{nbFiches}</div>
      <div style={{ fontSize: '11px', color: c.texteMuted, marginTop: '4px' }}>{nbMenus} menu{nbMenus > 1 ? 's' : ''}</div>
    </div>
  )
}
