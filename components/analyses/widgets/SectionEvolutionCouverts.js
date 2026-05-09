'use client'

import {
  ResponsiveContainer, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'

// Évolution des couverts servis sur la période, granularité auto.
// `bucketsMulti` activé en mode split (1 ligne par lieu/service).
export default function SectionEvolutionCouverts({ c, isMobile, buckets, bucketsMulti, isSplit, granularity }) {
  const empty = isSplit
    ? !bucketsMulti || bucketsMulti.buckets.length === 0
    : !buckets || buckets.length === 0
  return (
    <div style={{
      background: c.blanc, borderRadius: 12,
      border: `0.5px solid ${c.bordure}`,
      padding: isMobile ? '14px 10px' : '20px',
    }}>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: c.texte }}>Évolution des couverts</div>
        <div style={{ fontSize: 12, color: c.texteMuted, marginTop: 2 }}>
          {granularityLabel(granularity)}{isSplit ? ' — 1 ligne par série' : ''}
        </div>
      </div>
      {empty ? (
        <EmptyState c={c} />
      ) : isSplit ? (
        <MultiSeriesChart c={c} isMobile={isMobile} bucketsMulti={bucketsMulti} />
      ) : (
        <SingleChart c={c} isMobile={isMobile} buckets={buckets} />
      )}
    </div>
  )
}

function SingleChart({ c, isMobile, buckets }) {
  return (
    <ResponsiveContainer width="100%" height={isMobile ? 220 : 280}>
      <LineChart data={buckets} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={c.bordure} />
        <XAxis dataKey="label" tick={{ fontSize: 10, fill: c.texteMuted }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 10, fill: c.texteMuted }} axisLine={false} tickLine={false} />
        <Tooltip contentStyle={{ borderRadius: 8, border: `0.5px solid ${c.bordure}`, fontSize: 12 }}
          formatter={(v) => [`${Number(v).toLocaleString('fr-FR')} couverts`, 'Couverts']} />
        <Line type="monotone" dataKey="couverts" name="Couverts" stroke={c.violet} strokeWidth={2} dot={{ r: 3 }} />
      </LineChart>
    </ResponsiveContainer>
  )
}

function MultiSeriesChart({ c, isMobile, bucketsMulti }) {
  const { buckets, series } = bucketsMulti
  return (
    <ResponsiveContainer width="100%" height={isMobile ? 220 : 280}>
      <LineChart data={buckets} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={c.bordure} />
        <XAxis dataKey="label" tick={{ fontSize: 10, fill: c.texteMuted }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 10, fill: c.texteMuted }} axisLine={false} tickLine={false} />
        <Tooltip contentStyle={{ borderRadius: 8, border: `0.5px solid ${c.bordure}`, fontSize: 12 }}
          formatter={(v, name) => [`${Number(v).toLocaleString('fr-FR')}`, name]} />
        <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
        {series.map((s, i) => (
          <Line key={s} type="monotone" dataKey={s} stroke={seriesColor(c, i)} strokeWidth={2} dot={{ r: 2 }} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}

function seriesColor(c, i) {
  const palette = [c.violet, c.accent, c.orange, c.vert, c.rouge, c.principal]
  return palette[i % palette.length]
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
