// Template Excel "équipes" : généré depuis /controle-gestion/ventes/budgets,
// envoyé en début de mois aux équipes pour qu'elles remplissent le CA réel
// jour par jour. Reproduit le format historique Marsan (un onglet par jour
// + un onglet Synthèse mensuelle), avec :
//   - Budgets pré-remplis (cellules jaunes : Ticket Budget, Budget Couvert,
//     Budget CA, Budget Mensuel)
//   - Cellules de saisie vides pour Couverts / CA TTC / Autres CA
//   - Formules automatiques : Ticket Moyen, Écart, Cumul Mensuel
//   - Jours fermés grisés (pas de budget sur ce jour-de-semaine)
//
// Builder pur (pas de Supabase ni React) → testable et réutilisable.
//
// API : await buildBudgetsEquipesWorkbook(opts) → exceljs.Workbook
//        const buf = await wb.xlsx.writeBuffer()
//        // côté client : Blob + URL.createObjectURL + a.click()

import ExcelJS from 'exceljs'

const JOURS_FR_LONG = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi']
const JOURS_FR_SHORT = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam']
const MOIS_LABEL = ['', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']

// Couleurs ARGB (alpha, R, G, B) — palette inspirée du template Marsan.
const COLOR = {
  yellow: 'FFFFFF00',
  yellowSoft: 'FFFFF9C4',
  green: 'FFC8E6C9',
  greenDark: 'FF1B5E20',
  greySoft: 'FFEEEEEE',
  greyDark: 'FFBDBDBD',
  pinkSoft: 'FFFFE0E0',
  redDark: 'FFC62828',
  border: 'FFB0B0B0',
}

function jsWeekdayToIso(jsWeekday) {
  return jsWeekday === 0 ? 7 : jsWeekday
}

function joursDansMois(annee, mois, jdsTarget) {
  const lastDay = new Date(annee, mois, 0).getDate()
  let count = 0
  for (let d = 1; d <= lastDay; d++) {
    const date = new Date(annee, mois - 1, d)
    const dow = jsWeekdayToIso(date.getDay())
    if (dow === jdsTarget) count++
  }
  return count
}

function nbJoursOverride(annee, mois, jds, svcCode, joursOverride) {
  const ov = joursOverride?.[mois]?.[jds]?.[svcCode]
  if (ov != null && ov !== '') return Number(ov)
  return joursDansMois(annee, mois, jds)
}

// Construit le total CA TTC budgétaire pour une cellule (jds, lieu, svc).
function cellBudgetTotal(cell) {
  if (!cell) return 0
  return (
    Number(cell.ca_food_cible || 0) +
    Number(cell.ca_bev_20_cible || 0) +
    Number(cell.ca_bev_10_cible || 0) +
    Number(cell.ca_autre_cible || 0)
  )
}

// Détermine si un jour calendaire est "ouvert" : au moins une cellule
// budget non nulle parmi tous les (lieu, service) pour ce jour-de-semaine.
function isDayOpen(isoJds, lieux, services, moisBudgets) {
  for (const lieu of lieux) {
    for (const svc of services) {
      const cell = moisBudgets[`${isoJds}_${lieu.id}_${svc.code}`]
      if (cell && (Number(cell.couverts_cible || 0) > 0 || cellBudgetTotal(cell) > 0)) {
        return true
      }
    }
  }
  return false
}

// Crée un border thin gris autour d'une cellule.
function thinBorder() {
  return {
    top:    { style: 'thin', color: { argb: COLOR.border } },
    left:   { style: 'thin', color: { argb: COLOR.border } },
    right:  { style: 'thin', color: { argb: COLOR.border } },
    bottom: { style: 'thin', color: { argb: COLOR.border } },
  }
}

function fillColor(argb) {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb } }
}

// ─── Sheet par jour ─────────────────────────────────────────────────────────

