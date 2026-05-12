// Export du rapport hebdo en HTML autonome, soit téléchargé soit copié
// dans le presse-papier pour collage direct dans Gmail / Outlook.
//
// Le HTML utilise des styles inline (mail clients ignorent les <style> et
// les classes CSS externes) et reproduit la mise en forme du mail
// historique Marsan : titres en couleur, listes à puces, tableau couleur
// pour les écarts couverts.

import {
  formatEur, formatPct, formatPctSimple, formatNombre, formatPeriode,
} from './rapportHebdo'

const SERVICE_LABEL = { lunch: 'déjeuner', dinner: 'dîner' }

const COLOR = {
  texte:    '#000',
  muted:    '#666',
  accent:   '#1565C0',
  vert:     '#1B5E20',
  rouge:    '#C62828',
  orange:   '#D97706',
  vertBg:   '#C8E6C9',
  rougeBg:  '#FFCDD2',
  orangeBg: '#FFE0B2',
  fond:     '#F5F5F5',
  bordure:  '#CCCCCC',
}

const styles = {
  body: 'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; font-size: 14px; color: #000; line-height: 1.6;',
  h3:   `font-size: 14px; font-weight: 600; color: ${COLOR.accent}; margin: 20px 0 10px; text-transform: uppercase; letter-spacing: 0.4px;`,
  ul:   'margin: 0; padding-left: 22px; line-height: 1.7;',
  li:   'margin-bottom: 4px;',
  p:    'margin: 0 0 10px;',
  strong: 'font-weight: 700;',
  vert: `color: ${COLOR.vert}; font-weight: 700;`,
  rouge: `color: ${COLOR.rouge}; font-weight: 700;`,
  table: 'width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 13px;',
  th:    `padding: 6px 10px; background: ${COLOR.fond}; color: ${COLOR.muted}; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.3px; border: 1px solid ${COLOR.bordure}; text-align: right;`,
  td:    `padding: 6px 10px; font-size: 13px; color: ${COLOR.texte}; border: 1px solid ${COLOR.bordure}; text-align: right;`,
  tdLeft: `padding: 6px 10px; font-size: 13px; color: ${COLOR.texte}; border: 1px solid ${COLOR.bordure}; text-align: left; font-weight: 600;`,
}

function colorRatio(ratio) {
  if (ratio == null) return ''
  return ratio >= 0 ? styles.vert : styles.rouge
}

function bgForRatio(ratio) {
  if (ratio == null) return ''
  if (ratio >= 0) return `background: ${COLOR.vertBg}; color: ${COLOR.vert};`
  if (ratio > -10) return `background: ${COLOR.orangeBg}; color: ${COLOR.orange};`
  return `background: ${COLOR.rougeBg}; color: ${COLOR.rouge};`
}

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Construit le HTML complet (body + sections + commentaire).
export function buildRapportHtml({ data, debut, fin, commentaire, titre, articles, articlesVentes }) {
  const periode = formatPeriode(debut, fin)
  const sections = [
    renderIntro(data, periode),
    renderTmLieux(data.tmLieux, periode),
    renderTmFoodBev(data.tmFb, periode),
    renderMixFoodBev(data.mix, periode),
    renderCouverts(data.couverts, periode),
    renderCouvertsJpJ(data.couvertsJpJ, periode),
    renderAutresCa(data.autreCaDetail, data.autreCa, periode),
    renderArticles(articles, articlesVentes, data.couverts, periode),
    renderCommentaire(commentaire),
  ].filter(Boolean).join('\n')

  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"><title>${esc(titre || `Rapport CA ${periode}`)}</title></head>
<body style="${styles.body}">
<p style="${styles.p}">Bonjour à tous,</p>
<p style="${styles.p}">Ci-dessous le rapport du CA pour la <strong>période ${esc(periode)}</strong> ainsi que le cumul depuis le début du mois :</p>
${sections}
<p style="${styles.p}; margin-top: 24px;">Bonne journée à tous.</p>
</body></html>`
}

function renderIntro(data, periode) {
  const { ca, caMois, autreCa, autreCaMois } = data
  const dontSem = autreCa > 0
    ? ` <em style="color: ${COLOR.muted};">— dont <strong>${formatEur(autreCa)}</strong> d'Autre CA (privatisations, frais)</em>`
    : ''
  const dontMois = autreCaMois > 0
    ? ` <em style="color: ${COLOR.muted};">— dont <strong>${formatEur(autreCaMois)}</strong> d'Autre CA</em>`
    : ''
  return `
<p style="${styles.p}"><strong>Le CATTC réalisé ${esc(periode)}</strong> s'élève à <strong>${formatEur(ca.real)}</strong> pour un budget de <strong>${formatEur(ca.budget)}</strong>${ca.ratio != null ? ` soit <span style="${colorRatio(ca.ratio)}">${formatPct(ca.ratio)}</span>` : ''}${dontSem}.</p>
<p style="${styles.p}">Le CATTC réalisé <strong>depuis le début du mois</strong> s'élève à <strong>${formatEur(caMois.real)}</strong> pour un budget de <strong>${formatEur(caMois.budget)}</strong>${caMois.ratio != null ? ` soit <span style="${colorRatio(caMois.ratio)}">${formatPct(caMois.ratio)}</span>` : ''}${dontMois}.</p>`
}

