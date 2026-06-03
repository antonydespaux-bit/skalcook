'use client'

import { formatEur, formatEur2, fromIsoDate } from '../../../lib/caAnalyses'

const JOUR_SHORT = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam']

// Vue Détail : le tableau jour par jour, sorti de la Synthèse pour ne plus
// noyer la lecture exécutive. Une ligne par jour de la période, total en pied.
export default function DetailView({ c, isMobile, days, onExport }) {
  const withData = days || []
  const totals = withData.reduce((acc, d) => {
    acc.lunch += d.lunchCouverts; acc.dinner += d.dinnerCouverts
    acc.food += d.food; acc.bev20 += d.bev_20; acc.bev10 += d.bev_10; acc.autre += d.autre
    acc.caTot += d.caTot; acc.budget += d.budget
    return acc
  }, { lunch: 0, dinner: 0, food: 0, bev20: 0, bev10: 0, autre: 0, caTot: 0, budget: 0 })
  const totalDelta = totals.caTot - totals.budget

  return (
    <div className="sk-print-section" style={{
      background: c.blanc, border: `1px solid ${c.bordure}`, borderRadius: 14,
      padding: isMobile ? 12 : 18,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: c.texte }}>Détail jour par jour</div>
          <div style={{ fontSize: 12, color: c.texteMuted }}>{withData.length} jours sur la période</div>
        </div>
        {onExport && (
          <button onClick={onExport} style={{
            background: 'transparent', border: `1px solid ${c.bordure}`, color: c.texteMuted,
            borderRadius: 8, padding: '6px 12px', fontSize: 12, cursor: 'pointer',
          }}>📥 Export Excel</button>
        )}
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760, fontSize: 13 }}>
          <thead>
            <tr>
              {['Date', 'Jour'].map((h) => <Th key={h} c={c} left>{h}</Th>)}
              {['Couv. midi', 'Couv. soir', 'CA Food', 'CA Alcool', 'CA Soft', 'Autres', 'CA Total', 'Δ Budget', 'TM'].map((h) => <Th key={h} c={c}>{h}</Th>)}
            </tr>
          </thead>
          <tbody>
            {withData.map((d) => {
              const delta = d.budget > 0 ? d.caTot - d.budget : null
              const date = fromIsoDate(d.iso)
              const closed = !d.hasData
              return (
                <tr key={d.iso} style={{ color: closed ? c.texteMuted : c.texte }}>
                  <Td c={c} left><b>{String(date.getDate()).padStart(2, '0')}/{String(date.getMonth() + 1).padStart(2, '0')}</b></Td>
                  <Td c={c} left muted>{JOUR_SHORT[date.getDay()]}</Td>
                  <Td c={c}>{d.lunchCouverts || '—'}</Td>
                  <Td c={c}>{d.dinnerCouverts || '—'}</Td>
                  <Td c={c}>{cell(d.food)}</Td>
                  <Td c={c}>{cell(d.bev_20)}</Td>
                  <Td c={c}>{cell(d.bev_10)}</Td>
                  <Td c={c}>{cell(d.autre)}</Td>
                  <Td c={c}><b>{cell(d.caTot)}</b></Td>
                  <Td c={c}>{delta == null ? '—' : <DeltaPill c={c} value={delta} />}</Td>
                  <Td c={c}>{d.tm != null ? formatEur2(d.tm) : '—'}</Td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: `2px solid ${c.bordure}`, fontWeight: 600, color: c.texte }}>
              <Td c={c} left>Total</Td><Td c={c} left></Td>
              <Td c={c}>{totals.lunch}</Td>
              <Td c={c}>{totals.dinner}</Td>
              <Td c={c}>{cell(totals.food)}</Td>
              <Td c={c}>{cell(totals.bev20)}</Td>
              <Td c={c}>{cell(totals.bev10)}</Td>
              <Td c={c}>{cell(totals.autre)}</Td>
              <Td c={c}>{cell(totals.caTot)}</Td>
              <Td c={c}>{totals.budget > 0 ? <DeltaPill c={c} value={totalDelta} /> : '—'}</Td>
              <Td c={c}></Td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

function cell(v) { return v ? formatEur(v) : '—' }

function DeltaPill({ c, value }) {
  const pos = value >= 0
  return (
    <span style={{
      color: pos ? c.vert : c.rouge, fontWeight: 600,
      background: pos ? c.vertClair : c.rougeClair,
      padding: '2px 7px', borderRadius: 6, whiteSpace: 'nowrap',
    }}>
      {pos ? '+' : ''}{formatEur(value)}
    </span>
  )
}

function Th({ c, left, children }) {
  return (
    <th style={{
      textAlign: left ? 'left' : 'right', padding: '9px 12px', color: c.texteMuted,
      fontWeight: 500, fontSize: 11.5, textTransform: 'uppercase', letterSpacing: 0.4,
      borderBottom: `1px solid ${c.bordure}`, whiteSpace: 'nowrap',
    }}>{children}</th>
  )
}

function Td({ c, left, muted, children }) {
  return (
    <td style={{
      textAlign: left ? 'left' : 'right', padding: '9px 12px',
      borderBottom: `1px solid ${c.bordure}`, whiteSpace: 'nowrap',
      color: muted ? c.texteMuted : 'inherit',
    }}>{children}</td>
  )
}
