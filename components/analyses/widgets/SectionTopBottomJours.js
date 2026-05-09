'use client'

import { formatEur, formatEur2, fromIsoDate } from '../../../lib/caAnalyses'

const JOURS_FR = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi']

// Top 5 et Bottom 5 jours par CA TTC sur la période. Ignore les jours fermés.
//
// `topBottom` = sortie de topBottomDays(daysWithBudget) :
//   { top: [...days], bottom: [...days] }
export default function SectionTopBottomJours({ c, isMobile, topBottom }) {
  const empty = !topBottom || (topBottom.top.length === 0 && topBottom.bottom.length === 0)
  return (
    <div style={{
      background: c.blanc, borderRadius: 12,
      border: `0.5px solid ${c.bordure}`,
      padding: isMobile ? '14px 10px' : '20px',
    }}>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: c.texte }}>Top &amp; bottom jours</div>
        <div style={{ fontSize: 12, color: c.texteMuted, marginTop: 2 }}>
          Les 5 meilleurs et les 5 moins bons jours par CA TTC
        </div>
      </div>
      {empty ? (
        <EmptyState c={c} />
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
          gap: 16,
        }}>
          <DaysList c={c} title="Top 5" days={topBottom.top} accent={c.vert} />
          <DaysList c={c} title="Bottom 5" days={topBottom.bottom} accent={c.rouge} />
        </div>
      )}
    </div>
  )
}

function DaysList({ c, title, days, accent }) {
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 600, color: accent, marginBottom: 6 }}>{title}</div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left',  padding: '6px 8px', color: c.texteMuted, fontWeight: 600 }}>Date</th>
            <th style={{ textAlign: 'right', padding: '6px 8px', color: c.texteMuted, fontWeight: 600 }}>Couverts</th>
            <th style={{ textAlign: 'right', padding: '6px 8px', color: c.texteMuted, fontWeight: 600 }}>CA TTC</th>
            <th style={{ textAlign: 'right', padding: '6px 8px', color: c.texteMuted, fontWeight: 600 }}>TM</th>
          </tr>
        </thead>
        <tbody>
          {days.length === 0 ? (
            <tr><td colSpan={4} style={{ padding: '8px', color: c.texteMuted, fontSize: 12 }}>—</td></tr>
          ) : days.map((d) => (
            <tr key={d.iso} style={{ borderTop: `0.5px solid ${c.bordure}` }}>
              <td style={{ padding: '6px 8px', color: c.texte }}>
                {humanDate(d.iso)}
              </td>
              <td style={{ padding: '6px 8px', color: c.texte, textAlign: 'right' }}>{d.couvertsTot || '—'}</td>
              <td style={{ padding: '6px 8px', color: c.texte, textAlign: 'right', fontWeight: 600 }}>{formatEur(d.caTot)}</td>
              <td style={{ padding: '6px 8px', color: c.texte, textAlign: 'right' }}>{formatEur2(d.tm)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function humanDate(iso) {
  const d = fromIsoDate(iso)
  const wd = JOURS_FR[d.getDay()].slice(0, 3).toLowerCase()
  return `${wd}. ${iso.slice(8)}/${iso.slice(5, 7)}`
}

function EmptyState({ c }) {
  return (
    <div style={{
      padding: '32px 16px', textAlign: 'center',
      color: c.texteMuted, fontSize: 13,
    }}>
      Aucune donnée sur la période sélectionnée.
    </div>
  )
}
