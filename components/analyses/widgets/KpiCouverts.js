import KpiCard from './KpiCard'
import { buildComparison, formatNombre } from '../../../lib/caAnalyses'

export default function KpiCouverts({ c, isMobile, totals, comparisonTotals, comparisonLabel }) {
  const value = totals ? formatNombre(totals.couverts) : '—'
  const comparison = comparisonTotals && totals
    ? buildComparison({
        current: totals.couverts,
        target: comparisonTotals.couverts,
        formatDelta: (d) => `${d >= 0 ? '+' : ''}${formatNombre(d)}`,
        label: comparisonLabel,
      })
    : null
  return (
    <KpiCard
      c={c}
      isMobile={isMobile}
      label="Couverts"
      value={value}
      hint={comparison ? null : 'Sur la période'}
      comparison={comparison}
    />
  )
}
