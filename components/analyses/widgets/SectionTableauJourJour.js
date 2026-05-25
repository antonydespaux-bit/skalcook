import Link from 'next/link'
import { useMemo } from 'react'
import {
  formatEur, formatEur2, formatDeltaEur,
  dailyBudgetForCell,
  rowsByDayAndSerie,
} from '../../../lib/caAnalyses'

const JOURS_FR = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi']

// Tableau dense jour par jour pour la période sélectionnée. Deux modes :
//   - cumulé (isSplit=false) : 1 ligne par jour avec couv midi/soir
//   - split (isSplit=true) : 1 ligne par (jour × série) avec colonnes Lieu
//     et/ou Service ajoutées en tête. Le Δ Budget est calculé par cellule
//     (jour × lieu × service) en respectant les overrides nb_jours.
export default function SectionTableauJourJour({
  c, isMobile, days, totals,
  isSplit, splitByLieu, splitByService, filteredRows, lieuxLabels,
  filteredBudgetByYear, overridesNbJours, electedDatesMap,
}) {
  if (isSplit) {
    return (
      <SplitTable
        c={c} isMobile={isMobile}
        filteredRows={filteredRows} lieuxLabels={lieuxLabels}
        splitByLieu={splitByLieu} splitByService={splitByService}
        filteredBudgetByYear={filteredBudgetByYear}
        overridesNbJours={overridesNbJours}
        electedDatesMap={electedDatesMap}
      />
    )
  }
  return <CumulatedTable c={c} isMobile={isMobile} days={days} totals={totals} />
}

// ── Vue cumulée (mode original) ──────────────────────────────────────────────

