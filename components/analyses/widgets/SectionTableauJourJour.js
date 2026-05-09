import Link from 'next/link'
import { formatEur, formatEur2, formatDeltaEur } from '../../../lib/caAnalyses'

const JOURS_FR = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi']

// Tableau dense jour par jour pour la période sélectionnée. Reprend le format
// de la vue mensuelle /controle-gestion/ventes (couv midi/soir + CA Food /
// Alcool / Soft / Autres + total + Δ Budget coloré + TM) mais agnostique
// quant aux dates (on consomme `days` déjà calculé par la page).
//
// `days` : sortie de aggregateByDay() + un champ `budget` ajouté par la page
// (somme des budgets journaliers pour ce jour-de-semaine).
export default function SectionTableauJourJour({ c, isMobile, days, totals }) {
  const cellPad = isMobile ? '8px 6px' : '10px 12px'
  const headPad = isMobile ? '10px 6px' : '12px 12px'
  const baseFont = isMobile ? 12 : 13

  const head = {
    padding: headPad, fontSize: baseFont - 1, fontWeight: 600,
    color: c.texteMuted, textTransform: 'uppercase', letterSpacing: 0.4,
    textAlign: 'right', background: c.fond,
    borderBottom: `1px solid ${c.bordure}`, whiteSpace: 'nowrap',
  }
  const cell = {
    padding: cellPad, fontSize: baseFont, color: c.texte,
    textAlign: 'right', borderBottom: `1px solid ${c.bordure}`,
    whiteSpace: 'nowrap',
  }

  return (
    <div style={{
      background: c.blanc, borderRadius: '12px',
      border: `0.5px solid ${c.bordure}`, overflow: 'hidden',
    }}>
      <div style={{ padding: isMobile ? '12px 14px' : '16px 20px', borderBottom: `0.5px solid ${c.bordure}` }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: c.texte }}>Détail jour par jour</div>
        <div style={{ fontSize: 12, color: c.texteMuted, marginTop: 2 }}>
          {days.length} jour{days.length > 1 ? 's' : ''} sur la période sélectionnée
        </div>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
          <thead>
            <tr>
              <th style={{ ...head, textAlign: 'left' }}>Date</th>
              <th style={{ ...head, textAlign: 'left' }}>Jour</th>
              <th style={head}>Couv. midi</th>
              <th style={head}>Couv. soir</th>
              <th style={head}>CA Food</th>
              <th style={head}>CA Alcool</th>
              <th style={head}>CA Soft</th>
              <th style={head}>Autres</th>
              <th style={head}>CA Total</th>
              <th style={head}>Δ Budget</th>
              <th style={head}>TM</th>
              <th style={head}></th>
            </tr>
          </thead>
          <tbody>
            {days.map((d) => (
              <tr
                key={d.iso}
                style={{
                  background: d.jsWeekday === 0 || d.jsWeekday === 6 ? c.fond : 'transparent',
                  opacity: d.hasData ? 1 : 0.55,
                }}
              >
                <td style={{ ...cell, textAlign: 'left', fontWeight: 500 }}>{d.iso.slice(8)}/{d.iso.slice(5, 7)}</td>
                <td style={{ ...cell, textAlign: 'left', color: c.texteMuted }}>{JOURS_FR[d.jsWeekday].slice(0, 3)}</td>
                <td style={cell}>{d.lunchCouverts || '—'}</td>
                <td style={cell}>{d.dinnerCouverts || '—'}</td>
                <td style={cell}>{formatEur(d.food)}</td>
                <td style={cell}>{formatEur(d.bev_20)}</td>
                <td style={cell}>{formatEur(d.bev_10)}</td>
                <td style={cell}>{formatEur(d.autre)}</td>
                <td style={{ ...cell, fontWeight: 600 }}>{formatEur(d.caTot)}</td>
                <td style={budgetCellStyle(d, cell, c)} title={budgetCellTitle(d)}>
                  {budgetCellLabel(d)}
                </td>
                <td style={cell}>{formatEur2(d.tm)}</td>
                <td style={{ ...cell, padding: '4px 8px' }}>
                  <Link
                    href={`/controle-gestion/ventes/saisie?date=${d.iso}`}
                    style={{
                      fontSize: baseFont - 1, color: c.texteMuted,
                      textDecoration: 'none', padding: '4px 8px',
                      borderRadius: 6, border: `1px solid ${c.bordure}`,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {d.hasData ? 'Modifier' : 'Saisir'}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
          {totals && (
            <tfoot>
              <tr style={{ background: c.fond, fontWeight: 600 }}>
                <td style={{ ...cell, textAlign: 'left' }} colSpan={2}>Total période</td>
                <td style={cell}>{totals.lunchCouverts || '—'}</td>
                <td style={cell}>{totals.dinnerCouverts || '—'}</td>
                <td style={cell}>{formatEur(totals.food)}</td>
                <td style={cell}>{formatEur(totals.bev20)}</td>
                <td style={cell}>{formatEur(totals.bev10)}</td>
                <td style={cell}>{formatEur(totals.autre)}</td>
                <td style={{ ...cell, fontWeight: 700 }}>{formatEur(totals.caTtc)}</td>
                <td style={totalBudgetCellStyle(totals, cell, c)} title={totalBudgetCellTitle(totals)}>
                  {totalBudgetCellLabel(totals)}
                </td>
                <td style={cell}>{formatEur2(totals.tm)}</td>
                <td style={cell}></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}

// ── Helpers Δ Budget (mêmes règles que /controle-gestion/ventes) ────────────
function budgetTone(real, budget, hasData) {
  if (!budget) return 'none'
  if (!hasData) return 'none'
  if (real >= budget) return 'success'
  if (real < budget * 0.95) return 'danger'
  return 'warning'
}

function tonePalette(tone, c) {
  if (tone === 'success') return { color: c.vert, bg: c.vertClair }
  if (tone === 'danger') return { color: c.rouge, bg: c.rougeClair }
  if (tone === 'warning') return { color: c.orange, bg: c.orangeClair }
  return { color: c.texteMuted, bg: 'transparent' }
}

function budgetCellStyle(d, base, c) {
  const tone = budgetTone(d.caTot, d.budget, d.hasData)
  const { color, bg } = tonePalette(tone, c)
  return { ...base, color, background: bg, fontWeight: tone === 'none' ? 400 : 600 }
}

function budgetCellLabel(d) {
  if (!d.budget || !d.hasData) return '—'
  return formatDeltaEur(d.caTot - d.budget)
}

function budgetCellTitle(d) {
  if (!d.budget) return 'Pas de budget cible pour ce jour de la semaine'
  const ratio = d.caTot > 0 ? (d.caTot / d.budget) * 100 : 0
  return `Réel ${formatEur(d.caTot)} / Budget ${formatEur(d.budget)} (${ratio.toFixed(0)} %)`
}

function totalBudgetCellStyle(totals, base, c) {
  const tone = budgetTone(totals.caTtc, totals.budget, totals.caTtc > 0)
  const { color, bg } = tonePalette(tone, c)
  return { ...base, color, background: bg, fontWeight: tone === 'none' ? 600 : 700 }
}

function totalBudgetCellLabel(totals) {
  if (!totals.budget || totals.caTtc === 0) return '—'
  return formatDeltaEur(totals.caTtc - totals.budget)
}

function totalBudgetCellTitle(totals) {
  if (!totals.budget) return 'Aucun budget cible défini sur la période'
  const ratio = totals.caTtc > 0 ? (totals.caTtc / totals.budget) * 100 : 0
  return `Réel ${formatEur(totals.caTtc)} / Budget ${formatEur(totals.budget)} (${ratio.toFixed(0)} %)`
}
