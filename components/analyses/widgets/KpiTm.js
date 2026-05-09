import KpiCard from './KpiCard'
import { buildComparison, formatEur2, formatDeltaEur } from '../../../lib/caAnalyses'

export default function KpiTm({ c, isMobile, totals, comparisonTotals, comparisonLabel }) {
  const value = totals && totals.tm != null ? formatEur2(totals.tm) : '—'
  const comparison = comparisonTotals && comparisonTotals.tm != null && totals && totals.tm != null
    ? buildComparison({
        current: totals.tm,
        target: comparisonTotals.tm,
        formatDelta: (d) => formatDeltaEur(d),
        label: comparisonLabel,
      })
    : null
  return (
    <KpiCard
      c={c}
      isMobile={isMobile}
      label="Ticket moyen"
      value={value}
      hint={comparison ? null : 'CA TTC / couverts'}
      comparison={comparison}
    />
  )
}