// Construit l'onglet d'un jour donné. Renvoie le nom de l'onglet créé.
function buildDaySheet(wb, { date, isoJds, isOpen, lieux, services, moisBudgets, synthRowIndex }) {
  const sheetName = `${String(date.getDate()).padStart(2, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}`
  const ws = wb.addWorksheet(sheetName, {
    pageSetup: { paperSize: 9, orientation: 'landscape' },
    properties: { tabColor: { argb: isOpen ? undefined : COLOR.greyDark } },
  })

  // Layout : colonne A = label rangée. Pour chaque lieu : 3 colonnes (Déj / Dîn / Tot).
  // → totalCols = 1 + lieux.length × 3
  const totalCols = 1 + lieux.length * services.length + lieux.length // services = 2 → 3 cols (déj, dîn, tot) par lieu

  // Largeur colonnes
  ws.getColumn(1).width = 20
  for (let i = 2; i <= totalCols; i++) ws.getColumn(i).width = 11

  const cellGrey = (cell) => {
    if (!isOpen) {
      cell.fill = fillColor(COLOR.greySoft)
      cell.font = { ...(cell.font || {}), color: { argb: COLOR.greyDark } }
    }
  }

  // ── Ligne 1 : Date + en-têtes lieux fusionnés ────────────────────────────
  const r1 = ws.getRow(1)
  r1.getCell(1).value = formatDateFr(date)
  r1.getCell(1).font = { bold: true, size: 11 }
  r1.getCell(1).alignment = { vertical: 'middle', horizontal: 'center' }
  r1.getCell(1).fill = fillColor(COLOR.yellowSoft)
  r1.getCell(1).border = thinBorder()
  // Header lieu fusionné sur 3 colonnes (déj + dîn + tot)
  let col = 2
  for (const lieu of lieux) {
    const startCol = col
    const endCol = col + 2 // 3 colonnes
    ws.mergeCells(1, startCol, 1, endCol)
    const lieuCell = ws.getCell(1, startCol)
    lieuCell.value = lieu.label.toUpperCase()
    lieuCell.alignment = { vertical: 'middle', horizontal: 'center' }
    lieuCell.fill = fillColor(COLOR.yellow)
    lieuCell.font = { bold: true, size: 10 }
    lieuCell.border = thinBorder()
    cellGrey(lieuCell)
    col = endCol + 1
  }
  ws.mergeCells(1, 1, 2, 1) // date verticale fusionne 2 lignes

  // ── Ligne 2 : DEJEUNER / DINER / TOT pour chaque lieu ────────────────────
  const r2 = ws.getRow(2)
  col = 2
  for (const _lieu of lieux) {
    for (const label of ['DEJEUNER', 'DINER', 'TOT']) {
      const cell = r2.getCell(col)
      cell.value = label
      cell.alignment = { vertical: 'middle', horizontal: 'center' }
      cell.fill = fillColor(COLOR.yellow)
      cell.font = { bold: true, size: 9 }
      cell.border = thinBorder()
      cellGrey(cell)
      col++
    }
  }

  // ── Lignes 3-7 : rangées de saisie ───────────────────────────────────────
  // 3: Couverts (input)
  // 4: CA TTC (input)
  // 5: Autres CA (input)
  // 6: Ticket Moyen (formula = CA / Couv)
  // 7: Ticket Budget (pré-rempli, jaune)
  const rowsConfig = [
    { row: 3, label: 'Couverts', input: true, computeTot: true },
    { row: 4, label: 'CA TTC',   input: true, computeTot: true },
    { row: 5, label: 'Autres CA', input: true, computeTot: true },
    { row: 6, label: 'Ticket Moyen', computed: true },
    { row: 7, label: 'Ticket Budget', budget: true },
  ]
  for (const cfg of rowsConfig) {
    const row = ws.getRow(cfg.row)
    row.getCell(1).value = cfg.label
    row.getCell(1).font = { bold: true }
    row.getCell(1).fill = fillColor(COLOR.pinkSoft)
    row.getCell(1).border = thinBorder()
    col = 2
    for (const lieu of lieux) {
      for (const svc of services) {
        const cell = row.getCell(col)
        cell.border = thinBorder()
        cell.alignment = { horizontal: 'center' }
        cellGrey(cell)
        if (cfg.budget && isOpen) {
          const budgetCell = moisBudgets[`${isoJds}_${lieu.id}_${svc.code}`]
          const tm = budgetCell && Number(budgetCell.couverts_cible || 0) > 0
            ? cellBudgetTotal(budgetCell) / Number(budgetCell.couverts_cible)
            : 0
          cell.value = Math.round(tm)
          cell.fill = fillColor(COLOR.yellow)
          cell.font = { bold: true }
          cell.numFmt = '0'
        } else if (cfg.computed && isOpen) {
          // Ticket Moyen = CA TTC / Couverts (par cellule)
          const caAddr = ws.getCell(4, col).address
          const cvAddr = ws.getCell(3, col).address
          cell.value = { formula: `IFERROR(${caAddr}/${cvAddr},0)`, result: 0 }
          cell.numFmt = '0'
        }
        col++
      }
      // Colonne TOT pour ce lieu = somme déj + dîn
      const totCell = row.getCell(col)
      totCell.border = thinBorder()
      totCell.alignment = { horizontal: 'center' }
      totCell.fill = fillColor(COLOR.greySoft)
      cellGrey(totCell)
      if (cfg.computeTot && isOpen) {
        const dejCol = col - 2
        const dinCol = col - 1
        const dejAddr = ws.getCell(cfg.row, dejCol).address
        const dinAddr = ws.getCell(cfg.row, dinCol).address
        totCell.value = { formula: `${dejAddr}+${dinAddr}`, result: 0 }
        totCell.font = { bold: true }
        totCell.numFmt = '0'
      } else if (cfg.computed && isOpen) {
        const caAddr = ws.getCell(4, col).address
        const cvAddr = ws.getCell(3, col).address
        totCell.value = { formula: `IFERROR(${caAddr}/${cvAddr},0)`, result: 0 }
        totCell.numFmt = '0.00'
      } else if (cfg.budget && isOpen) {
        // Ticket Budget total : moyenne pondérée si possible, sinon /
        const dejBudget = moisBudgets[`${isoJds}_${lieu.id}_lunch`]
        const dinBudget = moisBudgets[`${isoJds}_${lieu.id}_dinner`]
        const totCouv = Number(dejBudget?.couverts_cible || 0) + Number(dinBudget?.couverts_cible || 0)
        const totCa = cellBudgetTotal(dejBudget) + cellBudgetTotal(dinBudget)
        totCell.value = totCouv > 0 ? Math.round(totCa / totCouv) : 0
        totCell.fill = fillColor(COLOR.yellow)
        totCell.font = { bold: true }
        totCell.numFmt = '0'
      }
      col++
    }
  }

  // ── Pavés synthèse en bas ─────────────────────────────────────────────────
  buildSynthesisBlocks(ws, {
    isOpen, lieux, services, moisBudgets, isoJds, synthRowIndex,
  })

  // Champs custom Marsan : Boîtes à cannelé (en haut à droite)
  const lastCol = totalCols
  const cannelLabelCell = ws.getCell(1, lastCol + 2)
  cannelLabelCell.value = 'Boîtes à cannelé'
  cannelLabelCell.font = { bold: true }
  cannelLabelCell.fill = fillColor(COLOR.pinkSoft)
  cannelLabelCell.border = thinBorder()
  cannelLabelCell.alignment = { horizontal: 'center' }
  const cannelValueCell = ws.getCell(1, lastCol + 3)
  cannelValueCell.border = thinBorder()
  cannelValueCell.alignment = { horizontal: 'center' }
  ws.getColumn(lastCol + 2).width = 20
  ws.getColumn(lastCol + 3).width = 8

  // Bandeau "JOUR FERMÉ" si applicable
  if (!isOpen) {
    ws.mergeCells(9, 1, 9, totalCols)
    const banner = ws.getCell(9, 1)
    banner.value = 'JOUR FERMÉ (aucun budget défini sur cette journée)'
    banner.alignment = { horizontal: 'center', vertical: 'middle' }
    banner.font = { bold: true, size: 12, color: { argb: COLOR.redDark } }
    banner.fill = fillColor(COLOR.greySoft)
    banner.border = thinBorder()
  }

  return sheetName
}

