import KpiCard from './KpiCard'
import { buildComparison, formatEur, formatDeltaEur } from '../../../lib/caAnalyses'

export default function KpiCaHt({ c, isMobile, totals, comparisonTotals, comparisonLabel, breakdownByLieu, breakdownByService }) {
  const value = totals ? formatEur(totals.caHt) : '—'
  const comparison = comparisonTotals && totals
    ? buildComparison({
        current: totals.caHt,
        target: comparisonTotals.caHt,
        formatDelta: formatDeltaEur,
        label: comparisonLabel,
      })
    : null
  return (
    <KpiCard
      c={c}
      isMobile={isMobile}
      label="CA HT"
      value={value}
      hint={comparison ? null : 'Net de TVA (10 % Food/Soft, 20 % Alcool)'}
      comparison={comparison}
      breakdownByLieu={breakdownByLieu}
      breakdownByService={breakdownByService}
    />
  )
}
