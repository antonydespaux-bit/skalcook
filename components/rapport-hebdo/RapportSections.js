'use client'

// Rendu des sections du rapport hebdo (UI pure : prend les data dérivées par
// lib/rapportHebdo.js et les affiche au format proche du mail historique
// Marsan). Utilisé par la page in-app ET par l'export HTML autonome.

import {
  formatEur, formatPct, formatPctSimple, formatNombre, formatPeriode,
} from '../../lib/rapportHebdo'
import { colorForRatio } from '../../lib/colorRatio'

const SERVICE_LABEL = { lunch: 'déjeuner', dinner: 'dîner' }

export function SectionCaTtc({ c, data, periodeLabel, cumulLabel }) {
  const { ca, caMois, autreCa, autreCaMois } = data
  return (
    <div style={{ marginBottom: 20 }}>
      <p style={{ margin: '0 0 10px', fontSize: 14, color: c.texte }}>
        <strong>Le CATTC réalisé {periodeLabel}</strong> s&apos;élève à{' '}
        <strong>{formatEur(ca.real)}</strong> pour un budget de{' '}
        <strong>{formatEur(ca.budget)}</strong>
        {ca.ratio != null && <> soit <strong style={{ color: colorForRatio(ca.ratio, c) }}>
          {formatPct(ca.ratio)}
        </strong></>}
        {autreCa > 0 && (
          <span style={{ color: c.texteMuted, fontStyle: 'italic' }}>
            {' '}— dont <strong>{formatEur(autreCa)}</strong> d&apos;Autre CA (privatisations, frais)
          </span>
        )}
      </p>
      <p style={{ margin: '0 0 10px', fontSize: 14, color: c.texte }}>
        Le CATTC réalisé {cumulLabel} s&apos;élève à{' '}
        <strong>{formatEur(caMois.real)}</strong> pour un budget de{' '}
        <strong>{formatEur(caMois.budget)}</strong>
        {caMois.ratio != null && <> soit <strong style={{ color: colorForRatio(caMois.ratio, c) }}>
          {formatPct(caMois.ratio)}
        </strong></>}
        {autreCaMois > 0 && (
          <span style={{ color: c.texteMuted, fontStyle: 'italic' }}>
            {' '}— dont <strong>{formatEur(autreCaMois)}</strong> d&apos;Autre CA
          </span>
        )}
      </p>
    </div>
  )
}