// ─── Pavés synthèse (en bas de chaque feuille jour) ────────────────────────

function buildSynthesisBlocks(ws, { isOpen, lieux, services, moisBudgets, isoJds, synthRowIndex }) {
  // Calcule les budgets agrégés pour la journée
  let budgetCaJour = 0
  let budgetCouvMidi = 0
  let budgetCouvSoir = 0
  for (const lieu of lieux) {
    for (const svc of services) {
      const cell = moisBudgets[`${isoJds}_${lieu.id}_${svc.code}`]
      const cv = Number(cell?.couverts_cible || 0)
      const ca = cellBudgetTotal(cell)
      budgetCaJour += ca
      if (svc.code === 'lunch') budgetCouvMidi += cv
      else budgetCouvSoir += cv
    }
  }
  const budgetCouvJour = budgetCouvMidi + budgetCouvSoir

  // Helper pour construire un pavé 3-lignes (label / valeur / écart)
  const buildBlock = (startRow, startCol, { titleReel, titleBudget, formulaReel, valBudget, formatEur = false }) => {
    const fmt = formatEur ? '#,##0 "€"' : '#,##0'
    const cells = [
      { row: startRow,     col: startCol,     v: titleReel,   fill: COLOR.green,    bold: true, align: 'left' },
      { row: startRow,     col: startCol + 1, v: isOpen ? { formula: formulaReel, result: 0 } : null, fill: COLOR.green,    bold: true, numFmt: fmt },
      { row: startRow + 1, col: startCol,     v: titleBudget, fill: COLOR.yellow,   bold: true, align: 'left' },
      { row: startRow + 1, col: startCol + 1, v: isOpen ? valBudget : null,         fill: COLOR.yellow,   bold: true, numFmt: fmt },
      { row: startRow + 2, col: startCol,     v: 'ECART',     fill: COLOR.pinkSoft, bold: true, align: 'left' },
      { row: startRow + 2, col: startCol + 1, v: isOpen ? { formula: `${ws.getCell(startRow, startCol + 1).address}-${ws.getCell(startRow + 1, startCol + 1).address}`, result: 0 } : null, fill: COLOR.greySoft, bold: true, numFmt: fmt },
    ]
    for (const c of cells) {
      const cell = ws.getCell(c.row, c.col)
      if (c.v !== null) cell.value = c.v
      if (c.fill) cell.fill = fillColor(c.fill)
      if (c.bold) cell.font = { bold: true }
      if (c.numFmt) cell.numFmt = c.numFmt
      cell.alignment = { horizontal: c.align || 'center' }
      cell.border = thinBorder()
    }
  }

  // CA Journée vs Budget — bloc 1 (col B-C, row 10-12)
  // CA Journée réel = somme de toutes les cellules CA TTC (row 4) tous lieux × svcs
  const caReelAddrs = []
  for (let i = 0; i < lieux.length; i++) {
    const dejCol = 2 + i * 3
    const dinCol = dejCol + 1
    caReelAddrs.push(ws.getCell(4, dejCol).address, ws.getCell(4, dinCol).address)
  }
  buildBlock(11, 3, {
    titleReel: 'CA JOURNEE',
    titleBudget: 'CA BUDGET',
    formulaReel: `SUM(${caReelAddrs.join(',')})`,
    valBudget: budgetCaJour,
    formatEur: true,
  })

  // Couverts midi / soir — blocs 2 et 3 (row 14-16)
  // Réel midi = somme col DEJEUNER de chaque lieu (row 3)
  const couvMidiAddrs = []
  const couvSoirAddrs = []
  for (let i = 0; i < lieux.length; i++) {
    const dejCol = 2 + i * 3
    const dinCol = dejCol + 1
    couvMidiAddrs.push(ws.getCell(3, dejCol).address)
    couvSoirAddrs.push(ws.getCell(3, dinCol).address)
  }
  buildBlock(15, 1, {
    titleReel: 'COUVERT SOIR',
    titleBudget: 'BUDGET COUVERT SOIR',
    formulaReel: `SUM(${couvSoirAddrs.join(',')})`,
    valBudget: budgetCouvSoir,
  })
  buildBlock(15, 4, {
    titleReel: 'COUVERT MIDI',
    titleBudget: 'BUDGET COUVERT MIDI',
    formulaReel: `SUM(${couvMidiAddrs.join(',')})`,
    valBudget: budgetCouvMidi,
  })

  // Couvert journée — bloc 4 (row 19-21)
  buildBlock(20, 3, {
    titleReel: 'COUVERT JOURNEE',
    titleBudget: 'BUDGET COUVERT',
    formulaReel: `SUM(${[...couvMidiAddrs, ...couvSoirAddrs].join(',')})`,
    valBudget: budgetCouvJour,
  })

  // Mensuel — bloc 5 (row 24-26) : utilise des références au Synthèse.
  // Depuis l'ajout de la colonne Exception (D), les cumuls Budget/Réel
  // sont en colonnes K/L (et non plus J/K).
  // synthRowIndex = numéro de ligne dans Synthèse (header en row 1, data dès row 2)
  buildBlock(24, 3, {
    titleReel: 'MENSUEL REEL',
    titleBudget: 'BUDGET MENSUEL',
    formulaReel: `Synthèse!L${synthRowIndex}`,
    valBudget: { formula: `Synthèse!K${synthRowIndex}`, result: 0 },
    formatEur: true,
  })
  ws.getColumn(2).width = 20 // labels gauche
  ws.getColumn(5).width = 22 // labels droite
}

