// Export Excel (.xlsx) d'une liste de commande à partir de fiches techniques.
//
// Une seule feuille « Commande » : pour chaque fiche sélectionnée, une ligne
// titre (nom de la fiche) puis la liste de ses ingrédients, avec une colonne
// « Quantité à commander » laissée vide pour que l'utilisateur la remplisse à
// la main avant de passer commande.
//
// exceljs est chargé dynamiquement (await import) pour ne pas alourdir le
// bundle initial de la page.

// ── Styles exceljs ─────────────────────────────────────────────────────────

const BORDER_THIN = { style: 'thin', color: { argb: 'FFCCCCCC' } }
const BORDER_ALL = { top: BORDER_THIN, bottom: BORDER_THIN, left: BORDER_THIN, right: BORDER_THIN }

const FILL_TITLE  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } }
const FILL_HEADER = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } }

// ── Helpers ────────────────────────────────────────────────────────────────

// Dédoublonne les ingrédients d'une fiche (un même ingrédient peut apparaître
// dans plusieurs sections) et trie par nom pour une liste de commande lisible.
function dedupeIngredients(lignes) {
  const map = new Map()
  for (const l of lignes || []) {
    const ing = l.ingredients
    if (!ing || !ing.nom) continue
    if (!map.has(ing.nom)) {
      map.set(ing.nom, { nom: ing.nom, unite: ing.unite || l.unite || '' })
    }
  }
  return [...map.values()].sort((a, b) => a.nom.localeCompare(b.nom, 'fr'))
}

// ── Excel workbook (async) ─────────────────────────────────────────────────

// fiches : [{ nom, ingredients: [{ quantite, unite, ingredients: { nom, unite } }] }]
export async function buildCommandeWorkbook(fiches) {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Skalcook'
  wb.created = new Date()

  const ws = wb.addWorksheet('Commande')
  ws.columns = [{ width: 40 }, { width: 22 }, { width: 12 }]

  for (const fiche of fiches || []) {
    // Ligne titre : nom de la fiche (fusionné, gras, fond gris)
    const titleRow = ws.addRow([fiche.nom || 'Sans nom', '', ''])
    ws.mergeCells(`A${titleRow.number}:C${titleRow.number}`)
    const tCell = ws.getCell(`A${titleRow.number}`)
    tCell.font = { bold: true, size: 12 }
    tCell.fill = FILL_TITLE
    tCell.alignment = { horizontal: 'left', vertical: 'middle' }
    titleRow.height = 20
    titleRow.eachCell({ includeEmpty: true }, (c) => { c.border = BORDER_ALL })

    // Ligne en-tête de colonnes
    const headerRow = ws.addRow(['Ingrédient', 'Quantité à commander', 'Unité'])
    headerRow.font = { bold: true, size: 10 }
    headerRow.fill = FILL_HEADER
    headerRow.alignment = { horizontal: 'left', vertical: 'middle' }
    headerRow.eachCell((c) => { c.border = BORDER_ALL })

    // Lignes ingrédients (quantité laissée vide à remplir)
    const ingredients = dedupeIngredients(fiche.ingredients)
    if (ingredients.length === 0) {
      const emptyRow = ws.addRow(['Aucun ingrédient', '', ''])
      ws.getCell(`A${emptyRow.number}`).font = { italic: true, color: { argb: 'FF999999' } }
      emptyRow.eachCell({ includeEmpty: true }, (c) => { c.border = BORDER_ALL })
    } else {
      for (const ing of ingredients) {
        const row = ws.addRow([ing.nom, '', ing.unite])
        row.getCell(1).alignment = { horizontal: 'left' }
        row.getCell(3).alignment = { horizontal: 'center' }
        row.eachCell({ includeEmpty: true }, (c) => { c.border = BORDER_ALL })
      }
    }

    // Ligne vide de séparation entre deux fiches
    ws.addRow([])
  }

  return wb
}

export async function downloadXlsx(workbook, filename) {
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
