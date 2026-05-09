'use client'

import {
  ResponsiveContainer, ComposedChart, Line, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'

// Évolution du CA TTC réel comparé au budget cumulé sur la période,
// granularité automatique (jour ≤ 31 j, semaine ≤ 6 mois, mois sinon).
//
// `buckets` est la sortie de bucketDays(daysWithBudget, granularity) :
//   { key, label, caTot, couverts, budget, count }
export default function SectionEvolutionCa({ c, isMobile, buckets, granularity, hasBudget }) {
  const empty = !buckets || buckets.length === 0
  return (
    <div style={{
      background: c.blanc, borderRadius: 12,
      border: `0.5px solid ${c.bordure}`,
      padding: isMobile ? '14px 10px' : '20px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: c.texte }}>Évolution du CA TTC</div>
          <div style={{ fontSize: 12, color: c.texteMuted, marginTop: 2 }}>
            Granularité : {granularityLabel(granularity)}{hasBudget ? ' — barres = budget cible' : ''}
          </div>
        </div>
      </div>
      {empty ? (
        <EmptyState c={c} />
      ) : (
        <ResponsiveContainer width="100%" height={isMobile ? 220 : 280}>
          <ComposedChart data={buckets} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={c.bordure} />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: c.texteMuted }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: c.texteMuted }} axisLine={false} tickLine={false} tickFormatter={(v) => formatAxisEur(v)} />
            <Tooltip
              contentStyle={{ borderRadius: 8, border: `0.5px solid ${c.bordure}`, fontSize: 12 }}
              formatter={(v, name) => [formatTooltipEur(v), name]}
            />
            <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
            {hasBudget && (
              <Bar dataKey="budget" name="Budget" fill={c.accentClair} radius={[4, 4, 0, 0]} />
            )}
            <Line type="monotone" dataKey="caTot" name="CA TTC réel" stroke={c.accent} strokeWidth={2} dot={{ r: 3 }} />
          </ComposedChart>
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