function CumulatedTable({ c, isMobile, days, totals }) {
  const { head, cell, baseFont } = makeStyles(c, isMobile)
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
              <tr key={d.iso} style={{
                background: d.jsWeekday === 0 || d.jsWeekday === 6 ? c.fond : 'transparent',
                opacity: d.hasData ? 1 : 0.55,
              }}>
                <td style={{ ...cell, textAlign: 'left', fontWeight: 500 }}>{d.iso.slice(8)}/{d.iso.slice(5, 7)}</td>
                <td style={{ ...cell, textAlign: 'left', color: c.texteMuted }}>{JOURS_FR[d.jsWeekday].slice(0, 3)}</td>
                <td style={cell}>{d.lunchCouverts || '—'}</td>
                <td style={cell}>{d.dinnerCouverts || '—'}</td>
                <td style={cell}>{formatEur(d.food)}</td>
                <td style={cell}>{formatEur(d.bev_20)}</td>
                <td style={cell}>{formatEur(d.bev_10)}</td>
                <td style={cell}>{formatEur(d.autre)}</td>
                <td style={{ ...cell, fontWeight: 600 }}>{formatEur(d.caTot)}</td>
                <td style={budgetCellStyle(d, cell, c)} title={budgetCellTitle(d)}>{budgetCellLabel(d)}</td>
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

// ── Vue split : 1 ligne par (jour × série) ──────────────────────────────────

function SplitTable({
  c, isMobile, filteredRows, lieuxLabels, splitByLieu, splitByService,
  filteredBudgetByYear, overridesNbJours, electedDatesMap,
}) {
  const splitDims = []
  if (splitByLieu) splitDims.push('lieu')
  if (splitByService) splitDims.push('service')
  // Pas de date début/fin nécessaire ici : on agrège seulement les rows existantes
  // (les jours sans data n'ont pas d'intérêt en mode split — on évite d'afficher
  // un cartésien jour × lieu × service vide).
  const rows = useMemo(() => {
    const map = new Map()
    for (const r of filteredRows) {
      const lieuLabel = lieuxLabels.get(r.lieu_service_id) || r.lieu_service_id || '—'
      const serviceLabel = r.service === 'lunch' ? 'Déjeuner' : 'Dîner'
      const parts = []
      if (splitByLieu) parts.push(lieuLabel)
      if (splitByService) parts.push(serviceLabel)
      const serieKey = parts.join(' / ')
      // Clé d'agrégation : (jour, lieu, service) quand split = lieu + service.
      // Si seulement split par lieu, agrège les 2 services. Idem inversement.
      const lieuKey = splitByLieu ? r.lieu_service_id : 'ALL'
      const svcKey = splitByService ? r.service : 'ALL'
      const key = `${r.jour}__${lieuKey}__${svcKey}`
      if (!map.has(key)) {
        map.set(key, {
          iso: r.jour, lieu: lieuLabel, service: serviceLabel, serie: serieKey,
          lieu_service_id: splitByLieu ? r.lieu_service_id : null,
          service_key: splitByService ? r.service : null,
          couverts: 0, food: 0, bev_20: 0, bev_10: 0, autre: 0,
        })
      }
      const acc = map.get(key)
      acc.couverts += Number(r.couverts || 0)
      acc.food += Number(r.ca_food || 0)
      acc.bev_20 += Number(r.ca_bev_20 || 0)
      acc.bev_10 += Number(r.ca_bev_10 || 0)
      acc.autre += Number(r.ca_autre || 0)
    }
    return Array.from(map.values())
      .map((v) => {
        const caTot = v.food + v.bev_20 + v.bev_10 + v.autre
        const tm = v.couverts > 0 ? caTot / v.couverts : null
        const date = new Date(`${v.iso}T00:00:00`)
        // Budget cible pour cette cellule (jour × [lieu] × [service])
        const budget = filteredBudgetByYear
          ? dailyBudgetForCell(filteredBudgetByYear, v.iso, v.lieu_service_id, v.service_key, overridesNbJours, electedDatesMap)
          : 0
        return { ...v, caTot, tm, budget, jsWeekday: date.getDay() }
      })
      .sort((a, b) => a.iso !== b.iso ? a.iso.localeCompare(b.iso) : a.serie.localeCompare(b.serie, 'fr'))
  }, [filteredRows, lieuxLabels, splitByLieu, splitByService, filteredBudgetByYear, overridesNbJours, electedDatesMap])

  const totals = useMemo(() => {
    const t = { couverts: 0, food: 0, bev_20: 0, bev_10: 0, autre: 0, budget: 0 }
    for (const r of rows) {
      t.couverts += r.couverts
      t.food += r.food
      t.bev_20 += r.bev_20
      t.bev_10 += r.bev_10
      t.autre += r.autre
      t.budget += r.budget || 0
    }
    t.caTtc = t.food + t.bev_20 + t.bev_10 + t.autre
    t.tm = t.couverts > 0 ? t.caTtc / t.couverts : null
    return t
  }, [rows])

  const { head, cell } = makeStyles(c, isMobile)

  return (
    <div style={{
      background: c.blanc, borderRadius: '12px',
      border: `0.5px solid ${c.bordure}`, overflow: 'hidden',
    }}>
      <div style={{ padding: isMobile ? '12px 14px' : '16px 20px', borderBottom: `0.5px solid ${c.bordure}` }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: c.texte }}>Détail jour par jour</div>
        <div style={{ fontSize: 12, color: c.texteMuted, marginTop: 2 }}>
          {rows.length} ligne{rows.length > 1 ? 's' : ''} (1 par jour × {splitDims.join(' × ')})
        </div>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
          <thead>
            <tr>
              <th style={{ ...head, textAlign: 'left' }}>Date</th>
              <th style={{ ...head, textAlign: 'left' }}>Jour</th>
              {splitByLieu && <th style={{ ...head, textAlign: 'left' }}>Lieu</th>}
              {splitByService && <th style={{ ...head, textAlign: 'left' }}>Service</th>}
              <th style={head}>Couverts</th>
              <th style={head}>CA Food</th>
              <th style={head}>CA Alcool</th>
              <th style={head}>CA Soft</th>
              <th style={head}>Autres</th>
              <th style={head}>CA Total</th>
              <th style={head}>Δ Budget</th>
              <th style={head}>TM</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const hasData = r.caTot > 0 || r.couverts > 0
              return (
                <tr key={`${r.iso}__${r.serie}__${i}`} style={{
                  background: r.jsWeekday === 0 || r.jsWeekday === 6 ? c.fond : 'transparent',
                }}>
                  <td style={{ ...cell, textAlign: 'left', fontWeight: 500 }}>{r.iso.slice(8)}/{r.iso.slice(5, 7)}</td>
                  <td style={{ ...cell, textAlign: 'left', color: c.texteMuted }}>{JOURS_FR[r.jsWeekday].slice(0, 3)}</td>
                  {splitByLieu && <td style={{ ...cell, textAlign: 'left' }}>{r.lieu}</td>}
                  {splitByService && <td style={{ ...cell, textAlign: 'left', color: c.texteMuted }}>{r.service}</td>}
                  <td style={cell}>{r.couverts || '—'}</td>
                  <td style={cell}>{formatEur(r.food)}</td>
                  <td style={cell}>{formatEur(r.bev_20)}</td>
                  <td style={cell}>{formatEur(r.bev_10)}</td>
                  <td style={cell}>{formatEur(r.autre)}</td>
                  <td style={{ ...cell, fontWeight: 600 }}>{formatEur(r.caTot)}</td>
                  <td style={budgetCellStyle({ caTot: r.caTot, budget: r.budget, hasData }, cell, c)}
                      title={budgetCellTitle({ caTot: r.caTot, budget: r.budget })}>
                    {budgetCellLabel({ caTot: r.caTot, budget: r.budget, hasData })}
                  </td>
                  <td style={cell}>{formatEur2(r.tm)}</td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr style={{ background: c.fond, fontWeight: 600 }}>
              <td style={{ ...cell, textAlign: 'left' }} colSpan={2 + (splitByLieu ? 1 : 0) + (splitByService ? 1 : 0)}>Total période</td>
              <td style={cell}>{totals.couverts || '—'}</td>
              <td style={cell}>{formatEur(totals.food)}</td>
              <td style={cell}>{formatEur(totals.bev_20)}</td>
              <td style={cell}>{formatEur(totals.bev_10)}</td>
              <td style={cell}>{formatEur(totals.autre)}</td>
              <td style={{ ...cell, fontWeight: 700 }}>{formatEur(totals.caTtc)}</td>
              <td style={totalBudgetCellStyle(totals, cell, c)} title={totalBudgetCellTitle(totals)}>
                {totalBudgetCellLabel(totals)}
              </td>
              <td style={cell}>{formatEur2(totals.tm)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

// ── Styles partagés ──────────────────────────────────────────────────────────
function makeStyles(c, isMobile) {
  const cellPad = isMobile ? '8px 6px' : '10px 12px'
  const headPad = isMobile ? '10px 6px' : '12px 12px'
  const baseFont = isMobile ? 12 : 13
  return {
    head: {
      padding: headPad, fontSize: baseFont - 1, fontWeight: 600,
      color: c.texteMuted, textTransform: 'uppercase', letterSpacing: 0.4,
      textAlign: 'right', background: c.fond,
      borderBottom: `1px solid ${c.bordure}`, whiteSpace: 'nowrap',
    },
    cell: {
      padding: cellPad, fontSize: baseFont, color: c.texte,
      textAlign: 'right', borderBottom: `1px solid ${c.bordure}`,
      whiteSpace: 'nowrap',
    },
    baseFont,
  }
}

// ── Helpers Δ Budget (mêmes règles que /controle-gestion/ventes) ────────────
function budgetTone(real, budget, hasData) {
  if (!hasData) return 'none'
  // Pas de budget configuré mais on a du réel → on affiche le delta en gris
  // neutre ("info"), pour que l'utilisateur voit la perf sans laisser croire
  // qu'il a battu un objectif (puisqu'il n'y a pas d'objectif).
  if (!budget) return 'info'
  if (real >= budget) return 'success'
  if (real < budget * 0.95) return 'danger'
  return 'warning'
}

function tonePalette(tone, c) {
  if (tone === 'success') return { color: c.vert, bg: c.vertClair }
  if (tone === 'danger') return { color: c.rouge, bg: c.rougeClair }
  if (tone === 'warning') return { color: c.orange, bg: c.orangeClair }
  if (tone === 'info') return { color: c.texteMuted, bg: c.fond }
  return { color: c.texteMuted, bg: 'transparent' }
}

function budgetCellStyle(d, base, c) {
  const tone = budgetTone(d.caTot, d.budget, d.hasData)
  const { color, bg } = tonePalette(tone, c)
  return { ...base, color, background: bg, fontWeight: tone === 'none' || tone === 'info' ? 500 : 600 }
}

function budgetCellLabel(d) {
  if (!d.hasData) return '—'
  // Quand pas de budget configuré : on affiche le delta (= caTot - 0 = caTot)
  // pour signaler la valeur réelle. Le ton "info" + le tooltip indiquent que
  // c'est sans référence budget.
  return formatDeltaEur(d.caTot - (d.budget || 0))
}

function budgetCellTitle(d) {
  if (!d.budget) return 'Aucun budget configuré pour ce jour de la semaine — configurez-le dans Suivi CA → Budgets'
  const ratio = d.caTot > 0 ? (d.caTot / d.budget) * 100 : 0
  return `Réel ${formatEur(d.caTot)} / Budget ${formatEur(d.budget)} (${ratio.toFixed(0)} %)`
}

function totalBudgetCellStyle(totals, base, c) {
  const tone = budgetTone(totals.caTtc, totals.budget, totals.caTtc > 0)
  const { color, bg } = tonePalette(tone, c)
  return { ...base, color, background: bg, fontWeight: tone === 'none' || tone === 'info' ? 600 : 700 }
}

function totalBudgetCellLabel(totals) {
  if (totals.caTtc === 0) return '—'
  return formatDeltaEur(totals.caTtc - (totals.budget || 0))
}

function totalBudgetCellTitle(totals) {
  if (!totals.budget) return 'Aucun budget cible défini sur la période'
  const ratio = totals.caTtc > 0 ? (totals.caTtc / totals.budget) * 100 : 0
  return `Réel ${formatEur(totals.caTtc)} / Budget ${formatEur(totals.budget)} (${ratio.toFixed(0)} %)`
}

// rowsByDayAndSerie est exposé en helper public (utile pour Excel + tests)
// mais n'est pas consommé directement ici car SplitTable optimise sa propre
// agrégation. Ré-exporté au cas où des tests l'importent depuis caAnalyses.
void rowsByDayAndSerie
