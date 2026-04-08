'use client'

import { useTheme } from '../../lib/useTheme'
import { useIsMobile } from '../../lib/useIsMobile'
import {
  AreaChart, Area, ScatterChart, Scatter, ReferenceLine,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'

export default function Charts({ chartData, menuEngineeringData }) {
  const { c } = useTheme()
  const isMobile = useIsMobile()

  if (!chartData.length) return null

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
      gap: isMobile ? 12 : 16,
      marginBottom: 24,
    }}>
      {/* AreaChart — CA vs Coût Matière */}
      <div style={{ background: c.blanc, borderRadius: 12, border: `0.5px solid ${c.bordure}`, padding: isMobile ? '14px 8px' : '20px' }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: c.texte, marginBottom: 12 }}>
          Évolution CA vs Coût Matière
        </div>
        <ResponsiveContainer width="100%" height={isMobile ? 180 : 220}>
          <AreaChart data={chartData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={c.bordure} />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: c.texteMuted }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: c.texteMuted }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}€`} />
            <Tooltip
              contentStyle={{ borderRadius: 8, border: `0.5px solid ${c.bordure}`, fontSize: 12 }}
              formatter={(v) => [`${Number(v).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`]}
            />
            <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
            <Area type="monotone" dataKey="ca" name="CA HT" stroke={c.accent} fill={c.accentClair} strokeWidth={2} dot={false} />
            <Area type="monotone" dataKey="cout" name="Coût Matière" stroke="#D97706" fill="#FEF3C7" strokeWidth={2} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* ScatterChart — Matrice Menu Engineering */}
      {menuEngineeringData.points.length > 0 && (
        <div style={{ background: c.blanc, borderRadius: 12, border: `0.5px solid ${c.bordure}`, padding: isMobile ? '14px 8px' : '20px' }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: c.texte, marginBottom: 6 }}>
            Matrice Menu Engineering
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12, fontSize: 11 }}>
            <span style={{ color: '#D97706', fontWeight: 500 }}>❓ Dilemmes</span>
            <span style={{ color: '#3B6D11', fontWeight: 500 }}>⭐ Stars</span>
            <span style={{ color: '#A32D2D', fontWeight: 500 }}>🐕 Poids morts</span>
            <span style={{ color: '#6366F1', fontWeight: 500 }}>🐄 Vaches à lait</span>
          </div>
          <ResponsiveContainer width="100%" height={isMobile ? 220 : 280}>
            <ScatterChart margin={{ top: 10, right: 20, bottom: 30, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={c.bordure} />
              <XAxis
                type="number"
                dataKey="x"
                name="Popularité"
                label={{ value: '−  Popularité  +', position: 'insideBottom', offset: -18, fontSize: 10, fill: c.texteMuted }}
                tick={{ fontSize: 9, fill: c.texteMuted }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                type="number"
                dataKey="y"
                name="Marge %"
                label={{ value: '−  Marge %  +', angle: -90, position: 'insideLeft', offset: 14, fontSize: 10, fill: c.texteMuted }}
                tick={{ fontSize: 9, fill: c.texteMuted }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `${v.toFixed(0)}%`}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null
                  const d = payload[0].payload
                  return (
                    <div style={{ background: c.blanc, border: `0.5px solid ${c.bordure}`, borderRadius: 8, padding: '8px 12px', fontSize: 12, maxWidth: 200 }}>
                      <div style={{ fontWeight: 600, marginBottom: 4 }}>{d.nom}</div>
                      <div style={{ color: d.quadrantColor, fontWeight: 500, marginBottom: 4 }}>{d.quadrant}</div>
                      <div style={{ color: c.texteMuted }}>Popularité : {Number(d.x).toLocaleString('fr-FR', { maximumFractionDigits: 1 })}</div>
                      <div style={{ color: c.texteMuted }}>Marge : {Number(d.y).toFixed(1)} %</div>
                    </div>
                  )
                }}
              />
              <ReferenceLine x={menuEngineeringData.avgQte} stroke={c.texteMuted} strokeDasharray="4 4" strokeWidth={1} />
              <ReferenceLine y={menuEngineeringData.avgMarge} stroke={c.texteMuted} strokeDasharray="4 4" strokeWidth={1} />
              <Scatter
                data={menuEngineeringData.points}
                shape={(props) => {
                  const { cx, cy, payload } = props
                  return (
                    <circle
                      cx={cx} cy={cy} r={5}
                      fill={payload.quadrantColor}
                      fillOpacity={0.85}
                      stroke="white"
                      strokeWidth={1}
                    />
                  )
                }}
              />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
