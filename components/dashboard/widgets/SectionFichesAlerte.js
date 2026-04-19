import { Badge } from '../../ui'

export default function SectionFichesAlerte({ c, fichesAlerte, foodCostFiche, seuilOrange, onFicheClick }) {
  return (
    <div style={{ background: c.blanc, borderRadius: '12px', border: `0.5px solid ${c.bordure}`, overflow: 'hidden' }}>
      <div style={{ padding: '16px 20px', borderBottom: `0.5px solid ${c.bordure}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: '13px', fontWeight: '500', color: c.texte }}>🚨 Fiches en alerte</div>
        <span style={{ fontSize: '11px', color: c.texteMuted }}>Food cost {'>'} {seuilOrange}%</span>
      </div>
      {fichesAlerte.length === 0 ? (
        <div style={{ padding: '24px', textAlign: 'center', color: c.texteMuted, fontSize: '13px' }}>✓ Aucune fiche en alerte</div>
      ) : (
        <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
          {fichesAlerte.slice(0, 10).map((fiche, i) => {
            const fc = foodCostFiche(fiche)
            return (
              <div
                key={fiche.id}
                onClick={() => onFicheClick(fiche.id)}
                style={{ padding: '12px 20px', cursor: 'pointer', borderBottom: i < fichesAlerte.length - 1 ? `0.5px solid ${c.bordure}` : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: c.blanc }}
                onMouseEnter={(e) => (e.currentTarget.style.background = c.fond)}
                onMouseLeave={(e) => (e.currentTarget.style.background = c.blanc)}
              >
                <div>
                  <div style={{ fontSize: '13px', fontWeight: '500', color: c.texte }}>{fiche.nom}</div>
                  <div style={{ fontSize: '11px', color: c.texteMuted, marginTop: '2px' }}>{fiche.categorie}</div>
                </div>
                <Badge bg={'#FCEBEB'} color={'#A32D2D'}>{fc.toFixed(1)}%</Badge>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