function renderTmLieux(tmLieux, periode) {
  if (tmLieux.length === 0) return ''
  const items = tmLieux.map((r) => `
    <li style="${styles.li}">Ticket moyen <strong>${esc(r.lieu_label)} ${esc(SERVICE_LABEL[r.service])}</strong> <strong>${r.real_tm != null ? formatEur(r.real_tm) : '—'}</strong> pour un budget de <strong>${r.budget_tm != null ? formatEur(r.budget_tm) : '—'}</strong>${r.ratio_tm != null ? `, soit <span style="${colorRatio(r.ratio_tm)}">${formatPct(r.ratio_tm)}</span>` : ''}</li>`).join('')
  return `<h3 style="${styles.h3}">Ticket moyen ${esc(periode)}</h3><ul style="${styles.ul}">${items}</ul>`
}

function renderTmFoodBev(tmFb, periode) {
  const line = (label, real, budget, ratio) => `<li style="${styles.li}">Ticket moyen <strong>${esc(label)}</strong> <strong>${real != null ? formatEur(real) : '—'}</strong> pour un budget de <strong>${budget != null ? formatEur(budget) : '—'}</strong>${ratio != null ? ` soit <span style="${colorRatio(ratio)}">${formatPct(ratio)}</span>` : ''}</li>`
  const items = [
    line('Food midi',      tmFb.midi.real_tm_food, tmFb.midi.budget_tm_food, tmFb.midi.ratio_food),
    line('Beverage midi',  tmFb.midi.real_tm_bev,  tmFb.midi.budget_tm_bev,  tmFb.midi.ratio_bev),
    line('Food soir',      tmFb.soir.real_tm_food, tmFb.soir.budget_tm_food, tmFb.soir.ratio_food),
    line('Beverage soir',  tmFb.soir.real_tm_bev,  tmFb.soir.budget_tm_bev,  tmFb.soir.ratio_bev),
    line('Food total',     tmFb.total.real_tm_food, tmFb.total.budget_tm_food, tmFb.total.ratio_food),
    line('Beverage Total', tmFb.total.real_tm_bev,  tmFb.total.budget_tm_bev,  tmFb.total.ratio_bev),
  ].join('')
  return `<h3 style="${styles.h3}">Ticket moyen Food et Beverage ${esc(periode)} pour le midi et le soir</h3><ul style="${styles.ul}">${items}</ul>`
}

function renderMixFoodBev(mix, periode) {
  const items = [
    `<li style="${styles.li}">Ticket moyen <strong>Food midi</strong> <strong>${formatPctSimple(mix.midi.food_pct)}</strong> du total</li>`,
    `<li style="${styles.li}">Ticket moyen <strong>Beverage midi</strong> <strong>${formatPctSimple(mix.midi.bev_pct)}</strong> du total</li>`,
    `<li style="${styles.li}">Ticket moyen <strong>Food soir</strong> <strong>${formatPctSimple(mix.soir.food_pct)}</strong> du total</li>`,
    `<li style="${styles.li}">Ticket moyen <strong>Beverage soir</strong> <strong>${formatPctSimple(mix.soir.bev_pct)}</strong> du total</li>`,
    `<li style="${styles.li}">Ticket moyen <strong>Food total</strong> <strong>${formatPctSimple(mix.total.food_pct)}</strong> du total</li>`,
    `<li style="${styles.li}">Ticket moyen <strong>Beverage</strong> <strong>${formatPctSimple(mix.total.bev_pct)}</strong> du total</li>`,
  ].join('')
  return `<h3 style="${styles.h3}">Ticket moyen Food et Beverage en % vs TM total ${esc(periode)} midi et soir</h3><ul style="${styles.ul}">${items}</ul>`
}