// Option C — Liste détaillée des "Autres CA" par lieu × service.
// N'affiche rien si aucun lieu n'a saisi d'autre CA sur la période.
export function SectionAutresCa({ c, autreCaDetail, autreCa, titre }) {
  if (!autreCaDetail || autreCaDetail.length === 0) return null
  return (
    <Section c={c} titre={titre || 'Autres CA (privatisations, frais…)'}>
      <ul style={ulStyle}>
        {autreCaDetail.map((r) => (
          <li key={`${r.lieu_id}_${r.service}`} style={liStyle}>
            <strong>{r.lieu_label} {SERVICE_LABEL[r.service]}</strong> :{' '}
            <strong>{formatEur(r.ca_autre)}</strong>
          </li>
        ))}
        {autreCaDetail.length > 1 && (
          <li style={{ ...liStyle, marginTop: 6, paddingTop: 6, borderTop: `0.5px solid ${c.bordure}`, fontWeight: 600 }}>
            Total <strong>{formatEur(autreCa)}</strong>
          </li>
        )}
      </ul>
    </Section>
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
              <strong style={{ color: colorForRatio(r.ratio_tm, c) }}>{formatPct(r.ratio_tm)}</strong>
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
      {ratio != null && <>, soit <strong style={{ color: colorForRatio(ratio, c) }}>{formatPct(ratio)}</strong></>}
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
          {couverts.midi.ratio != null && <> soit <strong style={{ color: colorForRatio(couverts.midi.ratio, c) }}>{formatPct(couverts.midi.ratio)}</strong></>}
        </li>
        <li style={liStyle}>
          <strong>Dîner</strong> : <strong>{formatNombre(couverts.soir.real)}</strong> couverts pour un budget de{' '}
          <strong>{formatNombre(couverts.soir.budget)}</strong>
          {couverts.soir.ratio != null && <> soit <strong style={{ color: colorForRatio(couverts.soir.ratio, c) }}>{formatPct(couverts.soir.ratio)}</strong></>}
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
  // Total par jour (midi + soir) et total global
  const computeJourTotal = (j) => {
    const real = j.midi.real + j.soir.real
    const budget = j.midi.budget + j.soir.budget
    const delta = real - budget
    const ratio = budget > 0 ? (delta / budget) * 100 : null
    return { real, budget, delta, ratio }
  }
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
  const totalJour = {
    real: total.midi.real + total.soir.real,
    budget: total.midi.budget + total.soir.budget,
  }
  totalJour.ratio = totalJour.budget > 0 ? ((totalJour.real - totalJour.budget) / totalJour.budget) * 100 : null
  return (
    <Section c={c} titre={titre || 'Couverts jour par jour Réel VS Budget'}>
      <div style={{ overflowX: 'auto', border: `0.5px solid ${c.bordure}`, borderRadius: 8 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
          <thead>
            <tr>
              <th style={{ ...head, textAlign: 'left' }} rowSpan={2}>Jour</th>
              <th style={head} colSpan={4}>MIDI</th>
              <th style={head} colSpan={4}>SOIR</th>
              <th style={head} colSpan={3}>TOTAL JOUR</th>
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
              <th style={head}>Reel</th>
              <th style={head}>Budget</th>
              <th style={head}>Écart %</th>
            </tr>
          </thead>
          <tbody>
            {jours.map((j) => {
              const tj = computeJourTotal(j)
              return (
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
                  <td style={{ ...cell, fontWeight: 600 }}>{formatNombre(tj.real)}</td>
                  <td style={{ ...cell, fontWeight: 600 }}>{formatNombre(tj.budget)}</td>
                  <td style={{ ...cell, background: ratioBg(tj.ratio), color: ratioColor(tj.ratio), fontWeight: 700 }}>
                    {formatPct(tj.ratio)}
                  </td>
                </tr>
              )
            })}
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
              <td style={cell}>{formatNombre(totalJour.real)}</td>
              <td style={cell}>{formatNombre(totalJour.budget)}</td>
              <td style={{ ...cell, background: ratioBg(totalJour.ratio), color: ratioColor(totalJour.ratio), fontWeight: 700 }}>
                {formatPct(totalJour.ratio)}
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

// ── Section Articles (menus + suppléments) ─────────────────────────────────

// Affiche les ventes par menu/supplément groupées par (type, service).
// Pour chaque article, montre la qté vendue + % vs couverts du service.
// `articles` : [{ id, nom, type, service }]
// `articlesVentes` : { [article_id]: quantite }
// `couverts` : sortie de couvertsParService(...)
// `editable` : si true, permet d'éditer les qtés inline
// `onChangeQte` : (articleId, qte) => void
export function SectionArticles({ c, articles, articlesVentes, couverts, editable, onChangeQte, titre }) {
  if (!articles || articles.length === 0) return null

  // Regroupe par (type, service)
  const groups = [
    { type: 'menu',       service: 'lunch',  label: 'Ventes Menu Déjeuner', svcCouv: couverts.midi.real },
    { type: 'menu',       service: 'dinner', label: 'Ventes Menu Dîner',    svcCouv: couverts.soir.real },
    { type: 'menu',       service: 'all',    label: 'Ventes Menu (tous services)', svcCouv: couverts.total.real },
    { type: 'supplement', service: 'lunch',  label: 'Suppléments Déjeuner', svcCouv: couverts.midi.real },
    { type: 'supplement', service: 'dinner', label: 'Suppléments Dîner',    svcCouv: couverts.soir.real },
    { type: 'supplement', service: 'all',    label: 'Suppléments (tous services)', svcCouv: couverts.total.real },
  ]

  const cellPad = '6px 10px'
  const head = { padding: cellPad, background: c.fond, color: c.texteMuted, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.3, borderBottom: `1px solid ${c.bordure}` }
  const cell = { padding: cellPad, fontSize: 13, color: c.texte, borderBottom: `0.5px solid ${c.bordure}` }

  const blocks = groups.map((g) => {
    const items = articles.filter((a) => a.type === g.type && a.service === g.service)
    if (items.length === 0) return null
    return (
      <div key={`${g.type}_${g.service}`} style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: c.texte, marginBottom: 6 }}>
          {g.label}
        </div>
        <div style={{ overflowX: 'auto', border: `0.5px solid ${c.bordure}`, borderRadius: 8 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...head, textAlign: 'left' }}>Nom de l&apos;article</th>
                <th style={{ ...head, textAlign: 'right' }}>Qté vendue</th>
                <th style={{ ...head, textAlign: 'right' }}>% vs couverts</th>
              </tr>
            </thead>
            <tbody>
              {items.map((a) => {
                const qte = Number(articlesVentes?.[a.id] || 0)
                const pct = g.svcCouv > 0 ? (qte / g.svcCouv) * 100 : null
                return (
                  <tr key={a.id}>
                    <td style={{ ...cell, textAlign: 'left' }}>{a.nom}</td>
                    <td style={{ ...cell, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                      {editable ? (
                        <input
                          type="number" min="0" step="1"
                          value={qte || ''}
                          onChange={(e) => onChangeQte && onChangeQte(a.id, e.target.value === '' ? 0 : Number(e.target.value))}
                          style={{ width: 70, padding: '4px 6px', borderRadius: 4, border: `1px solid ${c.bordure}`, background: c.blanc, color: c.texte, fontSize: 13, textAlign: 'right' }}
                        />
                      ) : (
                        formatNombre(qte)
                      )}
                    </td>
                    <td style={{ ...cell, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                      {pct != null ? formatPctSimple(pct) : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    )
  }).filter(Boolean)

  if (blocks.length === 0) return null
  return <Section c={c} titre={titre || 'Ventes par article'}>{blocks}</Section>
}

// ── Export agrégé pour utilisation par la page ─────────────────────────────

export default function RapportSections({ c, data, debut, fin, articles, articlesVentes, editableArticles, onChangeQte }) {
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
      <SectionAutresCa
        c={c}
        autreCaDetail={data.autreCaDetail}
        autreCa={data.autreCa}
        titre={`Autres CA (privatisations, frais…) ${periodeLabel}`}
      />
      {articles && articles.length > 0 && (
        <SectionArticles
          c={c}
          articles={articles}
          articlesVentes={articlesVentes}
          couverts={data.couverts}
          editable={editableArticles}
          onChangeQte={onChangeQte}
          titre={`Ventes par article ${periodeLabel}`}
        />
      )}
    </div>
  )
}
