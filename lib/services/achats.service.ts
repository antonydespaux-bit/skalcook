/**
 * Service layer for Achats (Purchases) domain.
 * Pure business logic — no HTTP concerns.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { SaveFactureInput, CreateIngredientInput } from '../validators/achats.schema'
import { ConflictError, ValidationError, NotFoundError } from '../errors'

// ── Helpers ────────────────────────────────────────────────────────────────

export function normDesignation(s: string | null | undefined): string {
  if (!s) return ''
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function computeLigneEffective(ligne: { quantite: number; prix_unitaire_ht: number; remise?: number }) {
  const remise = ligne.remise ?? 0
  const prixEffectif = ligne.prix_unitaire_ht * (1 - remise / 100)
  const montantHt = ligne.quantite * prixEffectif
  return { prixEffectif, montantHt, remise }
}

// ── Service functions ──────────────────────────────────────────────────────

export async function checkDuplicateFacture(
  db: SupabaseClient,
  clientId: string,
  numeroFacture: string
) {
  const numTrimmed = numeroFacture.trim()
  if (!numTrimmed) return null

  const { data: rows } = await db
    .from('achats_factures')
    .select('id, date_facture, fournisseur, total_ht, created_at')
    .eq('client_id', clientId)
    .is('deleted_at', null)
    .ilike('numero_facture', numTrimmed)
    .limit(1)

  return rows?.[0] ?? null
}

export async function upsertFournisseur(
  db: SupabaseClient,
  clientId: string,
  nomFournisseur: string
): Promise<string | null> {
  const nom = nomFournisseur.trim()
  const { data: existing } = await db
    .from('fournisseurs')
    .select('id')
    .eq('client_id', clientId)
    .ilike('nom', nom)
    .maybeSingle()

  if (existing) return existing.id

  const { data: created } = await db
    .from('fournisseurs')
    .insert({ client_id: clientId, nom })
    .select('id')
    .single()

  return created?.id ?? null
}

export async function uploadFactureFile(
  db: SupabaseClient,
  clientId: string,
  fileBase64: string,
  fileMime: string
): Promise<string | null> {
  const extMap: Record<string, string> = {
    'application/pdf': 'pdf',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/jpeg': 'jpg',
  }
  const ext = extMap[fileMime] || 'jpg'
  const path = `${clientId}/${Date.now()}.${ext}`
  const buffer = Buffer.from(fileBase64, 'base64')

  const { error } = await db.storage
    .from('factures')
    .upload(path, buffer, { contentType: fileMime, upsert: false })

  if (error) {
    console.warn('Storage upload failed (non-blocking):', error.message)
    return null
  }
  return path
}

export async function saveFacture(
  db: SupabaseClient,
  input: SaveFactureInput,
  userId: string
) {
  const { clientId, fournisseur, numeroFacture, dateFacture, statut, lignes, fileBase64, fileMime, forceInsert, tauxTva } = input
  const nomFournisseur = fournisseur.trim()

  // 1. Check duplicate
  if (numeroFacture?.trim() && !forceInsert) {
    const existing = await checkDuplicateFacture(db, clientId, numeroFacture)
    if (existing) {
      throw new ConflictError('DUPLICATE_FACTURE')
    }
  }

  // 2. Upsert fournisseur + upload file in parallel
  const [fournisseurId, fichierUrl] = await Promise.all([
    upsertFournisseur(db, clientId, nomFournisseur),
    fileBase64 && fileMime
      ? uploadFactureFile(db, clientId, fileBase64, fileMime)
      : Promise.resolve(null),
  ])

  // 3. Calculate total HT
  const totalHt = lignes.reduce((sum, l) => {
    const { montantHt } = computeLigneEffective(l)
    return sum + montantHt
  }, 0)

  // 4. Insert facture header
  const { data: facture, error: fErr } = await db
    .from('achats_factures')
    .insert({
      client_id: clientId,
      fournisseur: nomFournisseur,
      fournisseur_id: fournisseurId,
      numero_facture: numeroFacture?.trim() || null,
      date_facture: dateFacture,
      total_ht: totalHt,
      taux_tva: tauxTva ?? null,
      statut: statut === 'bl' ? 'bl' : 'facture',
      fichier_url: fichierUrl,
    })
    .select()
    .single()

  if (fErr) throw new Error(fErr.message)

  // 5. Insert lines
  const lignesInsert = lignes.map((l) => {
    const { prixEffectif, montantHt, remise } = computeLigneEffective(l)
    return {
      facture_id: facture.id,
      client_id: clientId,
      designation: l.designation,
      ingredient_id: l.ingredient_id || null,
      quantite: l.quantite,
      unite: l.unite || null,
      prix_unitaire_ht: prixEffectif,
      remise,
      montant_ht: montantHt,
    }
  })

  const { error: lErr } = await db.from('achats_lignes').insert(lignesInsert)
  if (lErr) {
    // Rollback header
    await db.from('achats_factures').delete().eq('id', facture.id)
    throw new Error(lErr.message)
  }

  // 6. Update ingredient prices (for checked lines) + audit log + mapping — in parallel
  const toUpdate = lignes.filter((l) => l.updatePrice && l.ingredient_id)

  await Promise.all([
    // Price updates
    ...toUpdate.map((l) => {
      const { prixEffectif } = computeLigneEffective(l)
      return db
        .from('ingredients')
        .update({ prix_kg: prixEffectif })
        .eq('id', l.ingredient_id!)
        .eq('client_id', clientId)
    }),

    // Audit log
    db.from('transactions_api').insert({
      client_id: clientId,
      type: 'achats_import',
      source: 'facture_upload',
      payload_json: {
        facture_id: facture.id,
        lignes_count: lignes.length,
        prix_maj: toUpdate.length,
      },
      user_id: userId,
    }),

    // Fournisseur mapping upsert
    (async () => {
      const newMappings = lignes
        .filter((l) => l.ingredient_id)
        .map((l) => ({
          client_id: clientId,
          designation_fournisseur: l.designation,
          designation_norm: normDesignation(l.designation),
          ingredient_id: l.ingredient_id!,
          fournisseur: nomFournisseur,
        }))
      if (newMappings.length > 0) {
        await db
          .from('fournisseur_mapping')
          .upsert(newMappings, { onConflict: 'client_id,designation_norm' })
      }
    })(),
  ])

  return { facture_id: facture.id, prix_maj: toUpdate.length }
}

export async function updateFacture(
  db: SupabaseClient,
  factureId: string,
  clientId: string,
  updates: Record<string, unknown>
) {
  const allowedFields: Record<string, string> = {
    fournisseur: 'fournisseur',
    numeroFacture: 'numero_facture',
    dateFacture: 'date_facture',
    statut: 'statut',
    tauxTva: 'taux_tva',
  }

  const dbUpdates: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(updates)) {
    if (allowedFields[key] && value !== undefined) {
      dbUpdates[allowedFields[key]] = value
    }
  }

  // ── Remplacement des lignes (optionnel) ─────────────────────────────────
  const lignes = updates.lignes as Array<{
    designation: string
    ingredient_id?: string | null
    quantite: number
    unite?: string | null
    prix_unitaire_ht: number
    remise?: number
  }> | undefined

  if (lignes) {
    // Recalcul du total HT depuis les nouvelles lignes
    const totalHt = lignes.reduce((sum, l) => {
      const { montantHt } = computeLigneEffective(l)
      return sum + montantHt
    }, 0)
    dbUpdates.total_ht = totalHt

    // Suppression des lignes existantes
    const { error: dErr } = await db
      .from('achats_lignes')
      .delete()
      .eq('facture_id', factureId)
      .eq('client_id', clientId)
    if (dErr) throw new Error(dErr.message)

    // Insertion des nouvelles lignes
    if (lignes.length > 0) {
      const lignesInsert = lignes.map((l) => {
        const { prixEffectif, montantHt, remise } = computeLigneEffective(l)
        return {
          facture_id: factureId,
          client_id: clientId,
          designation: l.designation,
          ingredient_id: l.ingredient_id || null,
          quantite: l.quantite,
          unite: l.unite || null,
          prix_unitaire_ht: prixEffectif,
          remise,
          montant_ht: montantHt,
        }
      })
      const { error: iErr } = await db.from('achats_lignes').insert(lignesInsert)
      if (iErr) throw new Error(iErr.message)
    }

    // Mise à jour mapping fournisseur (nouvelles liaisons)
    const { data: facRow } = await db
      .from('achats_factures')
      .select('fournisseur')
      .eq('id', factureId)
      .eq('client_id', clientId)
      .maybeSingle()
    const nomFournisseur = (dbUpdates.fournisseur as string | undefined) || facRow?.fournisseur || ''
    if (nomFournisseur) {
      const newMappings = lignes
        .filter((l) => l.ingredient_id)
        .map((l) => ({
          client_id: clientId,
          designation_fournisseur: l.designation,
          designation_norm: normDesignation(l.designation),
          ingredient_id: l.ingredient_id!,
          fournisseur: nomFournisseur,
        }))
      if (newMappings.length > 0) {
        await db
          .from('fournisseur_mapping')
          .upsert(newMappings, { onConflict: 'client_id,designation_norm' })
      }
    }
  }

  if (Object.keys(dbUpdates).length === 0) {
    throw new ValidationError('Aucun champ à mettre à jour.')
  }

  const { error } = await db
    .from('achats_factures')
    .update(dbUpdates)
    .eq('id', factureId)
    .eq('client_id', clientId)

  if (error) throw new Error(error.message)
  return { updated: true }
}

export async function deleteFacture(
  db: SupabaseClient,
  factureId: string,
  clientId: string,
  userId?: string
) {
  // Soft-delete : marque la facture comme supprimée (rétention DGCCRF 10 ans)
  // La facture reste en base mais n'apparaît plus dans les requêtes courantes.
  const { error } = await db
    .from('achats_factures')
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: userId || null,
    })
    .eq('id', factureId)
    .eq('client_id', clientId)
    .is('deleted_at', null)

  if (error) throw new Error(error.message)
  return { deleted: true, soft: true }
}

export async function createIngredient(
  db: SupabaseClient,
  input: CreateIngredientInput
) {
  const { clientId, nom, unite, prix_kg } = input

  const { data, error } = await db
    .from('ingredients')
    .insert({
      client_id: clientId,
      nom: nom.trim(),
      unite,
      prix_kg: prix_kg ?? 0,
      est_sous_fiche: false,
    })
    .select('id, nom, unite, prix_kg')
    .single()

  if (error) throw new Error(error.message)
  return data
}

export async function getMercuriale(db: SupabaseClient, clientId: string) {
  // Tous les ingrédients du client (pour la recherche hors mercuriale)
  const { data: allIngs } = await db
    .from('ingredients')
    .select('id, nom, unite')
    .eq('client_id', clientId)
    .order('nom')
  const allIngredients = (allIngs ?? []).map((i: { id: string; nom: string; unite: string | null }) => ({
    id: i.id,
    nom: i.nom,
    unite: i.unite ?? '',
  }))

  // Toutes les factures + BL du client
  const { data: factures } = await db
    .from('achats_factures')
    .select('id, fournisseur, fournisseur_id, date_facture')
    .eq('client_id', clientId)
    .order('date_facture', { ascending: false })

  if (!factures?.length) {
    return { rows: [], fournisseurs: [], allIngredients }
  }

  const factureIds = factures.map((f) => f.id)
  const factureMap = new Map(factures.map((f) => [f.id, f]))

  // Toutes les lignes ayant un ingrédient lié
  const { data: lignes } = await db
    .from('achats_lignes')
    .select('ingredient_id, designation, unite, prix_unitaire_ht, remise, facture_id')
    .in('facture_id', factureIds)
    .not('ingredient_id', 'is', null)

  // Index ingrédients pour le nom canonique
  const ingredientIds = [...new Set((lignes ?? []).map((l) => l.ingredient_id).filter(Boolean) as string[])]
  let ingredientsById: Record<string, { id: string; nom: string; unite: string | null }> = {}
  if (ingredientIds.length) {
    const { data: ings } = await db
      .from('ingredients')
      .select('id, nom, unite')
      .in('id', ingredientIds)
    if (ings) {
      ingredientsById = Object.fromEntries(
        (ings as { id: string; nom: string; unite: string | null }[]).map((i) => [i.id, i])
      )
    }
  }

  // Agrège par (ingredient_id, fournisseur)
  type Achat = { prix: number; date: string; unite: string | null }
  type ByFourn = Record<string, { fournisseur_id: string | null; achats: Achat[] }>
  const agg: Record<string, ByFourn> = {}
  for (const l of lignes ?? []) {
    if (!l.ingredient_id) continue
    const f = factureMap.get(l.facture_id)
    if (!f) continue
    const prix = Number(l.prix_unitaire_ht) * (1 - (Number(l.remise) || 0) / 100)
    const fourn = f.fournisseur
    const fournId = (f as { fournisseur_id?: string | null }).fournisseur_id ?? null

    if (!agg[l.ingredient_id]) agg[l.ingredient_id] = {}
    if (!agg[l.ingredient_id][fourn]) {
      agg[l.ingredient_id][fourn] = { fournisseur_id: fournId, achats: [] }
    }
    agg[l.ingredient_id][fourn].achats.push({ prix, date: f.date_facture, unite: l.unite })
  }

  // Liste des fournisseurs triés
  const fournisseursSet = new Set<string>()
  for (const ingData of Object.values(agg)) {
    for (const fourn of Object.keys(ingData)) fournisseursSet.add(fourn)
  }
  const fournisseurs = [...fournisseursSet].sort()

  // Lignes de la mercuriale
  type Col = {
    fournisseur_id: string | null
    prix_last: number
    prix_moy: number
    date_last: string
    nb_achats: number
    unite: string | null
    is_best?: boolean
  }
  const rows = Object.entries(agg)
    .map(([ingredientId, byFourn]) => {
      const ing = ingredientsById[ingredientId]
      const cols: Record<string, Col> = {}
      let bestPrix: number | null = null

      for (const [fourn, data] of Object.entries(byFourn)) {
        const sorted = data.achats.sort((a, b) => b.date.localeCompare(a.date))
        const prixLast = sorted[0].prix
        const prixMoy = sorted.reduce((s, a) => s + a.prix, 0) / sorted.length
        cols[fourn] = {
          fournisseur_id: data.fournisseur_id,
          prix_last: Math.round(prixLast * 10000) / 10000,
          prix_moy: Math.round(prixMoy * 10000) / 10000,
          date_last: sorted[0].date,
          nb_achats: sorted.length,
          unite: sorted[0].unite,
        }
        if (bestPrix === null || prixLast < bestPrix) bestPrix = prixLast
      }

      for (const fourn of Object.keys(cols)) {
        cols[fourn].is_best = bestPrix !== null && Math.abs(cols[fourn].prix_last - bestPrix) < 0.001
      }

      return {
        ingredient_id: ingredientId,
        ingredient_nom: ing?.nom ?? '—',
        unite: Object.values(byFourn)[0]?.achats[0]?.unite ?? ing?.unite ?? '—',
        cols,
      }
    })
    .sort((a, b) => a.ingredient_nom.localeCompare(b.ingredient_nom))

  return { rows, fournisseurs, allIngredients }
}

export async function getReconciliationData(db: SupabaseClient, clientId: string) {
  const [mappingRes, ingredientsRes] = await Promise.all([
    db
      .from('fournisseur_mapping')
      .select('*')
      .eq('client_id', clientId),
    db
      .from('ingredients')
      .select('id, nom, unite, prix_kg')
      .eq('client_id', clientId)
      .eq('est_sous_fiche', false)
      .order('nom'),
  ])

  return {
    mappings: mappingRes.data ?? [],
    ingredients: ingredientsRes.data ?? [],
  }
}