function renderCouverts(couverts, periode) {
  return `<h3 style="${styles.h3}">Nombre de couverts ${esc(periode)}</h3>
<ul style="${styles.ul}">
<li style="${styles.li}"><strong>Déjeuner</strong> : <strong>${formatNombre(couverts.midi.real)}</strong> couverts pour un budget de <strong>${formatNombre(couverts.midi.budget)}</strong>${couverts.midi.ratio != null ? ` soit <span style="${colorRatio(couverts.midi.ratio)}">${formatPct(couverts.midi.ratio)}</span>` : ''}</li>
<li style="${styles.li}"><strong>Dîner</strong> : <strong>${formatNombre(couverts.soir.real)}</strong> couverts pour un budget de <strong>${formatNombre(couverts.soir.budget)}</strong>${couverts.soir.ratio != null ? ` soit <span style="${colorRatio(couverts.soir.ratio)}">${formatPct(couverts.soir.ratio)}</span>` : ''}</li>
</ul>`
}

function renderCouvertsJpJ(jours, periode) {
  if (!jours || jours.length === 0) return ''
  const total = jours.reduce((acc, j) => {
    acc.midi.real += j.midi.real; acc.midi.budget += j.midi.budget
    acc.soir.real += j.soir.real; acc.soir.budget += j.soir.budget
    return acc
  }, { midi: { real: 0, budget: 0 }, soir: { real: 0, budget: 0 } })
  total.midi.delta = total.midi.real - total.midi.budget
  total.midi.ratio = total.midi.budget > 0 ? (total.midi.delta / total.midi.budget) * 100 : null
  total.soir.delta = total.soir.real - total.soir.budget
  total.soir.ratio = total.soir.budget > 0 ? (total.soir.delta / total.soir.budget) * 100 : null

  const rows = jours.map((j) => `
<tr>
  <td style="${styles.tdLeft}">${esc(j.jour_fr)}</td>
  <td style="${styles.td}">${formatNombre(j.midi.real)}</td>
  <td style="${styles.td}">${formatNombre(j.midi.budget)}</td>
  <td style="${styles.td}">${j.midi.delta !== 0 ? formatNombre(j.midi.delta) : '—'}</td>
  <td style="${styles.td} ${bgForRatio(j.midi.ratio)}; font-weight: 700;">${formatPct(j.midi.ratio)}</td>
  <td style="${styles.td}">${formatNombre(j.soir.real)}</td>
  <td style="${styles.td}">${formatNombre(j.soir.budget)}</td>
  <td style="${styles.td}">${j.soir.delta !== 0 ? formatNombre(j.soir.delta) : '—'}</td>
  <td style="${styles.td} ${bgForRatio(j.soir.ratio)}; font-weight: 700;">${formatPct(j.soir.ratio)}</td>
</tr>`).join('')

  return `<h3 style="${styles.h3}">Couverts jour par jour Réel VS Budget ${esc(periode)}</h3>
<table style="${styles.table}">
  <thead>
    <tr>
      <th style="${styles.th}; text-align: left;" rowspan="2">Jour</th>
      <th style="${styles.th}" colspan="4">MIDI</th>
      <th style="${styles.th}" colspan="4">SOIR</th>
    </tr>
    <tr>
      <th style="${styles.th}">Reel</th><th style="${styles.th}">Budget</th><th style="${styles.th}">Écart Nb</th><th style="${styles.th}">Écart %</th>
      <th style="${styles.th}">Reel</th><th style="${styles.th}">Budget</th><th style="${styles.th}">Écart Nb</th><th style="${styles.th}">Écart %</th>
    </tr>
  </thead>
  <tbody>
    ${rows}
    <tr style="background: ${COLOR.fond}; font-weight: 700;">
      <td style="${styles.tdLeft}">Total</td>
      <td style="${styles.td}">${formatNombre(total.midi.real)}</td>
      <td style="${styles.td}">${formatNombre(total.midi.budget)}</td>
      <td style="${styles.td}"></td>
      <td style="${styles.td} ${bgForRatio(total.midi.ratio)}">${formatPct(total.midi.ratio)}</td>
      <td style="${styles.td}">${formatNombre(total.soir.real)}</td>
      <td style="${styles.td}">${formatNombre(total.soir.budget)}</td>
      <td style="${styles.td}"></td>
      <td style="${styles.td} ${bgForRatio(total.soir.ratio)}">${formatPct(total.soir.ratio)}</td>
    </tr>
  </tbody>
</table>`
}

