// Export Excel de la vue groupe (/groupe).
//
// Un onglet par bloc de la page : Période, Synthèse (un établissement par
// ligne + total), Prix comparés, Fournisseurs. Chiffres bruts arrondis au
// centime pour être retravaillés dans Excel.
//
// Comme lib/analysesExport.js, ce module ne fait QUE construire le workbook :
// l'écriture du fichier (XLSX.writeFile) est faite par la page, pour rester
// testable sans mocker l'API File.

import * as XLSX from 'xlsx'

const r2 = (n) => (n == null || !Number.isFinite(Number(n)) ? null : Math.round(Number(n) * 100) / 100)
const r1 = (n) => (n == null || !Number.isFinite(Number(n)) ? null : Math.round(Number(n) * 10) / 10)

const STATUTS = { vert: 'Vert', orange: 'Orange', rouge: 'Rouge' }

export function buildPeriodeRows({ groupe, debut, fin, nbEtablissements, generatedAt = new Date() }) {
  return [
    { Champ: 'Groupe', Valeur: groupe || '—' },
    { Champ: 'Du', Valeur: debut },
    { Champ: 'Au', Valeur: fin },
    { Champ: 'Établissements', Valeur: nbEtablissements },
    { Champ: 'Généré le', Valeur: generatedAt.toLocaleString('fr-FR') },
    { Champ: 'Méthode', Valeur: 'Ratio = achats HT de la période ÷ CA HT de la période, sans variation de stock.' },
  ]
}

function ligneSynthese(nom, e) {
  return {
    'Établissement': nom,
    'CA HT (€)': r2(e.caHt),
    'CA food HT (€)': r2(e.caFoodHt),
    'CA boissons HT (€)': r2(e.caBoissonsHt),
    'Couverts': e.couverts ?? null,
    'Ticket moyen TTC (€)': r2(e.ticketMoyenTtc),
    'Achats cuisine HT (€)': r2(e.achatsCuisineHt),
    'Ratio cuisine (%)': r1(e.ratioCuisine),
    'Statut cuisine': STATUTS[e.statutCuisine] ?? '',
    'Achats bar HT (€)': r2(e.achatsBarHt),
    'Ratio boissons (%)': r1(e.ratioBoissons),
    'Statut boissons': STATUTS[e.statutBoissons] ?? '',
    'Stock cuisine HT (€)': r2(e.stockCuisineHt),
    'Date du stock': e.stockCuisineDate ?? '',
    'Factures': e.nbFactures ?? null,
  }
}

export function buildSyntheseRows({ etablissements = [], totaux = null }) {
  const rows = etablissements.map((e) => ligneSynthese(e.nom, e))
  if (totaux && etablissements.length > 1) rows.push(ligneSynthese('Total groupe', totaux))
  return rows
}

export function buildPrixRows({ produits = [], nomsEtablissements = [] }) {
  return produits.map((p) => {
    const moinsCher = p.etablissements[0]
    const plusCher = p.etablissements[p.etablissements.length - 1]
    const row = {
      'Produit': p.nom,
      'Unité': p.unite || '',
      'Meilleur prix (€)': r2(p.prixMin),
      'Établissement le moins cher': moinsCher?.nom ?? '',
      'Fournisseur le moins cher': moinsCher?.fournisseurPrincipal ?? '',
      'Prix le plus haut (€)': r2(p.prixMax),
      'Établissement le plus cher': plusCher?.nom ?? '',
      'Écart (%)': r1(p.ecartPct),
      'Économie possible (€)': r2(p.economiePotentielle),
      'Meilleur prix du groupe (€)': r2(p.meilleurFournisseur?.prix),
      'Chez': p.meilleurFournisseur ? `${p.meilleurFournisseur.fournisseur} (${p.meilleurFournisseur.etablissement})` : '',
      'À vérifier': p.aVerifier ? 'Oui' : '',
    }
    // Une colonne prix + une colonne fournisseur par établissement du groupe.
    for (const nom of nomsEtablissements) {
      const e = p.etablissements.find((x) => x.nom === nom)
      row[`${nom} — prix (€)`] = e ? r2(e.prixMoyen) : null
      row[`${nom} — fournisseur`] = e?.fournisseurPrincipal ?? ''
    }
    return row
  })
}

export function buildFournisseursRows({ fournisseurs = [], nomsEtablissements = [] }) {
  return fournisseurs.map((f) => {
    const row = {
      'Fournisseur': f.nom,
      'Commun à plusieurs établissements': f.nbEtablissements > 1 ? 'Oui' : '',
      'Total HT (€)': r2(f.montantTotal),
    }
    for (const nom of nomsEtablissements) {
      const e = f.etablissements.find((x) => x.nom === nom)
      row[`${nom} (€)`] = e ? r2(e.montant) : null
    }
    row['Factures'] = f.etablissements.reduce((s, e) => s + (e.nbFactures || 0), 0)
    return row
  })
}

/**
 * @param {{ synthese: object, prix: object|null, blocs?: Record<string, boolean>, generatedAt?: Date }} opts
 *   synthese = réponse de /api/groupe/synthese, prix = réponse de /api/groupe/prix,
 *   blocs = blocs affichés à l'écran (lib/groupePreferences.js) ; absent = tout.
 * @returns XLSX workbook
 */
export function buildGroupeWorkbook({ synthese, prix, blocs = null, generatedAt = new Date() }) {
  const voir = (id) => !blocs || blocs[id] !== false
  const etablissements = synthese?.etablissements ?? []
  const nomsEtablissements = etablissements.map((e) => e.nom)
  const wb = XLSX.utils.book_new()

  const add = (rows, nom, largeurs) => {
    const sheet = XLSX.utils.json_to_sheet(rows.length ? rows : [{ Info: 'Aucune donnée sur la période' }])
    if (largeurs) sheet['!cols'] = largeurs.map((wch) => ({ wch }))
    XLSX.utils.book_append_sheet(wb, sheet, nom)
  }

  add(buildPeriodeRows({
    groupe: synthese?.groupe?.nom,
    debut: synthese?.periode?.debut,
    fin: synthese?.periode?.fin,
    nbEtablissements: etablissements.length,
    generatedAt,
  }), 'Période', [18, 70])
  if (voir('indicateurs') || voir('synthese')) {
    add(buildSyntheseRows({ etablissements, totaux: synthese?.totaux }), 'Synthèse', [30, 14, 14, 16, 10, 16, 18, 14, 12, 14, 14, 12, 16, 12, 10])
  }
  if (prix && voir('prix')) add(buildPrixRows({ produits: prix.produits, nomsEtablissements }), 'Prix comparés')
  if (prix && voir('fournisseurs')) add(buildFournisseursRows({ fournisseurs: prix.fournisseurs, nomsEtablissements }), 'Fournisseurs')
  return wb
}

/** Nom de fichier : vue-groupe-<groupe>-<debut>_<fin>.xlsx (sans accents ni espaces). */
export function nomFichierGroupe(groupe, debut, fin) {
  const slug = String(groupe || 'groupe')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return `vue-groupe-${slug || 'groupe'}-${debut}_${fin}.xlsx`
}
