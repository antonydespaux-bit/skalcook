/**
 * Pure helper functions for achats import.
 * Extracted from controle-gestion/achats/import/page.js to reduce file size.
 */

/**
 * Normalise une désignation pour la réconciliation.
 */
export function normDesig(s) {
  if (!s) return ''
  return s
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function todayIso() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function yesterdayIso() {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function fmtPrix(n) {
  if (n == null || Number.isNaN(n)) return '—'
  return Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
}

export function fmtDelta(n) {
  if (n == null || Number.isNaN(n)) return null
  const sign = n >= 0 ? '+' : ''
  return `${sign}${Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`
}

export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result
      if (typeof result !== 'string') { reject(new Error('Lecture échouée')); return }
      resolve(result.split(',')[1] ?? result)
    }
    reader.onerror = () => reject(new Error('Erreur de lecture du fichier'))
    reader.readAsDataURL(file)
  })
}

export function makeLigneId() {
  return Math.random().toString(36).slice(2)
}

/**
 * Enrichit une ligne de facture avec la réconciliation ingrédient.
 * 3 niveaux : mapping exact → nom normalisé exact → inclusion partielle.
 */
export function enrichLigne(ligne, fournisseurMapping, ingredientsById, ingredientsByNorm) {
  const norm = normDesig(ligne.designation)

  // Niveau 1 : mapping appris
  let ing = null
  const mapping = fournisseurMapping[norm]
  if (mapping?.ingredient_id) ing = ingredientsById[mapping.ingredient_id] ?? null

  // Niveau 2 : nom exact normalisé
  if (!ing) ing = ingredientsByNorm[norm] ?? null

  // Niveau 3 : inclusion partielle (min 3 chars)
  if (!ing) {
    for (const [ingNorm, candidate] of Object.entries(ingredientsByNorm)) {
      if (ingNorm.length >= 3 && norm.includes(ingNorm)) {
        ing = candidate
        break
      }
    }
  }

  const ingId = ing?.id ?? null
  const prixActuel = ing ? Number(ing.prix_kg) : null
  const prixLigne = Number(ligne.prix_unitaire_ht) || 0
  const delta = prixActuel && prixLigne ? ((prixLigne - prixActuel) / prixActuel) * 100 : null

  return {
    ...ligne,
    _id: ligne._id || makeLigneId(),
    ingredient_id: ingId,
    ingredient_nom: ing?.nom ?? null,
    prix_actuel: prixActuel,
    deltaPrix: delta,
    reconnu: !!ingId,
    updatePrice: !!ingId,
  }
}
