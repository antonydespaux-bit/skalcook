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
  }

  const dbUpdates: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(updates)) {
    if (allowedFields[key] && value !== undefined) {
      dbUpdates[allowedFields[key]] = value
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
  // Load all invoices + lines + ingredients in parallel
  const [facturesRes, ingredientsRes] = await Promise.all([
    db
      .from('achats_factures')
      .select('id, fournisseur, date_facture')
      .eq('client_id', clientId)
      .is('deleted_at', null)
      .order('date_facture', { ascending: false }),
    db
      .from('ingredients')
      .select('id, nom, unite, prix_kg')
      .eq('client_id', clientId),
  ])

  const factures = facturesRes.data ?? []
  const ingredients = ingredientsRes.data ?? []

  if (factures.length === 0) {
    return { fournisseurs: [], data: [] }
  }

  const factureIds = factures.map((f) => f.id)
  const { data: lignes } = await db
    .from('achats_lignes')
    .select('facture_id, ingredient_id, prix_unitaire_ht, quantite, montant_ht')
    .in('facture_id', factureIds)
    .not('ingredient_id', 'is', null)

  // Build mercuriale data
  const fournisseursSet = new Set<string>()
  const factureMap = new Map(factures.map((f) => [f.id, f]))
  const ingMap = new Map(ingredients.map((i) => [i.id, i]))

  type MercEntry = {
    ingredient_id: string
    nom: string
    unite: string
    prix_kg: number
    fournisseurs: Record<string, { prix_moyen: number; dernier_prix: number; nb_achats: number }>
  }
  const mercData = new Map<string, MercEntry>()

  for (const l of lignes ?? []) {
    if (!l.ingredient_id) continue
    const fac = factureMap.get(l.facture_id)
    if (!fac) continue

    fournisseursSet.add(fac.fournisseur)
    const ing = ingMap.get(l.ingredient_id)
    if (!ing) continue

    if (!mercData.has(l.ingredient_id)) {
      mercData.set(l.ingredient_id, {
        ingredient_id: l.ingredient_id,
        nom: ing.nom,
        unite: ing.unite,
        prix_kg: ing.prix_kg,
        fournisseurs: {},
      })
    }

    const entry = mercData.get(l.ingredient_id)!
    if (!entry.fournisseurs[fac.fournisseur]) {
      entry.fournisseurs[fac.fournisseur] = { prix_moyen: 0, dernier_prix: 0, nb_achats: 0 }
    }

    const fEntry = entry.fournisseurs[fac.fournisseur]
    fEntry.nb_achats++
    fEntry.dernier_prix = l.prix_unitaire_ht
    fEntry.prix_moyen =
      (fEntry.prix_moyen * (fEntry.nb_achats - 1) + l.prix_unitaire_ht) / fEntry.nb_achats
  }

  // Mark best prices
  const result = Array.from(mercData.values()).map((entry) => {
    let bestPrice = Infinity
    let bestFournisseur = ''
    for (const [f, data] of Object.entries(entry.fournisseurs)) {
      if (data.dernier_prix < bestPrice) {
        bestPrice = data.dernier_prix
        bestFournisseur = f
      }
    }
    return { ...entry, meilleur_fournisseur: bestFournisseur, meilleur_prix: bestPrice }
  })

  return {
    fournisseurs: Array.from(fournisseursSet).sort(),
    data: result.sort((a, b) => a.nom.localeCompare(b.nom)),
  }
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
