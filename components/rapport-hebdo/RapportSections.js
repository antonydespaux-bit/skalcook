'use client'

// Rendu des sections du rapport hebdo (UI pure : prend les data dérivées par
// lib/rapportHebdo.js et les affiche au format proche du mail historique
// Marsan). Utilisé par la page in-app ET par l'export HTML autonome.

import {
  formatEur, formatPct, formatPctSimple, formatNombre, formatPeriode,
} from '../../lib/rapportHebdo'

const SERVICE_LABEL = { lunch: 'déjeuner', dinner: 'dîner' }

export function SectionCaTtc({ c, data, periodeLabel, cumulLabel }) {
  const { ca, caMois } = data
  return (
    <div style={{ marginBottom: 20 }}>
      <p style={{ margin: '0 0 10px', fontSize: 14, color: c.texte }}>
        <strong>Le CATTC réalisé {periodeLabel}</strong> s&apos;élève à{' '}
        <strong>{formatEur(ca.real)}</strong> pour un budget de{' '}
        <strong>{formatEur(ca.budget)}</strong>
        {ca.ratio != null && <> soit <strong style={{ color: ca.ratio >= 0 ? c.vert : c.rouge }}>
          {formatPct(ca.ratio)}
        </strong></>}
      </p>
      <p style={{ margin: '0 0 10px', fontSize: 14, color: c.texte }}>
        Le CATTC réalisé {cumulLabel} s&apos;élève à{' '}
        <strong>{formatEur(caMois.real)}</strong> pour un budget de{' '}
        <strong>{formatEur(caMois.budget)}</strong>
        {caMois.ratio != null && <> soit <strong style={{ color: caMois.ratio >= 0 ? c.vert : c.rouge }}>
          {formatPct(caMois.ratio)}
        </strong></>}
      </p>
    </div>
  )
}

export function SectionTicketMoyenLieux({ c, tmLieux, titre }) {
  if (tmLieux.length === 0) return null
  return (
    <Section c={c} titre={titre || 'Ticket moyen par lieu × service'}>
      <ul style={ulStyle}>
        {tmLieux.map((r) => (
          <li key={`${r.lieu_id}_${r.service}`} style={liStyle}>
            Ticket moyen <strong>{r.lieu_label} {SERVICE_LABEL[r.service]}</strong>{' '}
            <strong>{r.real_tm != null ? formatEur(r.real_tm) : '—'}</strong>{' '}
            pour un budget de{' '}
            <strong>{r.budget_tm != null ? formatEur(r.budget_tm) : '—'}</strong>
            {r.ratio_tm != null && <>, soit{' '}
              <strong style={{ color: r.ratio_tm >= 0 ? c.vert : c.rouge }}>{formatPct(r.ratio_tm)}</strong>
            </>}
          </li>
        ))}
      </ul>
    </Section>
  )
}

export function SectionTmFoodBev({ c, tmFb, titre }) {
  const fmtLine = (label, real, budget, ratio) => (
    <li style={liStyle}>
      Ticket moyen <strong>{label}</strong>{' '}
      <strong>{real != null ? formatEur(real) : '—'}</strong>{' '}
      pour un budget de <strong>{budget != null ? formatEur(budget) : '—'}</strong>
      {ratio != null && <>, soit <strong style={{ color: ratio >= 0 ? c.vert : c.rouge }}>{formatPct(ratio)}</strong></>}
    </li>
  )
  return (
    <Section c={c} titre={titre || 'Ticket moyen Food et Beverage par service'}>
      <ul style={ulStyle}>
        {fmtLine('Food midi',      tmFb.midi.real_tm_food, tmFb.midi.budget_tm_food, tmFb.midi.ratio_food)}
        {fmtLine('Beverage midi',  tmFb.midi.real_tm_bev,  tmFb.midi.budget_tm_bev,  tmFb.midi.ratio_bev)}
        {fmtLine('Food soir',      tmFb.soir.real_tm_food, tmFb.soir.budget_tm_food, tmFb.soir.ratio_food)}
        {fmtLine('Beverage soir',  tmFb.soir.real_tm_bev,  tmFb.soir.budget_tm_bev,  tmFb.soir.ratio_bev)}
        {fmtLine('Food total',     tmFb.total.real_tm_food, tmFb.total.budget_tm_food, tmFb.total.ratio_food)}
        {fmtLine('Beverage Total', tmFb.total.real_tm_bev,  tmFb.total.budget_tm_bev,  tmFb.total.ratio_bev)}
      </ul>
    </Section>
  )
}

