'use client'

import { formatEur, formatNombre } from '../../../lib/caAnalyses'

// Bandeau récapitulatif affiché en tête de page quand la comparaison N-1 est
// active. Met en évidence les deux années côte à côte sur les 3 indicateurs
// clés (CA TTC, couverts, ticket moyen) avec l'écart % coloré — pour donner
// un verdict immédiat avant même de lire les graphiques détaillés.
export default function ComparisonRecapBanner({ c, isMobile, totals, compareTotals, currentLabel, compareLabel }) {
  if (!totals || !compareTotals) return null

  const items = [
    { id: 'caTtc', label: 'CA TTC', cur: totals.caTtc, prev: compareTotals.caTtc, fmt: formatEur },
    { id: 'couverts', label: 'Couverts', cur: totals.couverts, prev: compareTotals.couverts, fmt: formatNombre },
    { id: 'tm', label: 'Ticket moyen', cur: totals.tm, prev: compareTotals.tm, fmt: formatEur },
  ]

  return (
    <div style={{
      background: c.blanc, borderRadius: 12, border: `0.5px solid ${c.bordure}`,
      padding: isMobile ? '12px 14px' : '16px 20px', marginBottom: isMobile ? 12 : 16,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        fontSize: 12, color: c.texteMuted, marginBottom: 12,
      }}>
        <LegendDot color={c.accent} />
        <span style={{ fontWeight: 600, color: c.texte }}>{currentLabel}</span>
        <span style={{ opacity: 0.5 }}>vs</span>
        <LegendDot color={c.texteMuted} dashed />
        <span>{compareLabel}</span>
      </div>
      <div style={{
        display: 'grid', gridTemplateColumns: `repeat(${isMobile ? 1 : 3}, 1fr)`,
        gap: isMobile ? 10 : 16,
      }}>
        {items.map((it) => (
          <RecapCell key={it.id} c={c} isMobile={isMobile}
            label={it.label} cur={it.cur} prev={it.prev} fmt={it.fmt} />
        ))}
      </div>
    </div>
  )
}

function RecapCell({ c, isMobile, label, cur, prev, fmt }) {
  const delta = (Number(cur) || 0) - (Number(prev) || 0)
  const pct = prev ? (delta / prev) * 100 : null
  const up = delta > 0
  const flat = delta === 0 || pct == null
  const color = flat ? c.texteMuted : up ? c.vert : c.rouge
  const arrow = flat ? '→' : up ? '▲' : '▼'

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 2,
      paddingTop: isMobile ? 8 : 0,
      borderTop: isMobile ? `0.5px solid ${c.bordure}` : 'none',
    }}>
      <div style={{ fontSize: 11, color: c.texteMuted, textTransform: 'uppercase', letterSpacing: 0.3 }}>
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: isMobile ? 20 : 24, fontWeight: 600, color: c.texte }}>
          {fmt(cur)}
        </span>
        {pct != null && (
          <span style={{ fontSize: 12, fontWeight: 600, color }}>
            {arrow} {Math.abs(pct).toFixed(1)} %
          </span>
        )}
      </div>
      <div style={{ fontSize: 11, color: c.texteMuted }}>
        {fmt(prev)} l'an dernier
      </div>
    </div>
  )
}

function LegendDot({ color, dashed }) {
  return (
    <span style={{
      display: 'inline-block', width: 14, height: 0,
      borderTop: `2px ${dashed ? 'dashed' : 'solid'} ${color}`,
    }} />
  )
}
