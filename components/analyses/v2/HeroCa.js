'use client'

import { ResponsiveContainer, AreaChart, Area, Line } from 'recharts'
import { formatEur, formatNombre, formatEur2 } from '../../../lib/caAnalyses'

// Carte « héros » de la vue Synthèse : CA TTC en grand + delta vs comparaison,
// rappel budget, sparkline N/N-1, et 3 mini-KPI (Couverts, Ticket moyen, CA HT).
export default function HeroCa({
  c, isMobile, totals, compareTotals, periodBudget,
  sparkBuckets, currentLabel, compareLabel, comparaison,
}) {
  const caDelta = deltaPct(totals.caTtc, compareTotals?.caTtc)
  const budgetPct = periodBudget > 0 ? (totals.caTtc / periodBudget) * 100 : null
  const budgetEcart = periodBudget > 0 ? ((totals.caTtc - periodBudget) / periodBudget) * 100 : null

  return (
    <div style={cardStyle(c, isMobile)}>
      <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? 16 : 28 }}>
        {/* Bloc principal */}
        <div style={{ flex: 1.1, minWidth: 0 }}>
          <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.6, color: c.texteMuted }}>
            CA TTC · cumulé période
          </div>
          <div style={{ fontSize: isMobile ? 32 : 42, fontWeight: 700, lineHeight: 1.1, marginTop: 4, color: c.texte }}>
            {formatEur(totals.caTtc)}
          </div>
          {caDelta != null && (
            <div style={{ fontSize: 14, fontWeight: 600, marginTop: 4, color: deltaColor(c, caDelta) }}>
              {arrow(caDelta)} {Math.abs(caDelta).toFixed(1)} % vs {compareLabel}
            </div>
          )}
          {periodBudget > 0 && (
            <div style={{ fontSize: 12.5, color: c.texteMuted, marginTop: 10 }}>
              Budget <b style={{ color: c.texte }}>{formatEur(periodBudget)}</b>
              {budgetPct != null && <> · réalisé à <b style={{ color: c.texte }}>{budgetPct.toFixed(1)} %</b></>}
              {budgetEcart != null && <> · écart <span style={{ color: deltaColor(c, budgetEcart), fontWeight: 600 }}>{budgetEcart >= 0 ? '+' : ''}{budgetEcart.toFixed(1)} %</span></>}
            </div>
          )}
          {sparkBuckets && sparkBuckets.length > 1 && (
            <div style={{ height: 60, marginTop: 12 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={sparkBuckets} margin={{ top: 4, right: 2, left: 2, bottom: 0 }}>
                  {sparkBuckets[0]?.caTotN1 != null && (
                    <Line type="monotone" dataKey="caTotN1" stroke={c.texteMuted} strokeWidth={2}
                      strokeDasharray="5 4" dot={false} connectNulls isAnimationActive={false} />
                  )}
                  <defs>
                    <linearGradient id="heroSpark" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={c.accent} stopOpacity={0.18} />
                      <stop offset="100%" stopColor={c.accent} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Area type="monotone" dataKey="caTot" stroke={c.accent} strokeWidth={2.5}
                    fill="url(#heroSpark)" dot={false} isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Mini-KPI */}
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          borderLeft: isMobile ? 'none' : `1px solid ${c.bordure}`,
          borderTop: isMobile ? `1px solid ${c.bordure}` : 'none',
          paddingLeft: isMobile ? 0 : 24, paddingTop: isMobile ? 12 : 0,
        }}>
          <Mini c={c} label="Couverts" value={formatNombre(totals.couverts)} delta={deltaPct(totals.couverts, compareTotals?.couverts)} compareLabel={compareLabel} />
          <Mini c={c} label="Ticket moyen" value={totals.tm != null ? formatEur2(totals.tm) : '—'} delta={deltaPct(totals.tm, compareTotals?.tm)} compareLabel={compareLabel} />
          <Mini c={c} label="CA HT" value={formatEur(totals.caHt)} delta={deltaPct(totals.caHt, compareTotals?.caHt)} compareLabel={compareLabel} last />
        </div>
      </div>
    </div>
  )
}

function Mini({ c, label, value, delta, last }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
      padding: '10px 0', borderBottom: last ? 'none' : `1px solid ${c.bordure}`, flex: 1,
    }}>
      <span style={{ fontSize: 13, color: c.texteMuted }}>{label}</span>
      <span>
        <span style={{ fontSize: 20, fontWeight: 600, color: c.texte }}>{value}</span>
        {delta != null && (
          <span style={{ fontSize: 12, fontWeight: 600, marginLeft: 8, color: deltaColor(c, delta) }}>
            {arrow(delta)}{Math.abs(delta).toFixed(1)}%
          </span>
        )}
      </span>
    </div>
  )
}

function deltaPct(cur, prev) {
  if (prev == null || cur == null || prev === 0) return null
  return ((cur - prev) / prev) * 100
}
function arrow(d) { return d > 0 ? '▲' : d < 0 ? '▼' : '→' }
function deltaColor(c, d) { return d > 0 ? c.vert : d < 0 ? c.rouge : c.texteMuted }

function cardStyle(c, isMobile) {
  return {
    background: c.blanc, border: `1px solid ${c.bordure}`,
    borderRadius: 14, padding: isMobile ? 16 : 20,
  }
}
