// Export du rapport food cost en Excel (.xlsx) stylisé via exceljs ou en
// HTML imprimable (ouvert dans un nouvel onglet qui déclenche window.print() —
// l'utilisateur choisit "Enregistrer en PDF" dans la boîte de dialogue
// d'impression).
//
// Onglets Excel :
//   1. Synthèse — vraie mise en page tableau : titre fusionné, sections
//      (Période / Chiffres clés / Calcul du coût matière), bordures grises
//      partout, montants au format euro "1 234,56 €", ratio formaté en %.
//   2. Factures — date | fournisseur | n° facture | HT, bordures + en-têtes
//      gras, ligne TOTAL.
//   3. Ajustements — date | libellé | montant | commentaire, bordures, total.
//
// exceljs est chargé dynamiquement (await import) pour ne pas alourdir le
// bundle initial de la page (~700 KB).

const EURO_FMT = '#,##0.00 "€";-#,##0.00 "€";"—"'
const PCT_FMT  = '0.0 "%"'
const DATE_FMT = 'dd/mm/yyyy'

// ── Helpers ────────────────────────────────────────────────────────────────

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

function parseIsoDate(iso) {
  if (!iso) return null
  return new Date(`${iso}T00:00:00`)
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

// ── Styles exceljs ─────────────────────────────────────────────────────────

const BORDER_THIN = { style: 'thin', color: { argb: 'FFCCCCCC' } }
const BORDER_ALL = { top: BORDER_THIN, bottom: BORDER_THIN, left: BORDER_THIN, right: BORDER_THIN }

const FILL_HEADER  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } }
const FILL_SECTION = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } }
const FILL_TOTAL   = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } }

// ── Excel workbook (async) ─────────────────────────────────────────────────

