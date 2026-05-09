'use client'

import {
  ResponsiveContainer, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts'

// Évolution des couverts servis sur la période, granularité auto.
export default function SectionEvolutionCouverts({ c, isMobile, buckets, granularity }) {
  const empty = !buckets || buckets.length === 0
  return (
    <div style={{
      background: c.blanc, borderRadius: 12,
      border: `0.5px solid ${c.bordure}`,
      padding: isMobile ? '14px 10px' : '20px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: c.texte }}>Évolution des couverts</div>
          <div style={{ fontSize: 12, color: c.texteMuted, marginTop: 2 }}>
            {granularityLabel(granularity)}
          </div>
        </div>
      </div>
      {empty ? (
        <EmptyState c={c} />
      ) : (
        <ResponsiveContainer width="100%" height={isMobile ? 220 : 280}>
          <LineChart data={buckets} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={c.bordure} />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: c.texteMuted }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: c.texteMuted }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{ borderRadius: 8, border: `0.5px solid ${c.bordure}`, fontSize: 12 }}
              formatter={(v) => [`${Number(v).toLocaleString('fr-FR')} couverts`, 'Couverts']}
            />
            <Line type="monotone" dataKey="couverts" name="Couverts" stroke={c.violet} strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}

function granularityLabel(g) {
  if (g === 'day') return 'jour par jour'
  if (g === 'week') return 'semaine par semaine'
  if (g === 'month') return 'mois par mois'
  return ''
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
