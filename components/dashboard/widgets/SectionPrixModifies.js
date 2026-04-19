import { useState } from 'react'
import { Badge } from '../../ui'

export default function SectionPrixModifies({ c, ingredientsPrixHausse }) {
  const [isExpanded, setIsExpanded] = useState(false)
  if (ingredientsPrixHausse.length === 0) return null

  return (
    <div style={{ background: c.blanc, borderRadius: '12px', border: `0.5px solid ${c.bordure}`, overflow: 'hidden' }}>
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        style={{
          padding: '16px 20px',
          borderBottom: isExpanded ? `0.5px solid ${c.bordure}` : 'none',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          cursor: 'pointer',
          background: isExpanded ? c.fond + '40' : c.blanc,
          transition: 'background 0.2s ease',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ fontSize: '13px', fontWeight: '500', color: c.texte }}>📈 Ingrédients avec prix modifiés récemment</div>
          <Badge bg={'#FAEEDA'} color={'#854F0B'} size="sm">
            {ingredientsPrixHausse.length} alertes
          </Badge>
        </div>
        <div style={{ fontSize: '16px', color: c.texteMuted, fontWeight: '300' }}>
          {isExpanded ? '− Masquer' : '+ Développer'}
        </div>
      </div>
      {isExpanded && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: c.fond }}>
                {['Ingrédient', 'Ancien prix', 'Nouveau prix', 'Variation', 'Date'].map((h, i) => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: i === 0 ? 'left' : 'right', fontSize: '11px', color: c.texteMuted, fontWeight: '500', textTransform: 'uppercase', borderBottom: `0.5px solid ${c.bordure}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ingredientsPrixHausse.map((ing, i) => {
                const variation = ing.prix_precedent && ing.prix_kg ? ((ing.prix_kg - ing.prix_precedent) / ing.prix_precedent * 100) : null
                const hausse = variation > 0
                return (
                  <tr key={ing.id} style={{ borderBottom: i < ingredientsPrixHausse.length - 1 ? `0.5px solid ${c.bordure}` : 'none', background: c.blanc }}>
                    <td style={{ padding: '10px 16px', fontWeight: '500', color: c.texte }}>{ing.nom}</td>
                    <td style={{ padding: '10px 16px', textAlign: 'right', color: c.texteMuted }}>{ing.prix_precedent ? `${Number(ing.prix_precedent).toFixed(2)} €` : '—'}</td>
                    <td style={{ padding: '10px 16px', textAlign: 'right', color: c.texte }}>{ing.prix_kg ? `${Number(ing.prix_kg).toFixed(2)} €` : '—'}</td>
                    <td className="sk-td sk-td--right">
                      {variation !== null && (
                        <Badge bg={hausse ? '#FCEBEB' : '#EAF3DE'} color={hausse ? '#A32D2D' : '#3B6D11'} size="sm">
                          {hausse ? '+' : ''}{variation.toFixed(1)}%
                        </Badge>
                      )}
                    </td>
                    <td style={{ padding: '10px 16px', textAlign: 'right', color: c.texteMuted, fontSize: '12px' }}>
                      {ing.prix_updated_at ? new Date(ing.prix_updated_at).toLocaleDateString('fr-FR') : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
