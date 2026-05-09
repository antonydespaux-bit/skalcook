import KpiCard from './KpiCard'
import { buildComparison, formatEur, formatDeltaEur } from '../../../lib/caAnalyses'

export default function KpiCaTtc({ c, isMobile, totals, comparisonTotals, comparisonLabel }) {
  const value = totals ? formatEur(totals.caTtc) : '—'
  const comparison = comparisonTotals && totals
    ? buildComparison({
        current: totals.caTtc,
        target: comparisonTotals.caTtc,
        formatDelta: formatDeltaEur,
        label: comparisonLabel,
      })
    : null
  return (
    <KpiCard
      c={c}
      isMobile={isMobile}
      label="CA TTC"
      value={value}
      hint={comparison ? null : 'Total Food + Boissons + Autres sur la période'}
      comparison={comparison}
    />
  )
}
