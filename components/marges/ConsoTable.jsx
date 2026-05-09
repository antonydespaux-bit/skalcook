'use client'

import { useTheme } from '../../lib/useTheme'
import { useIsMobile } from '../../lib/useIsMobile'
import { formatQte } from './helpers'

export default function ConsoTable({ consoLignes, hasVentes }) {
  const { c } = useTheme()
  const isMobile = useIsMobile()

  const th = {
    padding: isMobile ? '10px 8px' : '12px 14px',
    textAlign: 'left',
    fontWeight: 600,
    fontSize: 12,
    color: c.texteMuted,
    borderBottom: `1px solid ${c.bordure}`,
    whiteSpace: 'nowrap',
  }
  const td = { padding: isMobile ? '10px 8px' : '12px 14px', fontSize: 14, color: c.texte, borderBottom: `1px solid ${c.bordure}` }
  const tdNum = { ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }
  const tdMuted = { ...tdNum, color: c.texteMuted }

  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: c.texte }}>Consommations théoriques d&apos;ingrédients</div>
        <div style={{ fontSize: 12, color: c.texteMuted, marginTop: 2 }}>
          Quantités calculées d&apos;après les recettes et les ventes : qté vendue × qté recette / nb portions.
        </div>
      </div>

      {consoLignes.length === 0 ? (
        <p style={{ color: c.texteMuted, fontSize: 14 }}>
          {!hasVentes
            ? 'Aucune vente sur cette période.'
            : 'Aucune composition disponible (vérifiez que les fiches ont des ingrédients et un nombre de portions renseigné).'}
        </p>
      ) : (
        <div style={{ overflowX: 'auto', borderRadius: 12, border: `0.5px solid ${c.bordure}`, background: c.blanc }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: isMobile ? 200 : 0 }}>
            <thead>
              <tr style={{ background: c.fond }}>
                <th style={th}>Ingrédient</th>
                <th style={{ ...th, textAlign: 'right' }}>Qté théorique</th>
                <th style={th}>Unité</th>
                {!isMobile && <th style={{ ...th, textAlign: 'right', color: c.texteMuted }}>Achats réels</th>}
                {!isMobile && <th style={{ ...th, textAlign: 'right', color: c.texteMuted }}>Écart</th>}
              </tr>
            </thead>
            <tbody>
              {consoLignes.map((L) => (
                <tr key={L.ingredient_id}>
                  <td style={td}>{L.nom}</td>
                  <td style={tdNum}>{formatQte(L.qteTotale)}</td>
                  <td style={td}>{L.unite}</td>
                  {!isMobile && <td style={tdMuted}>—</td>}
                  {!isMobile && <td style={tdMuted}>—</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
