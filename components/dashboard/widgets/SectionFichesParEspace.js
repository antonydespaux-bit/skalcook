export default function SectionFichesParEspace({ c, fichesByCategorie, maxFiches }) {
  return (
    <div style={{ background: c.blanc, borderRadius: '12px', border: `0.5px solid ${c.bordure}`, overflow: 'hidden' }}>
      <div style={{ padding: '16px 20px', borderBottom: `0.5px solid ${c.bordure}` }}>
        <div style={{ fontSize: '13px', fontWeight: '500', color: c.texte }}>📊 Fiches par espace</div>
      </div>
      <div style={{ padding: '16px 20px' }}>
        {fichesByCategorie.map(({ cat, nb }) => (
          <div key={cat} style={{ marginBottom: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span style={{ fontSize: '12px', color: c.texte, fontWeight: '500' }}>{cat}</span>
              <span style={{ fontSize: '12px', color: c.texteMuted }}>{nb}</span>
            </div>
            <div style={{ background: c.fond, borderRadius: '20px', height: '6px', overflow: 'hidden' }}>
              <div style={{ background: c.accent, height: '100%', borderRadius: '20px', width: `${(nb / maxFiches) * 100}%`, transition: 'width 0.5s ease' }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