export function SectionMixFoodBev({ c, mix, titre }) {
  return (
    <Section c={c} titre={titre || 'Ticket moyen Food et Beverage en % vs TM total'}>
      <ul style={ulStyle}>
        <li style={liStyle}>Ticket moyen <strong>Food midi</strong> <strong>{formatPctSimple(mix.midi.food_pct)}</strong> du total</li>
        <li style={liStyle}>Ticket moyen <strong>Beverage midi</strong> <strong>{formatPctSimple(mix.midi.bev_pct)}</strong> du total</li>
        <li style={liStyle}>Ticket moyen <strong>Food soir</strong> <strong>{formatPctSimple(mix.soir.food_pct)}</strong> du total</li>
        <li style={liStyle}>Ticket moyen <strong>Beverage soir</strong> <strong>{formatPctSimple(mix.soir.bev_pct)}</strong> du total</li>
        <li style={liStyle}>Ticket moyen <strong>Food total</strong> <strong>{formatPctSimple(mix.total.food_pct)}</strong> du total</li>
        <li style={liStyle}>Ticket moyen <strong>Beverage</strong> <strong>{formatPctSimple(mix.total.bev_pct)}</strong> du total</li>
      </ul>
    </Section>
  )
}

export function SectionCouverts({ c, couverts, titre }) {
  return (
    <Section c={c} titre={titre || 'Nombre de couverts'}>
      <ul style={ulStyle}>
        <li style={liStyle}>
          <strong>Déjeuner</strong> : <strong>{formatNombre(couverts.midi.real)}</strong> couverts pour un budget de{' '}
          <strong>{formatNombre(couverts.midi.budget)}</strong>
          {couverts.midi.ratio != null && <> soit <strong style={{ color: couverts.midi.ratio >= 0 ? c.vert : c.rouge }}>{formatPct(couverts.midi.ratio)}</strong></>}
        </li>
        <li style={liStyle}>
          <strong>Dîner</strong> : <strong>{formatNombre(couverts.soir.real)}</strong> couverts pour un budget de{' '}
          <strong>{formatNombre(couverts.soir.budget)}</strong>
          {couverts.soir.ratio != null && <> soit <strong style={{ color: couverts.soir.ratio >= 0 ? c.vert : c.rouge }}>{formatPct(couverts.soir.ratio)}</strong></>}
        </li>
      </ul>
    </Section>
  )
}

