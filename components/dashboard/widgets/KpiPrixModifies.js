export default function KpiPrixModifies({ c, isMobile, nbPrix }) {
  return (
    <div style={{ background: nbPrix > 0 ? '#FAEEDA' : c.blanc, borderRadius: '12px', padding: isMobile ? '14px' : '20px', border: `0.5px solid ${c.bordure}` }}>
      <div className="sk-label-muted" style={{ color: c.texteMuted, marginBottom: '8px' }}>Prix modifiés</div>
      <div className="sk-stat-value" style={{ fontSize: isMobile ? '28px' : '36px', color: nbPrix > 0 ? '#854F0B' : c.texte }}>{nbPrix}</div>
      <div style={{ fontSize: '11px', color: c.texteMuted, marginTop: '4px' }}>Ingrédients récents</div>
    </div>
  )
}
