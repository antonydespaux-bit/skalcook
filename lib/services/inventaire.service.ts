/**
 * Service layer for Inventaire (Inventory) domain.
 * Pure business logic — no HTTP concerns.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { convertirUnite } from '../constants'
import { ValidationError, ConflictError, NotFoundError } from '../errors'

// ── Types ──────────────────────────────────────────────────────────────────

interface IngredientRow {
  id: string
  nom: string
  unite: string
  prix_kg: number
}

interface InventaireIngredient {
  ingredient_id: string
  section: string
  nom: string
  unite: string
  prix_kg: number
  quantite_theorique: number
  est_critique?: boolean
}

// ── Stock Théorique Calculator ─────────────────────────────────────────────

export async function calculateStockTheorique(
  db: SupabaseClient,
  clientId: string,
  section: 'cuisine' | 'bar'
) {
  const isBar = section === 'bar'
  const ingredientTable = isBar ? 'ingredients_bar' : 'ingredients'
  const ficheTable = isBar ? 'fiches_bar' : 'fiches'
  const ficheIngTable = isBar ? 'fiche_bar_ingredients' : 'fiche_ingredients'
  const ficheFK = isBar ? 'fiche_bar_id' : 'fiche_id'

  // Load ingredients + last validated inventory in parallel
  const [ingredientsRes, dernierInvRes] = await Promise.all([
    db.from(ingredientTable).select('id, nom, unite, prix_kg').eq('client_id', clientId),
    db
      .from('inventaires')
      .select('id, date_inventaire')
      .eq('client_id', clientId)
      .eq('statut', 'valide')
      .in('section', [section, 'global'])
      .order('date_inventaire', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const ingredients: IngredientRow[] = ingredientsRes.data ?? []
  const dernierInv = dernierInvRes.data
  const periodeDebut = dernierInv?.date_inventaire ?? null

  // Load starting stock, purchases, and sales in parallel
  const [stockDepart, achats, conso] = await Promise.all([
    loadStockDepart(db, dernierInv, section),
    loadAchats(db, clientId, periodeDebut, ingredients),
    loadConsommation(db, clientId, periodeDebut, ficheTable, ficheIngTable, ficheFK, ingredients),
  ])

  // Calculate theoretical stock per ingredient
  return ingredients.map((ing) => {
    const sd = stockDepart[ing.id] || 0
    const a = achats[ing.id] || 0
    const co = conso[ing.id] || 0
    return {
      ingredient_id: ing.id,
      nom: ing.nom,
      unite: ing.unite,
      prix_kg: ing.prix_kg,
      stock_depart: round3(sd),
      achats: round3(a),
      consommation: round3(co),
      quantite_theorique: round3(sd + a - co),
    }
  })
}

async function loadStockDepart(
  db: SupabaseClient,
  dernierInv: { id: string } | null,
  section: string
): Promise<Record<string, number>> {
  if (!dernierInv) return {}

  const { data: lignes } = await db
    .from('inventaire_lignes')
    .select('ingredient_id, quantite_reelle, unite')
    .eq('inventaire_id', dernierInv.id)
    .eq('section', section)

  const result: Record<string, number> = {}
  for (const l of lignes ?? []) {
    if (l.ingredient_id && l.quantite_reelle != null) {
      result[l.ingredient_id] = Number(l.quantite_reelle)
    }
  }
  return result
}

async function loadAchats(
  db: SupabaseClient,
  clientId: string,
  periodeDebut: string | null,
  ingredients: IngredientRow[]
): Promise<Record<string, number>> {
  let factureQuery = db.from('achats_factures').select('id').eq('client_id', clientId).is('deleted_at', null)
  if (periodeDebut) factureQuery = factureQuery.gt('date_facture', periodeDebut)
  const { data: factures } = await factureQuery

  if (!factures || factures.length === 0) return {}

  const { data: lignes } = await db
    .from('achats_lignes')
    .select('ingredient_id, quantite, unite')
    .eq('client_id', clientId)
    .not('ingredient_id', 'is', null)
    .in('facture_id', factures.map((f) => f.id))

  const ingMap = new Map(ingredients.map((i) => [i.id, i]))
  const result: Record<string, number> = {}

  for (const l of lignes ?? []) {
    if (!l.ingredient_id) continue
    const ingRef = ingMap.get(l.ingredient_id)
    const qte = Number(l.quantite) || 0
    let converted = qte
    if (ingRef && l.unite !== ingRef.unite) {
      const c = convertirUnite(qte, l.unite, ingRef.unite)
      if (c != null) converted = c
    }
    result[l.ingredient_id] = (result[l.ingredient_id] || 0) + converted
  }
  return result
}

async function loadConsommation(
  db: SupabaseClient,
  clientId: string,
  periodeDebut: string | null,
  ficheTable: string,
  ficheIngTable: string,
  ficheFK: string,
  ingredients: IngredientRow[]
): Promise<Record<string, number>> {
  let ventesQuery = db
    .from('ventes_journalieres')
    .select('fiche_id, quantite_vendue')
    .eq('client_id', clientId)
  if (periodeDebut) ventesQuery = ventesQuery.gt('jour', periodeDebut)
  const { data: ventes } = await ventesQuery

  if (!ventes || ventes.length === 0) return {}

  const ventesParFiche: Record<string, number> = {}
  for (const v of ventes) {
    if (!v.fiche_id) continue
    ventesParFiche[v.fiche_id] = (ventesParFiche[v.fiche_id] || 0) + (Number(v.quantite_vendue) || 0)
  }

  const ficheIds = Object.keys(ventesParFiche)
  if (ficheIds.length === 0) return {}

  const selectFields = `ingredient_id, quantite, unite, ${ficheFK}`
  const [fichesRes, compsRes] = await Promise.all([
    db.from(ficheTable).select('id, nb_portions').in('id', ficheIds),
    db.from(ficheIngTable).select(selectFields).in(ficheFK, ficheIds).eq('client_id', clientId),
  ])

  const ficheMap = new Map((fichesRes.data ?? []).map((f: Record<string, unknown>) => [f.id as string, f]))
  const ingMap = new Map(ingredients.map((i) => [i.id, i]))
  const result: Record<string, number> = {}

  for (const comp of (compsRes.data ?? []) as unknown as Record<string, unknown>[]) {
    const ingredientId = comp.ingredient_id as string | null
    if (!ingredientId) continue
    const fId = comp[ficheFK] as string
    const nbP = (ficheMap.get(fId) as Record<string, unknown> | undefined)?.nb_portions as number || 1
    const qtV = ventesParFiche[fId] || 0
    const c2 = qtV * ((Number(comp.quantite) || 0) / nbP)
    const ingRef = ingMap.get(ingredientId)
    let consoC = c2
    if (ingRef && comp.unite !== ingRef.unite) {
      const cv = convertirUnite(c2, comp.unite as string, ingRef.unite)
      if (cv != null) consoC = cv
    }
    result[ingredientId] = (result[ingredientId] || 0) + consoC
  }
  return result
}

// ── Pareto Analysis ────────────────────────────────────────────────────────

export async function computePareto(
  db: SupabaseClient,
  clientId: string,
  section: 'cuisine' | 'bar'
) {
  const threeMonthsAgo = new Date()
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3)
  const dateLimit = threeMonthsAgo.toISOString().slice(0, 10)

  const { data: factures } = await db
    .from('achats_factures')
    .select('id')
    .eq('client_id', clientId)
    .is('deleted_at', null)
    .gte('date_facture', dateLimit)

  if (!factures || factures.length === 0) return { items: [], grandTotal: 0 }

  const isBar = section === 'bar'
  const ingredientTable = isBar ? 'ingredients_bar' : 'ingredients'

  const [lignesRes, ingredientsRes] = await Promise.all([
    db
      .from('achats_lignes')
      .select('ingredient_id, montant_ht')
      .eq('client_id', clientId)
      .not('ingredient_id', 'is', null)
      .in('facture_id', factures.map((f) => f.id)),
    db.from(ingredientTable).select('id, nom').eq('client_id', clientId),
  ])

  const ingMap = new Map((ingredientsRes.data ?? []).map((i) => [i.id, i]))
  const totaux: Record<string, number> = {}

  for (const l of lignesRes.data ?? []) {
    if (!l.ingredient_id) continue
    totaux[l.ingredient_id] = (totaux[l.ingredient_id] || 0) + (Number(l.montant_ht) || 0)
  }

  const sorted = Object.entries(totaux)
    .map(([id, total]) => ({ id, nom: ingMap.get(id)?.nom ?? id, total }))
    .sort((a, b) => b.total - a.total)

  const grandTotal = sorted.reduce((s, r) => s + r.total, 0)
  let cumul = 0

  return {
    items: sorted.map((row) => {
      cumul += row.total
      return {
        ...row,
        pourcentage: grandTotal > 0 ? round3((row.total / grandTotal) * 100) : 0,
        cumul_pourcentage: grandTotal > 0 ? round3((cumul / grandTotal) * 100) : 0,
        est_critique: grandTotal > 0 && (cumul - row.total) / grandTotal < 0.80,
      }
    }),
    grandTotal,
  }
}

// ── Create Inventaire ──────────────────────────────────────────────────────

export async function createInventaire(
  db: SupabaseClient,
  clientId: string,
  type: 'tournant' | 'complet',
  section: 'cuisine' | 'bar' | 'global'
) {
  const sections = section === 'global' ? ['cuisine', 'bar'] as const : [section] as const

  // Build all ingredients with theoretical stock
  let allIngredients: InventaireIngredient[] = []
  let periodeDebut: string | null = null

  for (const sec of sections) {
    const stockData = await calculateStockTheorique(db, clientId, sec as 'cuisine' | 'bar')
    for (const item of stockData) {
      allIngredients.push({
        ingredient_id: item.ingredient_id,
        section: sec,
        nom: item.nom,
        unite: item.unite,
        prix_kg: item.prix_kg,
        quantite_theorique: item.quantite_theorique,
      })
    }
  }

  // Resolve periodeDebut
  for (const sec of sections) {
    const { data: inv } = await db
      .from('inventaires')
      .select('date_inventaire')
      .eq('client_id', clientId)
      .eq('statut', 'valide')
      .in('section', [sec, 'global'])
      .order('date_inventaire', { ascending: false })
      .limit(1)
      .maybeSingle()
    const pd = inv?.date_inventaire ?? null
    if (!periodeDebut || (pd && pd < periodeDebut)) periodeDebut = pd
  }

  // Filter for tournant (Pareto)
  if (type === 'tournant') {
    allIngredients = await filterPareto(db, clientId, allIngredients)
  }

  // Create inventory header
  const today = new Date().toISOString().slice(0, 10)
  const { data: inventaire, error: invErr } = await db
    .from('inventaires')
    .insert({
      client_id: clientId,
      type,
      section,
      statut: 'brouillon',
      date_inventaire: today,
      periode_debut: periodeDebut,
      periode_fin: today,
    })
    .select()
    .single()

  if (invErr) throw new Error(invErr.message)

  // Insert lines
  if (allIngredients.length > 0) {
    const lignes = allIngredients.map((ing) => ({
      inventaire_id: inventaire.id,
      client_id: clientId,
      ingredient_id: ing.ingredient_id,
      section: ing.section,
      nom_ingredient: ing.nom,
      unite: ing.unite,
      quantite_theorique: ing.quantite_theorique,
      quantite_reelle: null,
      cout_unitaire: Number(ing.prix_kg) || 0,
      est_critique: ing.est_critique || false,
    }))

    const { error: ligErr } = await db.from('inventaire_lignes').insert(lignes)
    if (ligErr) throw new Error(ligErr.message)
  }

  return {
    inventaire,
    nb_lignes: allIngredients.length,
    message: `Inventaire ${type} créé avec ${allIngredients.length} ligne(s).`,
  }
}

async function filterPareto(
  db: SupabaseClient,
  clientId: string,
  allIngredients: InventaireIngredient[]
): Promise<InventaireIngredient[]> {
  const FLASH_MIN = 20
  const FLASH_MAX = 25

  const threeMonthsAgo = new Date()
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3)
  const dateLimit = threeMonthsAgo.toISOString().slice(0, 10)

  const { data: factures } = await db
    .from('achats_factures')
    .select('id')
    .eq('client_id', clientId)
    .is('deleted_at', null)
    .gte('date_facture', dateLimit)

  let criticalIds = new Set<string>()

  if (factures && factures.length > 0) {
    const { data: lignes } = await db
      .from('achats_lignes')
      .select('ingredient_id, montant_ht')
      .eq('client_id', clientId)
      .not('ingredient_id', 'is', null)
      .in('facture_id', factures.map((f) => f.id))

    const totaux: Record<string, number> = {}
    for (const l of lignes ?? []) {
      if (!l.ingredient_id) continue
      totaux[l.ingredient_id] = (totaux[l.ingredient_id] || 0) + (Number(l.montant_ht) || 0)
    }

    const sorted = Object.entries(totaux)
      .map(([id, total]) => ({ id, total }))
      .sort((a, b) => b.total - a.total)

    const grandTotal = sorted.reduce((s, r) => s + r.total, 0)
    if (grandTotal > 0) {
      let cumul = 0
      for (const row of sorted) {
        if (cumul / grandTotal >= 0.8) break
        criticalIds.add(row.id)
        cumul += row.total
      }
    }
  }

  // Fallback: sort by price
  if (criticalIds.size === 0) {
    const sortedByPrix = allIngredients
      .filter((ing) => (ing.prix_kg || 0) > 0)
      .sort((a, b) => (b.prix_kg || 0) - (a.prix_kg || 0))

    if (sortedByPrix.length > 0) {
      const grandTotal = sortedByPrix.reduce((s, r) => s + (r.prix_kg || 0), 0)
      let cumul = 0
      for (const ing of sortedByPrix) {
        if (grandTotal > 0 && cumul / grandTotal >= 0.8) break
        criticalIds.add(ing.ingredient_id)
        cumul += ing.prix_kg || 0
      }
    }

    if (criticalIds.size === 0) {
      allIngredients.forEach((ing) => criticalIds.add(ing.ingredient_id))
    }
  }

  const allWithFlag = allIngredients.map((ing) => ({
    ...ing,
    est_critique: criticalIds.has(ing.ingredient_id),
  }))

  let filtered = allWithFlag.filter((ing) => ing.est_critique)

  if (filtered.length > FLASH_MAX) {
    filtered = filtered.sort((a, b) => (b.prix_kg || 0) - (a.prix_kg || 0)).slice(0, FLASH_MAX)
  } else if (filtered.length < FLASH_MIN) {
    const includedIds = new Set(filtered.map((i) => i.ingredient_id))
    const extras = allWithFlag
      .filter((ing) => !includedIds.has(ing.ingredient_id))
      .sort((a, b) => (b.prix_kg || 0) - (a.prix_kg || 0))
      .slice(0, FLASH_MIN - filtered.length)
      .map((ing) => ({ ...ing, est_critique: false }))
    filtered = [...filtered, ...extras]
  }

  return filtered
}

// ── Validate Inventaire ────────────────────────────────────────────────────

export async function validerInventaire(
  db: SupabaseClient,
  inventaireId: string,
  clientId: string,
  userId: string
) {
  const { data: inv } = await db
    .from('inventaires')
    .select('id, statut, type, client_id')
    .eq('id', inventaireId)
    .eq('client_id', clientId)
    .maybeSingle()

  if (!inv) throw new NotFoundError('Inventaire introuvable.')
  if (inv.statut === 'valide') throw new ConflictError('Inventaire déjà validé.')

  const now = new Date().toISOString()
  const { error } = await db
    .from('inventaires')
    .update({
      statut: 'valide',
      date_validation: now,
      valide_par: userId,
    })
    .eq('id', inventaireId)

  if (error) throw new Error(error.message)

  if (inv.type === 'tournant') {
    await db
      .from('clients')
      .update({ inventaire_tournant_dernier: now })
      .eq('id', clientId)
  }

  return { validated: true }
}

// ── Delete Inventaire ──────────────────────────────────────────────────────

export async function deleteInventaire(
  db: SupabaseClient,
  inventaireId: string,
  clientId: string
) {
  const { data: inv } = await db
    .from('inventaires')
    .select('id, statut')
    .eq('id', inventaireId)
    .eq('client_id', clientId)
    .maybeSingle()

  if (!inv) throw new NotFoundError('Inventaire introuvable.')
  if (inv.statut === 'valide') {
    throw new ValidationError('Impossible de supprimer un inventaire validé.')
  }

  // Delete lines then header
  await db.from('inventaire_lignes').delete().eq('inventaire_id', inventaireId)
  const { error } = await db.from('inventaires').delete().eq('id', inventaireId)
  if (error) throw new Error(error.message)

  return { deleted: true }
}

// ── Save ligne ─────────────────────────────────────────────────────────────

export async function saveLigne(
  db: SupabaseClient,
  ligneId: string,
  clientId: string,
  quantiteReelle: number | null
) {
  const { error } = await db
    .from('inventaire_lignes')
    .update({ quantite_reelle: quantiteReelle })
    .eq('id', ligneId)
    .eq('client_id', clientId)

  if (error) throw new Error(error.message)
  return { updated: true }
}

// ── Add ligne ──────────────────────────────────────────────────────────────

export async function addLigne(
  db: SupabaseClient,
  inventaireId: string,
  clientId: string,
  ingredientId: string,
  section: 'cuisine' | 'bar'
) {
  // Verify inventory exists and is draft
  const { data: inv } = await db
    .from('inventaires')
    .select('id, statut')
    .eq('id', inventaireId)
    .eq('client_id', clientId)
    .maybeSingle()

  if (!inv) throw new NotFoundError('Inventaire introuvable.')
  if (inv.statut === 'valide') {
    throw new ValidationError('Impossible d\'ajouter une ligne à un inventaire validé.')
  }

  // Check duplicate
  const { data: existing } = await db
    .from('inventaire_lignes')
    .select('id')
    .eq('inventaire_id', inventaireId)
    .eq('ingredient_id', ingredientId)
    .maybeSingle()

  if (existing) throw new ConflictError('Cet ingrédient est déjà dans l\'inventaire.')

  // Load ingredient
  const isBar = section === 'bar'
  const table = isBar ? 'ingredients_bar' : 'ingredients'
  const { data: ing } = await db
    .from(table)
    .select('id, nom, unite, prix_kg')
    .eq('id', ingredientId)
    .eq('client_id', clientId)
    .maybeSingle()

  if (!ing) throw new NotFoundError('Ingrédient introuvable.')

  const { data: ligne, error } = await db
    .from('inventaire_lignes')
    .insert({
      inventaire_id: inventaireId,
      client_id: clientId,
      ingredient_id: ingredientId,
      section,
      nom_ingredient: ing.nom,
      unite: ing.unite,
      quantite_theorique: 0,
      quantite_reelle: null,
      cout_unitaire: Number(ing.prix_kg) || 0,
      est_critique: false,
    })
    .select()
    .single()

  if (error) throw new Error(error.message)
  return ligne
}

// ── Utilities ──────────────────────────────────────────────────────────────

function round3(n: number): number {
  return Math.round(n * 1000) / 1000
}
