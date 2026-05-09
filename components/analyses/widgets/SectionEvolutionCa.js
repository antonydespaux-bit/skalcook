'use client'

import {
  ResponsiveContainer, ComposedChart, LineChart, Line, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'

// Évolution du CA TTC sur la période, granularité automatique.
// Modes :
//   - cumulé (isSplit=false) : ComposedChart avec barres budget + ligne CA réel
//   - multi-séries (isSplit=true) : LineChart avec une ligne par lieu/service
//     sélectionné. Le budget est masqué (il ne se split pas naturellement).
//
// `buckets` (cumulé) : sortie de bucketDays(daysWithBudget, granularity)
// `bucketsMulti` (split) : { series: [...], buckets: [{ key, label, ['Salle']: 100, ['Privat']: 80, … }] }
export default function SectionEvolutionCa({ c, isMobile, buckets, bucketsMulti, isSplit, granularity, hasBudget }) {
  const hint = `Granularité : ${granularityLabel(granularity)}${
    isSplit ? ' — 1 ligne par série' : (hasBudget ? ' — barres = budget cible' : '')
  }`
  return (
    <div style={{
      background: c.blanc, borderRadius: 12,
      border: `0.5px solid ${c.bordure}`,
      padding: isMobile ? '14px 10px' : '20px',
    }}>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: c.texte }}>Évolution du CA TTC</div>
        <div style={{ fontSize: 12, color: c.texteMuted, marginTop: 2 }}>{hint}</div>
      </div>
      {isSplit
        ? <MultiSeriesChart c={c} isMobile={isMobile} bucketsMulti={bucketsMulti} />
        : <CumulatedChart c={c} isMobile={isMobile} buckets={buckets} hasBudget={hasBudget} />}
    </div>
  )
}

function CumulatedChart({ c, isMobile, buckets, hasBudget }) {
  if (!buckets || buckets.length === 0) return <EmptyState c={c} />
  return (
    <ResponsiveContainer width="100%" height={isMobile ? 220 : 280}>
      <ComposedChart data={buckets} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={c.bordure} />
        <XAxis dataKey="label" tick={{ fontSize: 10, fill: c.texteMuted }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 10, fill: c.texteMuted }} axisLine={false} tickLine={false} tickFormatter={formatAxisEur} />
        <Tooltip contentStyle={{ borderRadius: 8, border: `0.5px solid ${c.bordure}`, fontSize: 12 }}
          formatter={(v, name) => [formatTooltipEur(v), name]} />
        <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
        {hasBudget && <Bar dataKey="budget" name="Budget" fill={c.accentClair} radius={[4, 4, 0, 0]} />}
        <Line type="monotone" dataKey="caTot" name="CA TTC réel" stroke={c.accent} strokeWidth={2} dot={{ r: 3 }} />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

function MultiSeriesChart({ c, isMobile, bucketsMulti }) {
  if (!bucketsMulti || bucketsMulti.buckets.length === 0) return <EmptyState c={c} />
  const { buckets, series } = bucketsMulti
  return (
    <ResponsiveContainer width="100%" height={isMobile ? 220 : 280}>
      <LineChart data={buckets} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={c.bordure} />
        <XAxis dataKey="label" tick={{ fontSize: 10, fill: c.texteMuted }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 10, fill: c.texteMuted }} axisLine={false} tickLine={false} tickFormatter={formatAxisEur} />
        <Tooltip contentStyle={{ borderRadius: 8, border: `0.5px solid ${c.bordure}`, fontSize: 12 }}
          formatter={(v, name) => [formatTooltipEur(v), name]} />
        <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
        {series.map((s, i) => (
          <Line key={s} type="monotone" dataKey={s} stroke={seriesColor(c, i)} strokeWidth={2} dot={{ r: 2 }} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}

// Palette pour multi-séries — réutilise les couleurs sémantiques du thème
// (et leur ordre) pour rester lisible sur les présentations.
function seriesColor(c, i) {
  const palette = [c.accent, c.violet, c.orange, c.vert, c.rouge, c.principal]
  return palette[i % palette.length]
}

function granularityLabel(g) {
  if (g === 'day') return 'jour par jour'
  if (g === 'week') return 'semaine par semaine'
  if (g === 'month') return 'mois par mois'
  return ''
}

function formatAxisEur(v) {
  if (v == null) return ''
  if (Math.abs(v) >= 1000) return `${Math.round(v / 1000)} k€`
  return `${Math.round(v)} €`
}

function formatTooltipEur(v) {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency', currency: 'EUR', maximumFractionDigits: 0,
  }).format(Number(v) || 0)
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