export function SectionCouvertsJpJ({ c, jours, titre }) {
  if (!jours || jours.length === 0) return null
  const cellPad = '6px 10px'
  const head = { padding: cellPad, background: c.fond, color: c.texteMuted, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.3, borderBottom: `1px solid ${c.bordure}`, textAlign: 'right' }
  const cell = { padding: cellPad, fontSize: 13, color: c.texte, borderBottom: `0.5px solid ${c.bordure}`, textAlign: 'right' }
  // Couleur cellule écart % : vert / orange / rouge
  const ratioBg = (ratio) => {
    if (ratio == null) return null
    if (ratio >= 0) return c.vertClair
    if (ratio > -10) return c.orangeClair
    return c.rougeClair
  }
  const ratioColor = (ratio) => {
    if (ratio == null) return c.texteMuted
    if (ratio >= 0) return c.vert
    if (ratio > -10) return c.orange
    return c.rouge
  }
  // Total
  const total = jours.reduce((acc, j) => {
    acc.midi.real += j.midi.real
    acc.midi.budget += j.midi.budget
    acc.soir.real += j.soir.real
    acc.soir.budget += j.soir.budget
    return acc
  }, { midi: { real: 0, budget: 0 }, soir: { real: 0, budget: 0 } })
  total.midi.delta = total.midi.real - total.midi.budget
  total.midi.ratio = total.midi.budget > 0 ? (total.midi.delta / total.midi.budget) * 100 : null
  total.soir.delta = total.soir.real - total.soir.budget
  total.soir.ratio = total.soir.budget > 0 ? (total.soir.delta / total.soir.budget) * 100 : null
  return (
    <Section c={c} titre={titre || 'Couverts jour par jour Réel VS Budget'}>
      <div style={{ overflowX: 'auto', border: `0.5px solid ${c.bordure}`, borderRadius: 8 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 600 }}>
          <thead>
            <tr>
              <th style={{ ...head, textAlign: 'left' }} rowSpan={2}>Jour</th>
              <th style={head} colSpan={4}>MIDI</th>
              <th style={head} colSpan={4}>SOIR</th>
            </tr>
            <tr>
              <th style={head}>Reel</th>
              <th style={head}>Budget</th>
              <th style={head}>Écart Nb</th>
              <th style={head}>Écart %</th>
              <th style={head}>Reel</th>
              <th style={head}>Budget</th>
              <th style={head}>Écart Nb</th>
              <th style={head}>Écart %</th>
            </tr>
          </thead>
          <tbody>
            {jours.map((j) => (
              <tr key={j.iso}>
                <td style={{ ...cell, textAlign: 'left', fontWeight: 500 }}>{j.jour_fr}</td>
                <td style={cell}>{formatNombre(j.midi.real)}</td>
                <td style={cell}>{formatNombre(j.midi.budget)}</td>
                <td style={cell}>{j.midi.delta !== 0 ? formatNombre(j.midi.delta) : '—'}</td>
                <td style={{ ...cell, background: ratioBg(j.midi.ratio), color: ratioColor(j.midi.ratio), fontWeight: 600 }}>
                  {formatPct(j.midi.ratio)}
                </td>
                <td style={cell}>{formatNombre(j.soir.real)}</td>
                <td style={cell}>{formatNombre(j.soir.budget)}</td>
                <td style={cell}>{j.soir.delta !== 0 ? formatNombre(j.soir.delta) : '—'}</td>
                <td style={{ ...cell, background: ratioBg(j.soir.ratio), color: ratioColor(j.soir.ratio), fontWeight: 600 }}>
                  {formatPct(j.soir.ratio)}
                </td>
              </tr>
            ))}
            <tr style={{ background: c.fond, fontWeight: 600 }}>
              <td style={{ ...cell, textAlign: 'left' }}>Total</td>
              <td style={cell}>{formatNombre(total.midi.real)}</td>
              <td style={cell}>{formatNombre(total.midi.budget)}</td>
              <td style={cell}></td>
              <td style={{ ...cell, background: ratioBg(total.midi.ratio), color: ratioColor(total.midi.ratio) }}>
                {formatPct(total.midi.ratio)}
              </td>
              <td style={cell}>{formatNombre(total.soir.real)}</td>
              <td style={cell}>{formatNombre(total.soir.budget)}</td>
              <td style={cell}></td>
              <td style={{ ...cell, background: ratioBg(total.soir.ratio), color: ratioColor(total.soir.ratio) }}>
                {formatPct(total.soir.ratio)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </Section>
  )
}

// ── Helpers communs ────────────────────────────────────────────────────────

function Section({ c, titre, children }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <h3 style={{
        fontSize: 14, fontWeight: 600, color: c.accent,
        margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: 0.4,
      }}>
        {titre}
      </h3>
      {children}
    </div>
  )
}

const ulStyle = { margin: 0, paddingLeft: 20, fontSize: 14, color: '#000', lineHeight: '1.7' }
const liStyle = { marginBottom: 4 }

// ── Export agrégé pour utilisation par la page ─────────────────────────────

export default function RapportSections({ c, data, debut, fin }) {
  const periodeLabel = formatPeriode(debut, fin)
  // Cumul mois : du 1er au fin (ou jour de la période fin)
  const finDate = new Date(fin)
  const monthName = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'][finDate.getMonth()]
  const cumulLabel = `depuis le début du mois (au ${formatPeriode(fin, fin).replace('du ', '')})`
  void monthName
  return (
    <div>
      <SectionCaTtc c={c} data={data} periodeLabel={periodeLabel} cumulLabel={cumulLabel} />
      <SectionTicketMoyenLieux c={c} tmLieux={data.tmLieux} titre={`Ticket moyen ${periodeLabel}`} />
      <SectionTmFoodBev c={c} tmFb={data.tmFb} titre={`Ticket moyen Food et Beverage ${periodeLabel} pour le midi et le soir`} />
      <SectionMixFoodBev c={c} mix={data.mix} titre={`Ticket moyen Food et Beverage en % vs TM total ${periodeLabel} midi et soir`} />
      <SectionCouverts c={c} couverts={data.couverts} titre={`Nombre de couverts ${periodeLabel}`} />
      <SectionCouvertsJpJ c={c} jours={data.couvertsJpJ} titre={`Couverts jour par jour Réel VS Budget ${periodeLabel}`} />
    </div>
  )
}
