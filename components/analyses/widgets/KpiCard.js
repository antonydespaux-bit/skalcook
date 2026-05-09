// Bloc visuel commun aux KPIs Analyses (couverts, CA TTC, CA HT, TM, écart budget).
// Pas de fetch ici — la valeur et la comparaison viennent du parent.
//
// `comparison` (optionnel) :
//   { delta: number|null, deltaLabel: string, mode: 'success'|'danger'|'neutral'|'none' }
//
// La page passe `null` quand l'user a sélectionné "Aucune comparaison".
export default function KpiCard({ c, isMobile, label, value, hint, comparison }) {
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