// ─── Sheet Synthèse mensuelle ───────────────────────────────────────────────

function buildSynthesisSheet(wb, { annee, mois, days, lieux, services, moisBudgets, joursFermes = {} }) {
  const ws = wb.addWorksheet('Synthèse', { properties: { tabColor: { argb: COLOR.green } } })
  // Colonnes :
  //   A=Date, B=Jour, C=Ouverture, D=Exception (manuel : "Férié", "Fermé"…),
  //   E=Couv. réel, F=CA réel, G=Couv. budget, H=CA budget,
  //   I=Δ couv., J=Δ CA,
  //   K=Cumul budget, L=Cumul réel, M=Δ Cumul, N=Δ %
  //
  // La colonne D (Exception) permet d'exclure manuellement certains jours
  // du cumul (1er mai, fermeture exceptionnelle…). SUMIF dans K/L ignore
  // les lignes où D est non vide → tu reprends la main sur les jours à
  // ignorer sans casser les formules.
  const headers = [
    'Date', 'Jour', 'Ouverture', 'Exception',
    'Couv. réel', 'CA réel',
    'Couv. budget', 'CA budget',
    'Δ couv.', 'Δ CA',
    'Cumul budget', 'Cumul réel', 'Δ Cumul', 'Δ %',
  ]
  const r1 = ws.getRow(1)
  headers.forEach((h, i) => {
    const cell = r1.getCell(i + 1)
    cell.value = h
    cell.font = { bold: true }
    cell.alignment = { horizontal: 'center' }
    cell.fill = fillColor(COLOR.yellow)
    cell.border = thinBorder()
  })
  // Note dans le header Exception
  r1.getCell(4).note = 'Tape "Férié", "Fermé" ou autre pour exclure ce jour des cumuls. Les Δ Cumul et Δ % se recalculent automatiquement.'
  ws.getColumn(1).width = 12
  ws.getColumn(2).width = 10
  ws.getColumn(3).width = 12
  ws.getColumn(4).width = 14 // Exception
  for (let c = 5; c <= 14; c++) ws.getColumn(c).width = 14

  days.forEach((d, idx) => {
    const rowIdx = idx + 2 // row 2 = first day
    const row = ws.getRow(rowIdx)
    const sheetRef = `'${d.sheetName}'`

    // A: Date
    row.getCell(1).value = formatDateFr(d.date)
    row.getCell(1).alignment = { horizontal: 'left' }
    // B: Jour
    row.getCell(2).value = JOURS_FR_LONG[d.date.getDay()]
    // C: Ouverture
    row.getCell(3).value = d.isOpen ? 'Ouvert' : 'Fermé'
    row.getCell(3).font = { color: { argb: d.isOpen ? COLOR.greenDark : COLOR.greyDark }, bold: true }
    row.getCell(3).alignment = { horizontal: 'center' }
    // D: Exception — pré-rempli depuis ca_jours_fermes si la date matche,
    //               sinon vide (l'user peut taper directement dans Excel).
    const isoDate = formatDateIso(d.date)
    const exceptionMotif = joursFermes[isoDate] || ''
    row.getCell(4).value = exceptionMotif
    row.getCell(4).alignment = { horizontal: 'center' }
    row.getCell(4).fill = fillColor(COLOR.yellowSoft)
    if (exceptionMotif) {
      row.getCell(4).font = { bold: true, color: { argb: COLOR.greenDark } }
    }

    if (d.isOpen) {
      // Calcule budgets (valeurs statiques)
      let budgetCa = 0
      let budgetCouv = 0
      for (const lieu of lieux) {
        for (const svc of services) {
          const cell = moisBudgets[`${d.isoJds}_${lieu.id}_${svc.code}`]
          budgetCa += cellBudgetTotal(cell)
          budgetCouv += Number(cell?.couverts_cible || 0)
        }
      }
      // E: Couv réel (référence pavé COUVERT JOURNEE = row 20 col 4)
      row.getCell(5).value = { formula: `${sheetRef}!D20`, result: 0 }
      // F: CA réel (référence pavé CA JOURNEE = row 11 col 4)
      row.getCell(6).value = { formula: `${sheetRef}!D11`, result: 0 }
      // G: Couv budget
      row.getCell(7).value = budgetCouv
      // H: CA budget
      row.getCell(8).value = budgetCa
      // I: Δ couv
      row.getCell(9).value = { formula: `E${rowIdx}-G${rowIdx}`, result: 0 }
      // J: Δ CA
      row.getCell(10).value = { formula: `F${rowIdx}-H${rowIdx}`, result: 0 }
      // K: Cumul budget = SUMIF(D$2:D{row}, "", H$2:H{row})
      // → ignore les lignes où Exception (D) est non vide
      row.getCell(11).value = { formula: `SUMIF(D$2:D${rowIdx},"",H$2:H${rowIdx})`, result: 0 }
      // L: Cumul réel
      row.getCell(12).value = { formula: `SUMIF(D$2:D${rowIdx},"",F$2:F${rowIdx})`, result: 0 }
      // M: Δ Cumul
      row.getCell(13).value = { formula: `L${rowIdx}-K${rowIdx}`, result: 0 }
      // N: Δ %
      row.getCell(14).value = { formula: `IFERROR(M${rowIdx}/K${rowIdx},0)`, result: 0 }
      row.getCell(14).numFmt = '0.0%'
    } else {
      // Lignes fermées : grisées, pas de formules sauf cumul qui se base sur
      // les jours ouverts qui précèdent
      for (let c = 1; c <= 14; c++) {
        if (c === 4) continue // garde la couleur Exception
        const cell = row.getCell(c)
        cell.fill = fillColor(COLOR.greySoft)
        cell.font = { ...(cell.font || {}), color: { argb: COLOR.greyDark } }
      }
    }

    // Formats numériques
    row.getCell(6).numFmt = '#,##0 "€"'
    row.getCell(8).numFmt = '#,##0 "€"'
    row.getCell(10).numFmt = '#,##0 "€"'
    row.getCell(11).numFmt = '#,##0 "€"'
    row.getCell(12).numFmt = '#,##0 "€"'
    row.getCell(13).numFmt = '#,##0 "€"'

    // Borders
    for (let c = 1; c <= 14; c++) row.getCell(c).border = thinBorder()
  })

  // Ligne Total mensuel
  const totalRow = days.length + 2
  const tr = ws.getRow(totalRow)
  tr.getCell(1).value = `Total ${MOIS_LABEL[mois]} ${annee}`
  tr.getCell(1).font = { bold: true }
  tr.getCell(1).fill = fillColor(COLOR.yellow)
  // Cumul budget / réel : reprend la dernière valeur (qui agrège déjà tout le mois)
  tr.getCell(7).value = { formula: `SUMIF(D2:D${totalRow - 1},"",G2:G${totalRow - 1})`, result: 0 }
  tr.getCell(8).value = { formula: `SUMIF(D2:D${totalRow - 1},"",H2:H${totalRow - 1})`, result: 0 }
  tr.getCell(11).value = { formula: `K${totalRow - 1}`, result: 0 }
  tr.getCell(12).value = { formula: `L${totalRow - 1}`, result: 0 }
  tr.getCell(13).value = { formula: `L${totalRow}-K${totalRow}`, result: 0 }
  tr.getCell(14).value = { formula: `IFERROR(M${totalRow}/K${totalRow},0)`, result: 0 }
  tr.getCell(14).numFmt = '0.0%'
  for (let c = 1; c <= 14; c++) {
    tr.getCell(c).border = thinBorder()
    tr.getCell(c).font = { ...(tr.getCell(c).font || {}), bold: true }
    if (!tr.getCell(c).fill) tr.getCell(c).fill = fillColor(COLOR.yellowSoft)
    tr.getCell(c).numFmt = tr.getCell(c).numFmt || (c >= 6 && c !== 9 ? '#,##0 "€"' : '#,##0')
  }
}

