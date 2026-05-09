'use client'

import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend,
} from 'recharts'
import { formatEur } from '../../../lib/caAnalyses'

// Camembert du mix CA TTC par catégorie (Food / Alcool / Soft / Autres)
// + tableau récap des montants et pourcentages.
//
// `segments` = sortie de mixSegments(totals, c) :
//   [{ id, label, value, color, pct }] (déjà filtré et avec pourcentages)
export default function SectionMixFoodBev({ c, isMobile, segments, totalCaTtc }) {
  const empty = !segments || segments.length === 0
  return (
    <div style={{
      background: c.blanc, borderRadius: 12,
      border: `0.5px solid ${c.bordure}`,
      padding: isMobile ? '14px 10px' : '20px',
    }}>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: c.texte }}>Mix CA — Food / Boissons / Autres</div>
        <div style={{ fontSize: 12, color: c.texteMuted, marginTop: 2 }}>
          Répartition du CA TTC sur la période (cible : 65 % Food / 28 % Alcool / 7 % Soft)
        </div>
      </div>
      {empty ? (
        <EmptyState c={c} />
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
          gap: 16, alignItems: 'center',
        }}>
          <ResponsiveContainer width="100%" height={isMobile ? 200 : 240}>
            <PieChart>
              <Pie data={segments} dataKey="value" nameKey="label"
                cx="50%" cy="50%" outerRadius="80%" innerRadius="55%"
                stroke={c.blanc} strokeWidth={2}>
                {segments.map((s) => <Cell key={s.id} fill={s.color} />)}
              </Pie>
              <Tooltip
                contentStyle={{ borderRadius: 8, border: `0.5px solid ${c.bordure}`, fontSize: 12 }}
                formatter={(v, name) => [`${formatEur(Number(v))} (${pctOf(Number(v), totalCaTtc)})`, name]}
              />
              <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left',  padding: '6px 8px', color: c.texteMuted, fontWeight: 600 }}>Catégorie</th>
                <th style={{ textAlign: 'right', padding: '6px 8px', color: c.texteMuted, fontWeight: 600 }}>CA TTC</th>
                <th style={{ textAlign: 'right', padding: '6px 8px', color: c.texteMuted, fontWeight: 600 }}>%</th>
              </tr>
            </thead>
            <tbody>
              {segments.map((s) => (
                <tr key={s.id} style={{ borderTop: `0.5px solid ${c.bordure}` }}>
                  <td style={{ padding: '6px 8px', color: c.texte }}>
                    <span style={{
                      display: 'inline-block', width: 8, height: 8,
                      borderRadius: 2, background: s.color, marginRight: 8,
                    }} />
                    {s.label}
                  </td>
                  <td style={{ padding: '6px 8px', color: c.texte, textAlign: 'right' }}>{formatEur(s.value)}</td>
                  <td style={{ padding: '6px 8px', color: c.texte, textAlign: 'right', fontWeight: 600 }}>
                    {s.pct.toFixed(1)} %
                  </td>
                </tr>
              ))}
              <tr style={{ borderTop: `0.5px solid ${c.bordure}`, background: c.fond, fontWeight: 700 }}>
                <td style={{ padding: '6px 8px', color: c.texte }}>Total</td>
                <td style={{ padding: '6px 8px', color: c.texte, textAlign: 'right' }}>{formatEur(totalCaTtc)}</td>
                <td style={{ padding: '6px 8px', color: c.texte, textAlign: 'right' }}>100 %</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function pctOf(v, total) {
  if (!total) return '—'
  return `${((v / total) * 100).toFixed(1)} %`
}

function EmptyState({ c }) {
  return (
    <div style={{
      padding: '32px 16px', textAlign: 'center',
      color: c.texteMuted, fontSize: 13,
    }}>
      Aucune donnée sur la période sélectionnée.
    </div>
  )
}
