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

export const STATUT_BADGES = {
  bl:      { label: 'BL',      bg: '#FEF3C7', fg: '#92400E' },
  facture: { label: 'Facture', bg: '#D1FAE5', fg: '#065F46' },
  avoir:   { label: 'Avoir',   bg: '#FEE2E2', fg: '#991B1B' },
}

export function badgeStyleFor(statut) {
  const meta = STATUT_BADGES[statut] || STATUT_BADGES.facture
  return {
    fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4,
    background: meta.bg, color: meta.fg,
  }
}

export function statutLabel(statut) {
  return (STATUT_BADGES[statut] || STATUT_BADGES.facture).label
}

// Style du badge "Bar" affiché à côté du statut pour les factures bar.
// La cuisine n'a pas de badge — c'est la valeur par défaut, on évite le bruit visuel.
export const SECTION_BAR_BADGE_STYLE = {
  fontSize: 10,
  fontWeight: 700,
  padding: '2px 7px',
  borderRadius: 4,
  background: '#F5F3FF',
  color: '#5B21B6',
  letterSpacing: 0.3,
  textTransform: 'uppercase',
}

/**
 * Enrichit une ligne de facture avec la réconciliation ingrédient.
 * 2 niveaux : mapping appris → nom normalisé exact.
 * Pas d'inclusion partielle : une désignation différente (ex. "JAMBON 50%
 * IBERIQUE AVEC OS" vs "JAMBON 50% IBERIQUE") doit rester un article distinct,
 * pas être fusionnée avec un ingrédient au nom plus court. Les abréviations
 * fournisseur sont gérées par le mapping appris (niveau 1).
 */
export function enrichLigne(ligne, fournisseurMapping, ingredientsById, ingredientsByNorm, tvaByIngredient = {}) {
  const norm = normDesig(ligne.designation)

  // Niveau 1 : mapping appris
  let ing = null
  const mapping = fournisseurMapping[norm]
  if (mapping?.ingredient_id) ing = ingredientsById[mapping.ingredient_id] ?? null

  // Niveau 2 : nom exact normalisé
  if (!ing) ing = ingredientsByNorm[norm] ?? null

  const ingId = ing?.id ?? null
  const prixActuel = ing ? Number(ing.prix_kg) : null

  // Distingue "prix auto-rempli" (depuis la mercuriale) vs "prix saisi par l'utilisateur".
  // - true : le prix vient d'un pré-remplissage automatique, on peut le réécrire/effacer
  //   au prochain enrich (ex : si la désignation change et qu'on perd la reconnaissance)
  // - false : l'utilisateur a tapé son propre prix, on ne le touche plus jamais
  //   (sauf si le user efface le champ explicitement)
  // - undefined : nouvelle ligne, on traite comme "auto" par défaut
  const prixAuto = ligne.prix_auto !== false

  let prixLigne
  let nouveauPrixAuto
  if (ing && prixAuto) {
    // Ingrédient reconnu + l'utilisateur n'a pas saisi son propre prix → prix de réf
    // (vide si l'ingrédient n'a pas de prix historique, pour ne pas afficher "0").
    prixLigne = prixActuel != null && Number.isFinite(prixActuel) ? prixActuel : ''
    nouveauPrixAuto = true
  } else if (!ing && prixAuto) {
    // Plus reconnu : reset à 0 pour les lignes OCR (qui avaient un prix
    // extrait), mais préserve la chaîne vide pour une nouvelle ligne manuelle.
    prixLigne = ligne.prix_unitaire_ht === '' || ligne.prix_unitaire_ht == null ? '' : 0
    nouveauPrixAuto = true
  } else {
    // L'utilisateur a saisi son propre prix → on respecte la chaîne brute.
    // Convertir en Number ici casserait la saisie d'un décimal en cours
    // (ex : "12." deviendrait 12 et le point serait perdu à chaque frappe).
    prixLigne = ligne.prix_unitaire_ht ?? ''
    nouveauPrixAuto = false
  }

  const prixLigneNum = Number(prixLigne) || 0
  const delta = prixActuel && prixLigneNum && !nouveauPrixAuto
    ? ((prixLigneNum - prixActuel) / prixActuel) * 100
    : null

  // ── Pré-remplissage TVA ────────────────────────────────────────────────
  // Même logique que pour le prix : si l'utilisateur n'a pas saisi sa propre TVA,
  // on propose le dernier taux_tva utilisé pour cet ingrédient (historique).
  const tvaAuto = ligne.tva_auto !== false
  const tvaHistorique = ingId && tvaByIngredient[ingId] != null ? Number(tvaByIngredient[ingId]) : null
  let tauxTvaLigne
  let nouveauTvaAuto
  if (ing && tvaAuto && tvaHistorique != null) {
    tauxTvaLigne = tvaHistorique
    nouveauTvaAuto = true
  } else if (!ing && tvaAuto) {
    tauxTvaLigne = null
    nouveauTvaAuto = true
  } else {
    tauxTvaLigne = ligne.taux_tva ?? null
    nouveauTvaAuto = false
  }

  return {
    ...ligne,
    _id: ligne._id || makeLigneId(),
    prix_unitaire_ht: prixLigne,
    prix_auto: nouveauPrixAuto,
    taux_tva: tauxTvaLigne,
    tva_auto: nouveauTvaAuto,
    ingredient_id: ingId,
    ingredient_nom: ing?.nom ?? null,
    prix_actuel: prixActuel,
    deltaPrix: delta,
    reconnu: !!ingId,
    // MAJ prix : seulement si l'utilisateur a saisi un prix réel (pas auto-rempli).
    updatePrice: !!ingId && !nouveauPrixAuto,
  }
}
