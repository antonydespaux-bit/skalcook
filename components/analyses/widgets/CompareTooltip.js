'use client'

// Tooltip personnalisé pour les charts en mode comparaison N-1.
// Affiche la valeur de l'année courante, celle de N-1, puis l'écart (€ ou
// nombre) et le % d'évolution coloré (vert = hausse, rouge = baisse).
//
// Props recharts : { active, payload, label }
// Props custom :
//   - c : palette thème
//   - currentLabel / compareLabel : libellés d'année (ex. "2026" / "2025")
//   - field / compareField : clés à lire dans le point (ex. 'caTot'/'caTotN1')
//   - unit : 'eur' | 'count' (formatage des valeurs)
export default function CompareTooltip({
  active, payload, label,
  c, currentLabel, compareLabel, field, compareField, unit = 'eur',
}) {
  if (!active || !payload || payload.length === 0) return null
  const row = payload[0]?.payload || {}
  const cur = row[field]
  const prev = row[compareField]
  const fmt = unit === 'eur' ? formatEur : formatCount
  const delta = (Number(cur) || 0) - (Number(prev) || 0)
  const pct = prev ? (delta / prev) * 100 : null
  const deltaColor = delta > 0 ? c.vert : delta < 0 ? c.rouge : c.texteMuted

  return (
    <div style={{
      background: c.blanc, border: `0.5px solid ${c.bordure}`,
      borderRadius: 8, padding: '8px 10px', fontSize: 12, minWidth: 150,
      boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
    }}>
      <div style={{ fontWeight: 600, color: c.texte, marginBottom: 6 }}>{label}</div>
      <Row c={c} dotColor={c.accent} name={currentLabel} value={fmt(cur)} bold />
      <Row c={c} dotColor={c.texteMuted} dashed name={compareLabel} value={fmt(prev)} muted />
      {prev != null && (
        <div style={{
          marginTop: 6, paddingTop: 6, borderTop: `0.5px solid ${c.bordure}`,
          color: deltaColor, fontWeight: 600, textAlign: 'right',
        }}>
          {delta >= 0 ? '+' : ''}{fmt(delta)}
          {pct != null && ` (${pct >= 0 ? '+' : ''}${pct.toFixed(1)} %)`}
        </div>
      )}
    </div>
  )
}

function Row({ c, dotColor, dashed, name, value, bold, muted }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: 16, color: muted ? c.texteMuted : c.texte, marginTop: 2,
    }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <span style={{
          display: 'inline-block', width: 12, height: 0,
          borderTop: `2px ${dashed ? 'dashed' : 'solid'} ${dotColor}`,
        }} />
        {name}
      </span>
      <span style={{ fontWeight: bold ? 600 : 400 }}>{value}</span>
    </div>
  )
}

function formatEur(v) {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency', currency: 'EUR', maximumFractionDigits: 0,
  }).format(Number(v) || 0)
}

function formatCount(v) {
  return `${(Number(v) || 0).toLocaleString('fr-FR', { maximumFractionDigits: 0 })}`
}