// ─── Helpers exposés ────────────────────────────────────────────────────────

export function formatDateFr(date) {
  const d = String(date.getDate()).padStart(2, '0')
  const m = String(date.getMonth() + 1).padStart(2, '0')
  return `${d}/${m}/${date.getFullYear()}`
}

export function formatDateIso(date) {
  const d = String(date.getDate()).padStart(2, '0')
  const m = String(date.getMonth() + 1).padStart(2, '0')
  return `${date.getFullYear()}-${m}-${d}`
}

// ─── Builder principal ─────────────────────────────────────────────────────

// opts:
//   annee, mois (1..12)
//   lieux : [{ id, nom, label, ordre, actif }] — label utilisé dans le header
//   moisBudgets : { `${jds}_${lieuId}_${svcCode}`: cell } — cellules budget du mois
//   joursOverride : { [mois]: { [jds]: { [svcCode]: number } } } (optionnel, pour cohérence)
//   clientNom : string (titre du workbook)
export async function buildBudgetsEquipesWorkbook(opts) {
  const { annee, mois, lieux: rawLieux, moisBudgets, joursFermes = {}, clientNom = 'Skalcook' } = opts
  // Filtre lieux actifs + label par défaut = nom uppercase
  const lieux = (rawLieux || []).filter((l) => l.actif !== false).map((l) => ({
    ...l,
    label: l.label || l.nom || 'Lieu',
  }))
  const services = [
    { code: 'lunch', label: 'Déjeuner' },
    { code: 'dinner', label: 'Dîner' },
  ]

  const wb = new ExcelJS.Workbook()
  wb.creator = clientNom
  wb.title = `Suivi CA équipes — ${MOIS_LABEL[mois]} ${annee}`
  wb.created = new Date()

  // Itère sur chaque jour du mois
  const lastDay = new Date(annee, mois, 0).getDate()
  const days = []
  for (let d = 1; d <= lastDay; d++) {
    const date = new Date(annee, mois - 1, d)
    const isoJds = jsWeekdayToIso(date.getDay())
    const isOpen = isDayOpen(isoJds, lieux, services, moisBudgets)
    const sheetName = `${String(d).padStart(2, '0')}-${String(mois).padStart(2, '0')}`
    days.push({ date, isoJds, isOpen, sheetName })
  }

  // Crée d'abord la sheet Synthèse pour que les onglets jour puissent y référer.
  buildSynthesisSheet(wb, { annee, mois, days, lieux, services, moisBudgets, joursFermes })

  // Puis crée chaque onglet jour
  days.forEach((d, idx) => {
    buildDaySheet(wb, {
      date: d.date,
      isoJds: d.isoJds,
      isOpen: d.isOpen,
      lieux,
      services,
      moisBudgets,
      synthRowIndex: idx + 2, // row in Synthèse (header en row 1)
    })
  })

  return wb
}

// Construit le nom de fichier suggéré : "suivi-ca_2026-05.xlsx"
export function buildEquipesFilename(annee, mois) {
  return `suivi-ca_${annee}-${String(mois).padStart(2, '0')}.xlsx`
}

// Helper non utilisé directement par le builder mais ré-exporté pour les tests
export {
  joursDansMois,
  nbJoursOverride,
  isDayOpen,
  cellBudgetTotal,
  jsWeekdayToIso,
  JOURS_FR_LONG,
  JOURS_FR_SHORT,
  MOIS_LABEL,
}