function renderAutresCa(autreCaDetail, autreCa, periode) {
  if (!autreCaDetail || autreCaDetail.length === 0) return ''
  const lines = autreCaDetail.map((r) => `
    <li style="${styles.li}"><strong>${esc(r.lieu_label)} ${esc(SERVICE_LABEL[r.service])}</strong> : <strong>${formatEur(r.ca_autre)}</strong></li>`).join('')
  const totalLine = autreCaDetail.length > 1
    ? `<li style="${styles.li}; margin-top: 6px; padding-top: 6px; border-top: 1px solid ${COLOR.bordure}; font-weight: 700;">Total <strong>${formatEur(autreCa)}</strong></li>`
    : ''
  return `<h3 style="${styles.h3}">Autres CA (privatisations, frais…) ${esc(periode)}</h3>
<ul style="${styles.ul}">${lines}${totalLine}</ul>`
}

function renderArticles(articles, articlesVentes, couverts, periode) {
  if (!articles || articles.length === 0) return ''
  const groups = [
    { type: 'menu',       service: 'lunch',  label: 'Ventes Menu Déjeuner', svcCouv: couverts.midi.real },
    { type: 'menu',       service: 'dinner', label: 'Ventes Menu Dîner',    svcCouv: couverts.soir.real },
    { type: 'menu',       service: 'all',    label: 'Ventes Menu (tous services)', svcCouv: couverts.total.real },
    { type: 'supplement', service: 'lunch',  label: 'Suppléments Déjeuner', svcCouv: couverts.midi.real },
    { type: 'supplement', service: 'dinner', label: 'Suppléments Dîner',    svcCouv: couverts.soir.real },
    { type: 'supplement', service: 'all',    label: 'Suppléments (tous services)', svcCouv: couverts.total.real },
  ]
  const blocks = groups.map((g) => {
    const items = articles.filter((a) => a.type === g.type && a.service === g.service)
    if (items.length === 0) return ''
    const hasAny = items.some((a) => Number(articlesVentes?.[a.id] || 0) > 0)
    if (!hasAny) return '' // skip si aucune qté
    const rows = items.map((a) => {
      const qte = Number(articlesVentes?.[a.id] || 0)
      const pct = g.svcCouv > 0 ? (qte / g.svcCouv) * 100 : null
      return `<tr>
  <td style="${styles.tdLeft}">${esc(a.nom)}</td>
  <td style="${styles.td}">${formatNombre(qte)}</td>
  <td style="${styles.td}; font-weight: 700;">${pct != null ? formatPctSimple(pct) : '—'}</td>
</tr>`
    }).join('')
    return `<div style="margin-bottom: 16px;">
  <div style="font-size: 12px; font-weight: 600; color: ${COLOR.texte}; margin-bottom: 6px;">${esc(g.label)}</div>
  <table style="${styles.table}">
    <thead>
      <tr>
        <th style="${styles.th}; text-align: left;">Nom de l'article</th>
        <th style="${styles.th}">Qté vendue</th>
        <th style="${styles.th}">% vs couverts</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
</div>`
  }).filter(Boolean).join('\n')
  if (!blocks) return ''
  return `<h3 style="${styles.h3}">Ventes par article ${esc(periode)}</h3>${blocks}`
}

function renderCommentaire(commentaire) {
  if (!commentaire || !commentaire.trim()) return ''
  // Préserve les retours à la ligne
  const lines = commentaire.split('\n').map((l) => esc(l) || '<br/>').join('<br/>')
  return `<h3 style="${styles.h3}">Commentaires</h3><p style="${styles.p}">${lines}</p>`
}

// ── Helpers d'export côté navigateur ────────────────────────────────────────

export function downloadHtmlFile(html, filename) {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename || 'rapport.html'
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// Copie le HTML dans le presse-papier au format rich-text. Les clients
// mail (Gmail, Outlook) collent alors avec la mise en forme préservée.
export async function copyHtmlToClipboard(html) {
  if (typeof navigator === 'undefined' || !navigator.clipboard) {
    throw new Error('Presse-papier non disponible')
  }
  // Plain text fallback (Gmail le rend dégradé)
  const plain = html.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  if (window.ClipboardItem) {
    const blobHtml = new Blob([html], { type: 'text/html' })
    const blobText = new Blob([plain], { type: 'text/plain' })
    await navigator.clipboard.write([
      new ClipboardItem({ 'text/html': blobHtml, 'text/plain': blobText }),
    ])
  } else {
    // Fallback : copie le plain-text uniquement (mais Gmail aime quand
    // même un peu plus si on a un blob HTML — la plupart des navigateurs
    // modernes supportent ClipboardItem). Si ClipboardItem absent, on
    // perd la mise en forme.
    await navigator.clipboard.writeText(plain)
  }
}
