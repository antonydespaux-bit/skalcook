// Export du rapport food cost en Excel (.xlsx) ou en HTML imprimable
// (ouvert dans un nouvel onglet qui déclenche window.print() — l'utilisateur
// choisit "Enregistrer en PDF" dans la boîte de dialogue d'impression).
//
// Onglets Excel :
//   1. Synthèse — période, CA HT, achats HT, inventaires, coût matière, ratio
//   2. Factures — date | fournisseur | n° facture | HT
//   3. Ajustements — date | libellé | montant | commentaire
//
// HTML d'impression : version mise en page A4, identique aux trois onglets
// fusionnés sur une page, avec en-tête et @page pour le format.

import * as XLSX from 'xlsx'

// ── Helpers ────────────────────────────────────────────────────────────────

function round2(n) {
  if (n == null || Number.isNaN(Number(n))) return 0
  return Math.round(Number(n) * 100) / 100
}

function formatDate(iso) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function formatEur(n) {
  if (n == null || Number.isNaN(Number(n))) return '—'
  return `${Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
}

function formatPct(n) {
  if (n == null || !Number.isFinite(n)) return '—'
  return `${n.toFixed(1)} %`
}

function ratioColor(ratio) {
  if (ratio == null) return '#666'
  if (ratio < 30) return '#15803D'
  if (ratio < 35) return '#CA8A04'
  if (ratio < 40) return '#C2410C'
  return '#B91C1C'
}

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// ── Calculs ─────────────────────────────────────────────────────────────────

export function computeTotaux({ inventaireDebut, inventaireFin, achatsHt, ajustements, caFoodHt }) {
  const invD = inventaireDebut == null || inventaireDebut === '' ? 0 : Number(inventaireDebut)
  const invF = inventaireFin == null || inventaireFin === '' ? 0 : Number(inventaireFin)
  const sumAjust = (ajustements || []).reduce((s, a) => s + (Number(a.montant) || 0), 0)
  const coutMatiere = invD + (Number(achatsHt) || 0) - invF + sumAjust
  const ratio = Number(caFoodHt) > 0 ? (coutMatiere / Number(caFoodHt)) * 100 : null
  return { invD, invF, sumAjust, coutMatiere, ratio }
}

// ── Excel workbook ──────────────────────────────────────────────────────────

export function buildFoodCostWorkbook({
  periodeDebut,
  periodeFin,
  caFoodHt,
  achatsHt,
  inventaireDebut,
  inventaireFin,
  notes,
  factures,
  ajustements,
  generatedAt = new Date(),
}) {
  const t = computeTotaux({ inventaireDebut, inventaireFin, achatsHt, ajustements, caFoodHt })

  // Onglet 1 : Synthèse
  const synthRows = [
    { Champ: 'Date d\'export',          Valeur: generatedAt.toLocaleString('fr-FR') },
    { Champ: 'Période début',           Valeur: periodeDebut },
    { Champ: 'Période fin',             Valeur: periodeFin },
    { Champ: '',                         Valeur: '' },
    { Champ: 'CA Food HT',              Valeur: round2(caFoodHt) },
    { Champ: 'Achats HT cumulés',       Valeur: round2(achatsHt) },
    { Champ: 'Inventaire début (HT)',   Valeur: inventaireDebut === '' || inventaireDebut == null ? '—' : round2(inventaireDebut) },
    { Champ: 'Inventaire fin (HT)',     Valeur: inventaireFin === '' || inventaireFin == null ? '—' : round2(inventaireFin) },
    { Champ: 'Variation de stock',      Valeur: round2(t.invD - t.invF) },
    { Champ: 'Σ ajustements (signés)',  Valeur: round2(t.sumAjust) },
    { Champ: 'Coût matière',            Valeur: round2(t.coutMatiere) },
    { Champ: 'Ratio food cost (%)',     Valeur: t.ratio == null ? '—' : `${t.ratio.toFixed(1)} %` },
    { Champ: '',                         Valeur: '' },
    { Champ: 'Notes',                   Valeur: notes || '' },
  ]
  const wsSynth = XLSX.utils.json_to_sheet(synthRows)
  wsSynth['!cols'] = [{ wch: 28 }, { wch: 40 }]

  // Onglet 2 : Factures
  const facturesRows = (factures || []).map((f) => ({
    'Date facture':   f.date_facture,
    'Fournisseur':    f.fournisseur || '',
    'N° facture':     f.numero_facture || '',
    'Total HT (€)':   round2(f.total_ht),
  }))
  // Ligne de total
  if (facturesRows.length > 0) {
    facturesRows.push({
      'Date facture': '',
      'Fournisseur':  '',
      'N° facture':   'TOTAL',
      'Total HT (€)': round2((factures || []).reduce((s, f) => s + (Number(f.total_ht) || 0), 0)),
    })
  }
  const wsFact = XLSX.utils.json_to_sheet(facturesRows, {
    header: ['Date facture', 'Fournisseur', 'N° facture', 'Total HT (€)'],
  })
  wsFact['!cols'] = [{ wch: 12 }, { wch: 30 }, { wch: 18 }, { wch: 14 }]

  // Onglet 3 : Ajustements
  const ajusRows = (ajustements || []).map((a) => ({
    'Date':         a.date_ajustement,
    'Libellé':      a.libelle,
    'Montant (€)':  round2(a.montant),
    'Commentaire':  a.commentaire || '',
  }))
  if (ajusRows.length > 0) {
    ajusRows.push({
      'Date':        '',
      'Libellé':     'TOTAL',
      'Montant (€)': round2(t.sumAjust),
      'Commentaire': '',
    })
  }
  const wsAjus = XLSX.utils.json_to_sheet(ajusRows, {
    header: ['Date', 'Libellé', 'Montant (€)', 'Commentaire'],
  })
  wsAjus['!cols'] = [{ wch: 12 }, { wch: 30 }, { wch: 14 }, { wch: 40 }]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, wsSynth, 'Synthèse')
  XLSX.utils.book_append_sheet(wb, wsFact,  'Factures')
  XLSX.utils.book_append_sheet(wb, wsAjus,  'Ajustements')
  return wb
}

export function downloadFoodCostXlsx(workbook, filename) {
  XLSX.writeFile(workbook, filename)
}

// ── HTML d'impression / PDF ────────────────────────────────────────────────

export function buildFoodCostPrintHtml({
  periodeDebut,
  periodeFin,
  caFoodHt,
  achatsHt,
  inventaireDebut,
  inventaireFin,
  notes,
  factures,
  ajustements,
  generatedAt = new Date(),
}) {
  const t = computeTotaux({ inventaireDebut, inventaireFin, achatsHt, ajustements, caFoodHt })
  const rColor = ratioColor(t.ratio)

  const facturesRows = (factures || []).map((f) => `
    <tr>
      <td>${esc(formatDate(f.date_facture))}</td>
      <td>${esc(f.fournisseur || '')}</td>
      <td>${esc(f.numero_facture || '')}</td>
      <td class="num">${formatEur(f.total_ht)}</td>
    </tr>
  `).join('')

  const facturesTotal = (factures || []).reduce((s, f) => s + (Number(f.total_ht) || 0), 0)

  const ajusRows = (ajustements || []).map((a) => `
    <tr>
      <td>${esc(formatDate(a.date_ajustement))}</td>
      <td>${esc(a.libelle)}</td>
      <td class="num" style="color: ${Number(a.montant) < 0 ? '#15803D' : '#B91C1C'}">${Number(a.montant) > 0 ? '+' : ''}${formatEur(a.montant)}</td>
      <td>${esc(a.commentaire || '')}</td>
    </tr>
  `).join('')

  return `<!DOCTYPE html>
<html lang="fr"><head>
<meta charset="utf-8">
<title>Rapport food cost ${esc(periodeDebut)} → ${esc(periodeFin)}</title>
<style>
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
    color: #111; font-size: 12px; line-height: 1.5; margin: 0; padding: 16px;
  }
  h1 { font-size: 22px; margin: 0 0 4px; }
  h2 {
    font-size: 13px; margin: 22px 0 8px; text-transform: uppercase;
    letter-spacing: 0.4px; color: #555; border-bottom: 1px solid #ddd; padding-bottom: 4px;
  }
  .meta { color: #666; font-size: 11px; margin-bottom: 12px; }
  .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 12px 0; }
  .kpi {
    border: 1px solid #ddd; border-radius: 6px; padding: 8px 10px; background: #fafafa;
  }
  .kpi .label { font-size: 10px; color: #666; text-transform: uppercase; font-weight: 600; }
  .kpi .value { font-size: 16px; font-weight: 700; margin-top: 2px; font-variant-numeric: tabular-nums; }
  .ratio-badge { font-size: 28px; font-weight: 700; color: ${rColor}; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 4px; }
  th { background: #f3f4f6; color: #555; font-size: 10px; text-transform: uppercase;
       padding: 6px 8px; border: 1px solid #e5e7eb; text-align: left; }
  td { padding: 5px 8px; border: 1px solid #e5e7eb; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; }
  tr.total td { font-weight: 700; background: #f9fafb; }
  .notes { white-space: pre-wrap; padding: 8px; background: #fafafa; border: 1px solid #eee; border-radius: 4px; }
  .empty { color: #999; font-style: italic; padding: 8px; }
  .formula { color: #666; font-size: 10px; }
  @media print {
    body { padding: 0; }
    h2 { break-after: avoid; }
    tr { break-inside: avoid; }
  }
</style>
</head><body>
<h1>Rapport food cost</h1>
<div class="meta">
  Période <strong>${esc(formatDate(periodeDebut))} → ${esc(formatDate(periodeFin))}</strong>
  · Édité le ${esc(generatedAt.toLocaleString('fr-FR'))}
</div>

<div class="kpis">
  <div class="kpi"><div class="label">CA Food HT</div><div class="value">${formatEur(caFoodHt)}</div></div>
  <div class="kpi"><div class="label">Achats HT</div><div class="value">${formatEur(achatsHt)}</div></div>
  <div class="kpi"><div class="label">Coût matière</div><div class="value">${formatEur(t.coutMatiere)}</div></div>
  <div class="kpi"><div class="label">Ratio food cost</div><div class="value ratio-badge">${formatPct(t.ratio)}</div></div>
</div>

<h2>Variation de stock & coût matière</h2>
<table>
  <tr><td>Inventaire début (HT)</td><td class="num">${inventaireDebut === '' || inventaireDebut == null ? '—' : formatEur(inventaireDebut)}</td></tr>
  <tr><td>+ Achats HT cumulés</td><td class="num">${formatEur(achatsHt)}</td></tr>
  <tr><td>− Inventaire fin (HT)</td><td class="num">${inventaireFin === '' || inventaireFin == null ? '—' : formatEur(inventaireFin)}</td></tr>
  <tr><td>+ Σ ajustements (signés)</td><td class="num">${t.sumAjust > 0 ? '+' : ''}${formatEur(t.sumAjust)}</td></tr>
  <tr class="total"><td>= Coût matière</td><td class="num">${formatEur(t.coutMatiere)}</td></tr>
  <tr class="total"><td>Ratio food cost = coût matière ÷ CA Food HT</td><td class="num" style="color: ${rColor}">${formatPct(t.ratio)}</td></tr>
</table>

<h2>Factures de la période (${(factures || []).length})</h2>
${(factures || []).length === 0 ? '<div class="empty">Aucune facture sur la période.</div>' : `
<table>
  <thead>
    <tr><th style="width:12%">Date</th><th>Fournisseur</th><th style="width:18%">N° facture</th><th style="width:15%; text-align:right">Total HT</th></tr>
  </thead>
  <tbody>
    ${facturesRows}
    <tr class="total"><td colspan="3">TOTAL</td><td class="num">${formatEur(facturesTotal)}</td></tr>
  </tbody>
</table>`}

<h2>Ajustements (${(ajustements || []).length})</h2>
${(ajustements || []).length === 0 ? '<div class="empty">Aucun ajustement sur la période.</div>' : `
<table>
  <thead>
    <tr><th style="width:12%">Date</th><th>Libellé</th><th style="width:18%; text-align:right">Montant</th><th>Commentaire</th></tr>
  </thead>
  <tbody>
    ${ajusRows}
    <tr class="total"><td colspan="2">TOTAL</td><td class="num">${t.sumAjust > 0 ? '+' : ''}${formatEur(t.sumAjust)}</td><td></td></tr>
  </tbody>
</table>`}

${notes ? `<h2>Notes</h2><div class="notes">${esc(notes)}</div>` : ''}

<script>window.addEventListener('load', function(){ setTimeout(function(){ window.print() }, 300) })</script>
</body></html>`
}

export function openPrintWindow(html) {
  const w = window.open('', '_blank')
  if (!w) {
    throw new Error('Le navigateur a bloqué la fenêtre d\'impression. Autorise les pop-ups pour ce site.')
  }
  w.document.open()
  w.document.write(html)
  w.document.close()
}