export async function buildFoodCostWorkbook({
  periodeDebut,
  periodeFin,
  caFoodHt,
  achatsHt,
  inventaireDebut,
  inventaireFin,
  notes,
  factures,
  ajustements,
}) {
  const ExcelJS = (await import('exceljs')).default
  const t = computeTotaux({ inventaireDebut, inventaireFin, achatsHt, ajustements, caFoodHt })

  const wb = new ExcelJS.Workbook()
  wb.creator = 'Skalcook'
  wb.created = new Date()

  // ── Onglet 1 : Synthèse ─────────────────────────────────────────────────
  const wsSynth = wb.addWorksheet('Synthèse')
  wsSynth.columns = [{ width: 32 }, { width: 22 }]

  // Titre fusionné
  wsSynth.mergeCells('A1:B1')
  const titleCell = wsSynth.getCell('A1')
  titleCell.value = `Rapport food cost — ${formatDate(periodeDebut)} → ${formatDate(periodeFin)}`
  titleCell.font = { size: 14, bold: true }
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' }
  titleCell.fill = FILL_SECTION
  titleCell.border = BORDER_ALL
  wsSynth.getRow(1).height = 22

  // Helper pour ajouter une ligne de section (entête en gras + fond)
  const addSectionHeader = (label) => {
    const row = wsSynth.addRow([label, ''])
    wsSynth.mergeCells(`A${row.number}:B${row.number}`)
    const c = wsSynth.getCell(`A${row.number}`)
    c.font = { bold: true, size: 11 }
    c.fill = FILL_HEADER
    c.border = BORDER_ALL
    c.alignment = { horizontal: 'left' }
    return row
  }

  const addKV = (champ, valeur, opts = {}) => {
    const row = wsSynth.addRow([champ, valeur ?? null])
    const cChamp = wsSynth.getCell(`A${row.number}`)
    const cVal = wsSynth.getCell(`B${row.number}`)
    cChamp.font = { bold: !!opts.bold }
    cVal.font = { bold: !!opts.bold }
    cChamp.border = BORDER_ALL
    cVal.border = BORDER_ALL
    cChamp.alignment = { horizontal: 'left', vertical: 'middle' }
    cVal.alignment = { horizontal: 'right', vertical: 'middle' }
    if (opts.fmt) cVal.numFmt = opts.fmt
    if (opts.fill) {
      cChamp.fill = opts.fill
      cVal.fill = opts.fill
    }
    if (opts.color) {
      cVal.font = { ...cVal.font, color: { argb: opts.color } }
    }
    return row
  }

  // Section : Période
  addSectionHeader('Période')
  addKV('Période début', parseIsoDate(periodeDebut), { fmt: DATE_FMT })
  addKV('Période fin',   parseIsoDate(periodeFin),   { fmt: DATE_FMT })

  // Section : Chiffres clés
  addSectionHeader('Chiffres clés')
  addKV('CA Food HT',         Number(caFoodHt) || 0, { fmt: EURO_FMT })
  addKV('Achats HT cumulés',  Number(achatsHt) || 0, { fmt: EURO_FMT })

  // Section : Calcul du coût matière
  addSectionHeader('Calcul du coût matière')
  addKV('Inventaire début (HT)', inventaireDebut === '' || inventaireDebut == null ? null : Number(inventaireDebut), { fmt: EURO_FMT })
  addKV('+ Achats HT',           Number(achatsHt) || 0, { fmt: EURO_FMT })
  addKV('− Inventaire fin (HT)', inventaireFin === '' || inventaireFin == null ? null : Number(inventaireFin), { fmt: EURO_FMT })
  addKV('+ Σ ajustements',       t.sumAjust, { fmt: EURO_FMT })
  addKV('= Coût matière',        t.coutMatiere, { fmt: EURO_FMT, bold: true, fill: FILL_TOTAL })
  addKV('Ratio food cost',       t.ratio == null ? null : t.ratio, {
    fmt: PCT_FMT,
    bold: true,
    fill: FILL_TOTAL,
    color: t.ratio == null ? null : t.ratio < 30 ? 'FF15803D' : t.ratio < 35 ? 'FFCA8A04' : t.ratio < 40 ? 'FFC2410C' : 'FFB91C1C',
  })

  // Section : Notes (uniquement si renseignées)
  if (notes && notes.trim()) {
    addSectionHeader('Notes')
    const row = wsSynth.addRow([notes, ''])
    wsSynth.mergeCells(`A${row.number}:B${row.number}`)
    const c = wsSynth.getCell(`A${row.number}`)
    c.alignment = { horizontal: 'left', vertical: 'top', wrapText: true }
    c.border = BORDER_ALL
    row.height = Math.min(120, 18 + Math.floor(notes.length / 60) * 16)
  }

  // ── Onglet 2 : Factures ─────────────────────────────────────────────────
  const wsFact = wb.addWorksheet('Factures')
  wsFact.columns = [
    { header: 'Date',        key: 'date',        width: 14 },
    { header: 'Fournisseur', key: 'fournisseur', width: 34 },
    { header: 'N° facture',  key: 'numero',      width: 22 },
    { header: 'Total HT',    key: 'ht',          width: 16 },
  ]
  const factHeader = wsFact.getRow(1)
  factHeader.font = { bold: true }
  factHeader.fill = FILL_HEADER
  factHeader.alignment = { horizontal: 'center' }
  factHeader.eachCell((c) => { c.border = BORDER_ALL })

  for (const f of (factures || [])) {
    const row = wsFact.addRow({
      date:        parseIsoDate(f.date_facture),
      fournisseur: f.fournisseur || '',
      numero:      f.numero_facture || '',
      ht:          Number(f.total_ht) || 0,
    })
    row.getCell('date').numFmt = DATE_FMT
    row.getCell('ht').numFmt = EURO_FMT
    row.eachCell((c) => { c.border = BORDER_ALL })
  }
  if ((factures || []).length > 0) {
    const facturesTotal = (factures || []).reduce((s, f) => s + (Number(f.total_ht) || 0), 0)
    const totalRow = wsFact.addRow({ numero: 'TOTAL', ht: facturesTotal })
    totalRow.font = { bold: true }
    totalRow.fill = FILL_TOTAL
    totalRow.getCell('ht').numFmt = EURO_FMT
    totalRow.eachCell((c) => { c.border = BORDER_ALL })
  }

  // ── Onglet 3 : Ajustements ──────────────────────────────────────────────
  const wsAjus = wb.addWorksheet('Ajustements')
  wsAjus.columns = [
    { header: 'Date',        key: 'date',        width: 14 },
    { header: 'Libellé',     key: 'libelle',     width: 34 },
    { header: 'Montant',     key: 'montant',     width: 16 },
    { header: 'Commentaire', key: 'commentaire', width: 40 },
  ]
  const ajusHeader = wsAjus.getRow(1)
  ajusHeader.font = { bold: true }
  ajusHeader.fill = FILL_HEADER
  ajusHeader.alignment = { horizontal: 'center' }
  ajusHeader.eachCell((c) => { c.border = BORDER_ALL })

  for (const a of (ajustements || [])) {
    const row = wsAjus.addRow({
      date:        parseIsoDate(a.date_ajustement),
      libelle:     a.libelle,
      montant:     Number(a.montant) || 0,
      commentaire: a.commentaire || '',
    })
    row.getCell('date').numFmt = DATE_FMT
    row.getCell('montant').numFmt = EURO_FMT
    row.eachCell((c) => { c.border = BORDER_ALL })
  }
  if ((ajustements || []).length > 0) {
    const totalRow = wsAjus.addRow({ libelle: 'TOTAL', montant: t.sumAjust })
    totalRow.font = { bold: true }
    totalRow.fill = FILL_TOTAL
    totalRow.getCell('montant').numFmt = EURO_FMT
    totalRow.eachCell((c) => { c.border = BORDER_ALL })
  }

  return wb
}

export async function downloadFoodCostXlsx(workbook, filename) {
  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
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
  <tr><td>+ Σ ajustements</td><td class="num">${t.sumAjust > 0 ? '+' : ''}${formatEur(t.sumAjust)}</td></tr>
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
