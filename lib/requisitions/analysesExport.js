// Export Excel des analyses de réquisitions (exceljs, chargé à la demande).
// `t` : fonction de traduction (libellés dans la langue de l'utilisateur).

const EURO_FMT = '#,##0.00 €'
const QTE_FMT = '#,##0.###'
const PCT_FMT = '0.0" %"'

export async function buildAnalysesWorkbook({ t, analyses, nomService }) {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Skalcook'
  wb.created = new Date()

  const feuille = (nom, colonnes, lignes) => {
    const ws = wb.addWorksheet(nom.slice(0, 31))
    ws.columns = colonnes.map((c) => ({ header: c.titre, key: c.cle, width: c.largeur || 16, style: c.fmt ? { numFmt: c.fmt } : {} }))
    ws.getRow(1).font = { bold: true }
    ws.views = [{ state: 'frozen', ySplit: 1 }]
    for (const l of lignes) ws.addRow(l)
    return ws
  }

  const { periode, totaux } = analyses
  const resume = wb.addWorksheet(t('requisitions.analyses.export.summary').slice(0, 31))
  resume.columns = [{ width: 34 }, { width: 20 }]
  resume.addRow([t('requisitions.analyses.title')]).font = { bold: true, size: 14 }
  resume.addRow([t('requisitions.analyses.export.period'), `${periode.debut} → ${periode.fin}`])
  resume.addRow([t('requisitions.analyses.totalValue'), totaux.valeur]).getCell(2).numFmt = EURO_FMT
  resume.addRow([t('requisitions.analyses.deliveredSlips'), totaux.bons])
  resume.addRow([t('requisitions.analyses.lines'), totaux.lignes])

  feuille(t('requisitions.analyses.byService'), [
    { titre: t('requisitions.analyses.service'), cle: 'nom', largeur: 28 },
    { titre: t('requisitions.analyses.value'), cle: 'valeur', fmt: EURO_FMT },
    { titre: t('requisitions.analyses.share'), cle: 'part', fmt: PCT_FMT },
    { titre: t('requisitions.analyses.deliveredSlips'), cle: 'bons' },
    { titre: t('requisitions.analyses.lines'), cle: 'lignes' },
  ], analyses.par_service)

  feuille(t('requisitions.analyses.byPreparer'), [
    { titre: t('requisitions.analyses.service'), cle: 'nom', largeur: 28 },
    { titre: t('requisitions.analyses.value'), cle: 'valeur', fmt: EURO_FMT },
    { titre: t('requisitions.analyses.share'), cle: 'part', fmt: PCT_FMT },
    { titre: t('requisitions.analyses.deliveredSlips'), cle: 'bons' },
  ], analyses.par_preparateur)

  // Produits × services receveurs (quantités).
  const receveurs = analyses.par_service.map((s) => s.service_id)
  feuille(t('requisitions.analyses.byProduct'), [
    { titre: t('requisitions.analyses.product'), cle: 'nom', largeur: 32 },
    { titre: t('requisitions.analyses.unit'), cle: 'unite', largeur: 10 },
    { titre: t('requisitions.analyses.quantity'), cle: 'quantite', fmt: QTE_FMT },
    { titre: t('requisitions.analyses.value'), cle: 'valeur', fmt: EURO_FMT },
    { titre: t('requisitions.analyses.share'), cle: 'part', fmt: PCT_FMT },
    ...receveurs.map((id) => ({ titre: nomService(id), cle: `s_${id}`, fmt: QTE_FMT })),
  ], analyses.par_produit.map((p) => ({
    ...p,
    ...Object.fromEntries(receveurs.map((id) => [`s_${id}`, p.par_service[id] ?? null])),
  })))

  return wb
}

export async function telechargerXlsx(workbook, filename) {
  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
