/**
 * Service — Écarts de consommation (théorique vs réel).
 *
 * Rapproche, par ingrédient et sur une période :
 *   - la consommation THÉORIQUE  = Σ (quantité vendue × quantité fiche ÷ nb portions)
 *   - la consommation RÉELLE      = achats ± variation de stock
 *   - l'ÉCART                     = réelle − théorique
 *
 * Un écart positif = on a consommé plus que ce que les ventes justifient
 * (dépassement / perte / vol) ; négatif = économie ou fiche trop chargée.
 *
 * Périmètre : cuisine (les ventes `ventes_journalieres` référencent `fiches`,
 * table cuisine ; il n'existe pas d'équivalent bar).
 *
 * Stock (mode auto) : si deux inventaires cuisine « valide » encadrent la
 * période, on applique la variation de stock par ingrédient ; sinon on tombe
 * sur « achats seuls » (valable surtout sur une période assez longue).
 *
 * Unités : la conso théorique est dans l'unité de la fiche, les achats en
 * unité d'usage de l'ingrédient (quantité × conditionnement). On ne calcule
 * un écart chiffré que si les deux unités sont convertibles (même dimension) ;
 * sinon on renvoie les deux côtés bruts avec `reconciliable: false`, plutôt
 * que d'inventer un écart faux.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

// ── Normalisation d'unités ───────────────────────────────────────────────────
// Renvoie une dimension (masse / volume / unité, ou « brute » pour le reste) et
// un facteur vers l'unité de base de la dimension (g, ml, ou 1 pièce).

type UnitInfo = { dim: string; factor: number; base: string }

function canonUnit(u: string | null | undefined): UnitInfo {
  const s = (u ?? '').trim().toLowerCase()
  switch (s) {
    case 'kg': case 'kgs': case 'kilo': case 'kilos':      return { dim: 'masse',  factor: 1000, base: 'kg' }
    case 'g': case 'gr': case 'gramme': case 'grammes':    return { dim: 'masse',  factor: 1,    base: 'kg' }
    case 'l': case 'litre': case 'litres':                 return { dim: 'volume', factor: 1000, base: 'L' }
    case 'cl':                                             return { dim: 'volume', factor: 10,   base: 'L' }
    case 'ml':                                             return { dim: 'volume', factor: 1,    base: 'L' }
    case 'piece': case 'pièce': case 'pieces': case 'pièces':
    case 'pce': case 'pc': case 'u': case 'unite': case 'unité': case 'ea':
      return { dim: 'unite', factor: 1, base: 'pièce' }
    default:
      // Unité « à part » (botte, bouteille, carton, portions…) : seule une
      // unité strictement identique lui est comparable.
      return { dim: `raw:${s || '?'}`, factor: 1, base: s || '—' }
  }
}

// Quantité exprimée dans l'unité de base de sa dimension (g, ml ou pièce).
function toBase(qty: number, u: string | null | undefined): number {
  return qty * canonUnit(u).factor
}

// Convertit une quantité en base vers une unité d'affichage cible.
function fromBase(qtyBase: number, targetUnite: string | null | undefined): number {
  const f = canonUnit(targetUnite).factor || 1
  return qtyBase / f
}

const round = (n: number, d = 3) => {
  const p = 10 ** d
  return Math.round(n * p) / p
}

// ── Type de sortie ───────────────────────────────────────────────────────────

export interface EcartRow {
  ingredient_id: string
  nom: string
  est_sous_fiche: boolean
  // Côté théorique
  theo_qty: number | null
  theo_unite: string
  theo_unites_mixtes: boolean
  // Côté achats
  achat_qty: number | null
  achat_unite: string
  montant_achat_ht: number
  // Stock (si mode stock actif)
  stock_delta: number | null
  // Rapprochement
  reconciliable: boolean
  note: string | null
  unite: string          // unité commune retenue pour l'écart
  conso_reelle: number | null
  ecart_qty: number | null
  ecart_pct: number | null
  ecart_valeur_ht: number | null   // € (écart × prix_kg)
  sens: 'depassement' | 'economie' | 'ok' | null
}

export interface EcartsResult {
  rows: EcartRow[]
  meta: {
    date_debut: string
    date_fin: string
    stock_utilise: boolean
    inventaire_debut: { id: string; date: string } | null
    inventaire_fin: { id: string; date: string } | null
    nb_ventes: number
  }
}

// ── Fonction principale ──────────────────────────────────────────────────────

export async function getEcartsConsommation(
  db: SupabaseClient,
  clientId: string,
  dateDebut: string,
  dateFin: string,
): Promise<EcartsResult> {
  const emptyMeta = {
    date_debut: dateDebut, date_fin: dateFin, stock_utilise: false,
    inventaire_debut: null, inventaire_fin: null, nb_ventes: 0,
  }

  // 1) Ventes de la période.
  const { data: ventes } = await db
    .from('ventes_journalieres')
    .select('fiche_id, quantite_vendue')
    .eq('client_id', clientId)
    .gte('jour', dateDebut)
    .lte('jour', dateFin)

  const ficheIds = [...new Set((ventes ?? []).map((v) => v.fiche_id).filter(Boolean) as string[])]

  // 2) Fiches (nb portions) + ingrédients des fiches.
  const nbPortionsByFiche: Record<string, number> = {}
  const ficheIngsByFiche: Record<string, { ingredient_id: string; quantite: number; unite: string | null }[]> = {}
  if (ficheIds.length) {
    const [fichesRes, fiRes] = await Promise.all([
      db.from('fiches').select('id, nb_portions').in('id', ficheIds).eq('client_id', clientId),
      db.from('fiche_ingredients').select('fiche_id, ingredient_id, quantite, unite').in('fiche_id', ficheIds).eq('client_id', clientId),
    ])
    for (const f of (fichesRes.data ?? [])) nbPortionsByFiche[f.id] = Number(f.nb_portions) || 0
    for (const fi of (fiRes.data ?? [])) {
      if (!fi.ingredient_id) continue
      ;(ficheIngsByFiche[fi.fiche_id] ??= []).push({
        ingredient_id: fi.ingredient_id,
        quantite: Number(fi.quantite) || 0,
        unite: fi.unite,
      })
    }
  }

  // 3) Consommation théorique par ingrédient (mêmes règles que computeConsoTheorique).
  type Theo = { baseByDim: Record<string, number>; unites: Set<string> }
  const theoByIng: Record<string, Theo> = {}
  for (const v of ventes ?? []) {
    const nbPortions = nbPortionsByFiche[v.fiche_id]
    if (!nbPortions || nbPortions <= 0) continue
    const qv = Number(v.quantite_vendue) || 0
    for (const fi of (ficheIngsByFiche[v.fiche_id] ?? [])) {
      const conso = (qv * fi.quantite) / nbPortions
      const info = canonUnit(fi.unite)
      const t = (theoByIng[fi.ingredient_id] ??= { baseByDim: {}, unites: new Set() })
      t.baseByDim[info.dim] = (t.baseByDim[info.dim] || 0) + conso * info.factor
      if (fi.unite) t.unites.add(canonUnit(fi.unite).base)
    }
  }

  // 4) Achats de la période (cuisine).
  const { data: factures } = await db
    .from('achats_factures')
    .select('id')
    .eq('client_id', clientId)
    .eq('section', 'cuisine')
    .is('deleted_at', null)
    .gte('date_facture', dateDebut)
    .lte('date_facture', dateFin)
  const factureIds = (factures ?? []).map((f) => f.id)

  type Achat = { baseByDim: Record<string, number>; unites: Set<string>; montant: number }
  const achatByIng: Record<string, Achat> = {}
  if (factureIds.length) {
    // Pagination large : une ligne = un ingrédient acheté.
    const { data: lignes } = await db
      .from('achats_lignes')
      .select('ingredient_id, quantite, unite, montant_ht')
      .in('facture_id', factureIds)
      .eq('client_id', clientId)
      .not('ingredient_id', 'is', null)
    for (const l of (lignes ?? [])) {
      const info = canonUnit(l.unite)
      const a = (achatByIng[l.ingredient_id as string] ??= { baseByDim: {}, unites: new Set(), montant: 0 })
      a.baseByDim[info.dim] = (a.baseByDim[info.dim] || 0) + (Number(l.quantite) || 0) * info.factor
      if (l.unite) a.unites.add(canonUnit(l.unite).base)
      a.montant += Number(l.montant_ht) || 0
    }
  }

  // 5) Métadonnées ingrédients (nom, unité d'usage, prix_kg, conditionnement, sous-fiche).
  const ingredientIds = [...new Set([...Object.keys(theoByIng), ...Object.keys(achatByIng)])]
  if (!ingredientIds.length) return { rows: [], meta: { ...emptyMeta, nb_ventes: ventes?.length ?? 0 } }

  const ingById: Record<string, { nom: string; unite: string | null; prix_kg: number | null; conditionnement: number | null; est_sous_fiche: boolean }> = {}
  {
    const { data: ings } = await db
      .from('ingredients')
      .select('id, nom, unite, prix_kg, conditionnement, est_sous_fiche')
      .in('id', ingredientIds)
    for (const i of (ings ?? [])) {
      ingById[i.id] = {
        nom: i.nom, unite: i.unite, prix_kg: i.prix_kg,
        conditionnement: i.conditionnement, est_sous_fiche: Boolean(i.est_sous_fiche),
      }
    }
  }

  // 6) Stock (mode auto) : deux inventaires cuisine « valide » encadrant la période.
  const { data: invs } = await db
    .from('inventaires')
    .select('id, date_inventaire')
    .eq('client_id', clientId)
    .eq('section', 'cuisine')
    .eq('statut', 'valide')
    .order('date_inventaire', { ascending: true })

  const invDebut = [...(invs ?? [])].filter((i) => i.date_inventaire <= dateDebut).pop() || null
  const invFin = [...(invs ?? [])]
    .filter((i) => i.date_inventaire <= dateFin && (!invDebut || i.id !== invDebut.id) && (!invDebut || i.date_inventaire > invDebut.date_inventaire))
    .pop() || null
  const stockUtilise = Boolean(invDebut && invFin)

  // Stock par ingrédient (en base de dimension) pour les deux inventaires.
  const stockByIng: Record<string, { debutBase: number | null; finBase: number | null; dim: string | null }> = {}
  if (stockUtilise) {
    const { data: lignesInv } = await db
      .from('inventaire_lignes')
      .select('inventaire_id, ingredient_id, quantite_reelle, unite')
      .in('inventaire_id', [invDebut!.id, invFin!.id])
      .eq('client_id', clientId)
    for (const li of (lignesInv ?? [])) {
      if (!li.ingredient_id) continue
      const info = canonUnit(li.unite)
      const s = (stockByIng[li.ingredient_id] ??= { debutBase: null, finBase: null, dim: info.dim })
      const val = (Number(li.quantite_reelle) || 0) * info.factor
      if (li.inventaire_id === invDebut!.id) s.debutBase = (s.debutBase || 0) + val
      else s.finBase = (s.finBase || 0) + val
    }
  }

  // 7) Construction des lignes de rapprochement.
  const rows: EcartRow[] = ingredientIds.map((id) => {
    const ing = ingById[id]
    const nom = ing?.nom ?? '—'
    const estSousFiche = ing?.est_sous_fiche ?? false
    const theo = theoByIng[id]
    const achat = achatByIng[id]

    // Dimension dominante de chaque côté (celle qui porte le plus de quantité).
    const domDim = (byDim: Record<string, number> | undefined) => {
      if (!byDim) return null
      let best: string | null = null
      let bestAbs = -1
      for (const [d, val] of Object.entries(byDim)) {
        if (Math.abs(val) > bestAbs) { bestAbs = Math.abs(val); best = d }
      }
      return best
    }
    const theoDim = domDim(theo?.baseByDim)
    const achatDim = domDim(achat?.baseByDim)
    const theoMixte = theo ? Object.keys(theo.baseByDim).length > 1 : false

    // Unité d'affichage : l'unité d'usage de l'ingrédient si compatible, sinon
    // l'unité du côté disponible.
    const uniteUsage = ing?.unite ?? null
    const uniteAffichage = uniteUsage || [...(theo?.unites ?? [])][0] || [...(achat?.unites ?? [])][0] || '—'
    const theoUnite = [...(theo?.unites ?? [])].join('/') || '—'
    const achatUnite = [...(achat?.unites ?? [])].join('/') || '—'

    // Quantités affichées (dans leur propre unité dominante).
    const theoQty = theo && theoDim ? round(fromBase(theo.baseByDim[theoDim], displayForDim(theoDim, theo.unites))) : null
    const achatQty = achat && achatDim ? round(fromBase(achat.baseByDim[achatDim], displayForDim(achatDim, achat.unites))) : null
    const montant = round(achat?.montant ?? 0, 2)

    // Variation de stock (base), si dispo et de dimension compatible.
    let stockDeltaBase: number | null = null
    const st = stockByIng[id]
    if (stockUtilise && st && st.debutBase != null && st.finBase != null) {
      stockDeltaBase = st.finBase - st.debutBase
    }

    // Peut-on chiffrer un écart ? Il faut théorique ET achat, une même
    // dimension, pas de mélange d'unités, et pas une sous-fiche.
    let reconciliable = true
    let note: string | null = null
    if (estSousFiche) { reconciliable = false; note = 'Sous-fiche : non achetée, non rapprochée.' }
    else if (!theo) { reconciliable = false; note = 'Aucune vente sur la période (pas de théorique).' }
    else if (!achat) { reconciliable = false; note = 'Aucun achat rattaché sur la période.' }
    else if (theoMixte) { reconciliable = false; note = 'Unités de fiche hétérogènes.' }
    else if (theoDim !== achatDim) { reconciliable = false; note = `Unités non convertibles (fiche ${theoUnite} vs achat ${achatUnite}).` }

    let consoReelle: number | null = null
    let ecartQty: number | null = null
    let ecartPct: number | null = null
    let ecartValeur: number | null = null
    let sens: EcartRow['sens'] = null

    if (reconciliable && theoDim) {
      // Tout en base de dimension.
      const theoBase = theo!.baseByDim[theoDim]
      const achatBase = achat!.baseByDim[achatDim!]
      // Stock : n'appliquer la variation que si dimension compatible.
      const deltaBase = stockDeltaBase != null && st?.dim === theoDim ? stockDeltaBase : 0
      const reelleBase = achatBase - deltaBase
      const ecartBase = reelleBase - theoBase

      const dispU = displayForDim(theoDim, theo!.unites)
      consoReelle = round(fromBase(reelleBase, dispU))
      ecartQty = round(fromBase(ecartBase, dispU))
      ecartPct = theoBase !== 0 ? Math.round((ecartBase / theoBase) * 1000) / 10 : null
      // Valeur € : prix_kg est le prix par unité d'usage de l'ingrédient.
      if (ing?.prix_kg != null && uniteUsage) {
        const ecartUsage = fromBase(ecartBase, uniteUsage)
        ecartValeur = round(ecartUsage * Number(ing.prix_kg), 2)
      }
      const seuil = Math.max(Math.abs(theoBase) * 0.02, 1e-9)
      sens = ecartBase > seuil ? 'depassement' : ecartBase < -seuil ? 'economie' : 'ok'
    }

    return {
      ingredient_id: id,
      nom,
      est_sous_fiche: estSousFiche,
      theo_qty: theoQty,
      theo_unite: theoUnite,
      theo_unites_mixtes: theoMixte,
      achat_qty: achatQty,
      achat_unite: achatUnite,
      montant_achat_ht: montant,
      stock_delta: stockDeltaBase != null && st && st.dim === canonUnit(uniteAffichage).dim
        ? round(fromBase(stockDeltaBase, uniteAffichage)) : null,
      reconciliable,
      note,
      unite: uniteAffichage,
      conso_reelle: consoReelle,
      ecart_qty: ecartQty,
      ecart_pct: ecartPct,
      ecart_valeur_ht: ecartValeur,
      sens,
    }
  })

  // Tri : écarts chiffrés en valeur € décroissante (les plus coûteux d'abord),
  // puis les non rapprochés.
  rows.sort((a, b) => {
    const av = a.ecart_valeur_ht == null ? -Infinity : Math.abs(a.ecart_valeur_ht)
    const bv = b.ecart_valeur_ht == null ? -Infinity : Math.abs(b.ecart_valeur_ht)
    if (av !== bv) return bv - av
    return a.nom.localeCompare(b.nom, 'fr')
  })

  return {
    rows,
    meta: {
      date_debut: dateDebut,
      date_fin: dateFin,
      stock_utilise: stockUtilise,
      inventaire_debut: invDebut ? { id: invDebut.id, date: invDebut.date_inventaire } : null,
      inventaire_fin: invFin ? { id: invFin.id, date: invFin.date_inventaire } : null,
      nb_ventes: ventes?.length ?? 0,
    },
  }
}

// Unité d'affichage préférée pour une dimension : réutilise l'unité rencontrée
// si elle appartient à la dimension, sinon l'unité de base canonique.
function displayForDim(dim: string, unites: Set<string>): string {
  for (const u of unites) {
    if (canonUnit(u).dim === dim) return u
  }
  if (dim === 'masse') return 'kg'
  if (dim === 'volume') return 'L'
  if (dim === 'unite') return 'pièce'
  return dim.startsWith('raw:') ? dim.slice(4) : '—'
}
