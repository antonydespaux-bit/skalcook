// Bloc visuel commun aux KPIs Analyses (couverts, CA TTC, CA HT, TM, écart budget).
// Pas de fetch ici — la valeur et la comparaison viennent du parent.
//
// `comparison` (optionnel) :
//   { delta: number|null, deltaLabel: string, mode: 'success'|'danger'|'neutral'|'none' }
//
// `breakdownByLieu` / `breakdownByService` (optionnels, PR 6) :
//   array [{ serie, value, pct }] trié décroissant. Affiché en sous-titre
//   sous la valeur quand au moins 2 séries ont du contenu — utile pour
//   les présentations ("Salle 60 % · Privat 40 %").
export default function KpiCard({
  c, isMobile, label, value, hint, comparison,
  breakdownByLieu, breakdownByService,
}) {
  const showLieuBreakdown = breakdownByLieu && breakdownByLieu.filter((e) => e.value > 0).length >= 2
  const showServiceBreakdown = breakdownByService && breakdownByService.filter((e) => e.value > 0).length >= 2
  return (
    <div style={{
      background: c.blanc, borderRadius: '12px',
      padding: isMobile ? '14px' : '20px',
      border: `0.5px solid ${c.bordure}`,
    }}>
      <div className="sk-label-muted" style={{ color: c.texteMuted, marginBottom: '8px' }}>
        {label}
      </div>
      <div className="sk-stat-value" style={{ fontSize: isMobile ? '22px' : '28px', color: c.texte }}>
        {value}
      </div>
      {comparison ? (
        <ComparisonLine c={c} comparison={comparison} />
      ) : hint ? (
        <div style={{ fontSize: '11px', color: c.texteMuted, marginTop: '6px' }}>{hint}</div>
      ) : null}
      {showLieuBreakdown && <BreakdownLine c={c} breakdown={breakdownByLieu} />}
      {showServiceBreakdown && <BreakdownLine c={c} breakdown={breakdownByService} />}
    </div>
  )
}

function ComparisonLine({ c, comparison }) {
  const color = comparison.mode === 'success' ? c.vert
    : comparison.mode === 'danger' ? c.rouge
    : comparison.mode === 'neutral' ? c.orange
    : c.texteMuted
  return (
    <div style={{ fontSize: '11px', color, marginTop: '6px', fontWeight: 600 }}>
      {comparison.deltaLabel}
    </div>
  )
}

// "Salle 60 % · Privat 30 % · Table chef 10 %" — affichage compact.
function BreakdownLine({ c, breakdown }) {
  const visible = breakdown.filter((e) => e.value > 0)
  return (
    <div style={{ fontSize: '11px', color: c.texteMuted, marginTop: '4px' }}>
      {visible.map((e, i) => (
        <span key={e.serie}>
          {i > 0 && <span style={{ margin: '0 6px', opacity: 0.5 }}>·</span>}
          <span style={{ color: c.texte, fontWeight: 500 }}>{e.serie}</span>
          {' '}
          <span>{e.pct.toFixed(0)} %</span>
        </span>
      ))}
    </div>
  )
}
