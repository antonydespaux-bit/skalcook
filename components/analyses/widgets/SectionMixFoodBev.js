'use client'

import { useState } from 'react'
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend,
} from 'recharts'
import { formatEur } from '../../../lib/caAnalyses'

// Mix CA TTC par catégorie (Food / Alcool / Soft / Autres) sur la période.
// Modes :
//   - "Synthèse" (défaut) : 1 camembert + tableau récap
//   - "Détaillé" : matrice service × catégorie en %, utile pour répondre à
//     "le CA est à 65 % le midi en food, X % en bev midi, …"
//
// `matrix` est la sortie de mixByService(filteredRows) :
//   [{ service, label, food, bev20, bev10, autre, ttc, pctFood, …, pctTotal }]
export default function SectionMixFoodBev({ c, isMobile, segments, totalCaTtc, matrix }) {
  const [mode, setMode] = useState('synthese')
  const empty = !segments || segments.length === 0
  return (
    <div style={{
      background: c.blanc, borderRadius: 12,
      border: `0.5px solid ${c.bordure}`,
      padding: isMobile ? '14px 10px' : '20px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: c.texte }}>Mix CA — Food / Boissons / Autres</div>
          <div style={{ fontSize: 12, color: c.texteMuted, marginTop: 2 }}>
            {mode === 'synthese'
              ? 'Répartition du CA TTC sur la période (cible : 65 % Food / 28 % Alcool / 7 % Soft)'
              : 'Détail % par service × catégorie (% du CA TTC global)'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <ModeBtn c={c} active={mode === 'synthese'} onClick={() => setMode('synthese')}>Synthèse</ModeBtn>
          <ModeBtn c={c} active={mode === 'detaille'} onClick={() => setMode('detaille')}>Détaillé</ModeBtn>
        </div>
      </div>
      {empty
        ? <EmptyState c={c} />
        : mode === 'synthese'
          ? <SyntheseView c={c} isMobile={isMobile} segments={segments} totalCaTtc={totalCaTtc} />
          : <DetailleView c={c} matrix={matrix} totalCaTtc={totalCaTtc} />}
    </div>
  )
}

function ModeBtn({ c, active, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      padding: '4px 10px', borderRadius: 16, fontSize: 11,
      border: `1px solid ${active ? c.accent : c.bordure}`,
      background: active ? c.accent : c.blanc,
      color: active ? c.texte : c.texteMuted,
      cursor: 'pointer', fontWeight: active ? 600 : 500,
    }}>{children}</button>
  )
}

function SyntheseView({ c, isMobile, segments, totalCaTtc }) {
  return (
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
  )
}

function DetailleView({ c, matrix, totalCaTtc }) {
  if (!matrix || matrix.every((m) => m.ttc === 0)) {
    return <EmptyState c={c} />
  }
  const th = { textAlign: 'right', padding: '8px 10px', color: c.texteMuted, fontWeight: 600, fontSize: 12, borderBottom: `1px solid ${c.bordure}` }
  const thLeft = { ...th, textAlign: 'left' }
  const td = { textAlign: 'right', padding: '8px 10px', color: c.texte, fontSize: 12, borderBottom: `1px solid ${c.bordure}`, fontVariantNumeric: 'tabular-nums' }
  const tdLeft = { ...td, textAlign: 'left', fontWeight: 500 }
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 480 }}>
        <thead>
          <tr>
            <th style={thLeft}>Service</th>
            <th style={th}>Food</th>
            <th style={th}>Alcool</th>
            <th style={th}>Soft</th>
            <th style={th}>Autres</th>
            <th style={th}>Total service</th>
          </tr>
        </thead>
        <tbody>
          {matrix.map((m) => (
            <tr key={m.service}>
              <td style={tdLeft}>{m.label}</td>
              <td style={td}>{m.pctFood.toFixed(1)} %<br/><Sub c={c}>{formatEur(m.food)}</Sub></td>
              <td style={td}>{m.pctBev20.toFixed(1)} %<br/><Sub c={c}>{formatEur(m.bev20)}</Sub></td>
              <td style={td}>{m.pctBev10.toFixed(1)} %<br/><Sub c={c}>{formatEur(m.bev10)}</Sub></td>
              <td style={td}>{m.pctAutre.toFixed(1)} %<br/><Sub c={c}>{formatEur(m.autre)}</Sub></td>
              <td style={{ ...td, fontWeight: 700 }}>{m.pctTotal.toFixed(1)} %<br/><Sub c={c}>{formatEur(m.ttc)}</Sub></td>
            </tr>
          ))}
          <tr style={{ background: c.fond, fontWeight: 700 }}>
            <td style={tdLeft}>Total</td>
            <td style={td}>{summedPct(matrix, 'pctFood').toFixed(1)} %</td>
            <td style={td}>{summedPct(matrix, 'pctBev20').toFixed(1)} %</td>
            <td style={td}>{summedPct(matrix, 'pctBev10').toFixed(1)} %</td>
            <td style={td}>{summedPct(matrix, 'pctAutre').toFixed(1)} %</td>
            <td style={td}>100 %<br/><Sub c={c}>{formatEur(totalCaTtc)}</Sub></td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

function summedPct(matrix, key) {
  return matrix.reduce((s, m) => s + m[key], 0)
}

function Sub({ c, children }) {
  return <span style={{ color: c.texteMuted, fontWeight: 400, fontSize: 11 }}>{children}</span>
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
