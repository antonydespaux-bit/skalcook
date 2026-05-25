/**
 * Service layer for Achats (Purchases) domain.
 * Pure business logic — no HTTP concerns.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { SaveFactureInput, CreateIngredientInput, BulkImportHeadersInput, FusionnerBlsInput } from '../validators/achats.schema'
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

export function computeLigneEffective(
  ligne: { quantite: number; prix_unitaire_ht: number; remise?: number },
  signe: 1 | -1 = 1,
) {
  const remise = ligne.remise ?? 0
  // prix unitaire reste positif (sert de référence pour la mercuriale et update prix ingrédient).
  // Seul le montant porte le signe — un avoir aboutit à un montant_ht négatif.
  const prixEffectif = ligne.prix_unitaire_ht * (1 - remise / 100)
  const montantHt = ligne.quantite * prixEffectif * signe
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
  const { clientId, fournisseur, numeroFacture, dateFacture, statut, lignes: lignesInput, fileBase64, fileMime, forceInsert, tauxTva, montantTva, autoCreateMissing } = input
  const nomFournisseur = fournisseur.trim()
  const signe: 1 | -1 = statut === 'avoir' ? -1 : 1

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

  // 2bis. Création auto des ingrédients manquants (avant insert lignes).
  // Pour chaque ligne sans ingredient_id mais avec une designation non vide :
  //   - on tente d'abord de matcher un ingrédient existant par nom normalisé
  //   - sinon on le crée avec nom = designation, unite = ligne.unite ?? 'kg',
  //     prix_kg = prix unitaire de la ligne
  // Idempotent : si plusieurs lignes partagent la même désignation, un seul
  // ingrédient est créé et toutes les lignes pointent dessus.
  let lignes = lignesInput
  let autoCreatedCount = 0
  if (autoCreateMissing) {
    const missing = lignesInput.filter((l) => !l.ingredient_id && l.designation?.trim())
    if (missing.length > 0) {
      const norms = [...new Set(missing.map((l) => normDesignation(l.designation)))].filter(Boolean)
      // Recherche des ingrédients déjà existants pour ces normes (par nom exact normalisé)
      const { data: existingIngs } = await db
        .from('ingredients')
        .select('id, nom, unite, prix_kg')
        .eq('client_id', clientId)
      const ingByNorm: Record<string, { id: string }> = {}
      for (const ing of existingIngs ?? []) {
        ingByNorm[normDesignation((ing as { nom: string }).nom)] = ing as { id: string }
      }
      const idByNorm: Record<string, string> = {}
      for (const norm of norms) {
        if (ingByNorm[norm]) {
          idByNorm[norm] = ingByNorm[norm].id
          continue
        }
        // À créer : prend la 1re ligne qui matche cette norme comme source
        const src = missing.find((l) => normDesignation(l.designation) === norm)
        if (!src) continue
        // Utilise findOrCreateIngredient : retourne l'existant si déjà présent
        // pour le client, sinon crée. Conflit global → erreur exploitable.
        const ing = await findOrCreateIngredient(
          db,
          clientId,
          src.designation,
          src.unite,
          Number(src.prix_unitaire_ht) || 0,
        )
        idByNorm[norm] = ing.id
        autoCreatedCount++
      }
      // Reassign ingredient_id sur les lignes
      lignes = lignesInput.map((l) => {
        if (l.ingredient_id || !l.designation?.trim()) return l
        const norm = normDesignation(l.designation)
        const id = idByNorm[norm]
        return id ? { ...l, ingredient_id: id } : l
      })
    }
  }

  // 3. Calculate total HT (négatif pour un avoir)
  const totalHt = lignes.reduce((sum, l) => {
    const { montantHt } = computeLigneEffective(l, signe)
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
      // Pour un avoir, le montant TVA suit naturellement le signe (négatif).
      montant_tva: montantTva != null ? montantTva * signe : null,
      statut,
      fichier_url: fichierUrl,
    })
    .select()
    .single()

  if (fErr) {
    // La DB a une contrainte UNIQUE (client_id, numero_facture) qui rejette
    // même les inserts forceInsert. On remonte un message clair plutôt qu'un
    // 500 opaque pour que l'UI puisse aiguiller l'utilisateur.
    if (fErr.code === '23505' || /duplicate key/i.test(fErr.message)) {
      throw new ConflictError(
        `Une facture avec le numéro "${numeroFacture}" existe déjà en base pour ce client. Modifiez le numéro de facture ou supprimez l'ancienne avant de réimporter.`
      )
    }
    throw new Error(fErr.message)
  }

  // 5. Insert lines
  const lignesInsert = lignes.map((l) => {
    const { prixEffectif, montantHt, remise } = computeLigneEffective(l, signe)
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
      taux_tva: l.taux_tva ?? null,
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
        auto_created_ingredients: autoCreatedCount,
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

  // Le client veut savoir si un fichier était attendu et s'il a été stocké :
  // permet d'afficher un avertissement quand l'upload Supabase Storage échoue
  // (non bloquant côté serveur, mais on doit alerter l'utilisateur).
  const fileExpected = !!(fileBase64 && fileMime)
  return {
    facture_id: facture.id,
    prix_maj: toUpdate.length,
    auto_created: autoCreatedCount,
    file_uploaded: fileExpected ? !!fichierUrl : null,
  }
}

// ── Bulk import "pieds de facture" depuis Excel ───────────────────────────
// Import sans détail de lignes : chaque row du fichier devient 1 facture
// + 1 ligne fictive "Facture (import Excel)" portant le total HT. Permet de
// rentrer rapidement un historique d'achats sans saisir les articles.
// N'effectue PAS de blocage sur doublon : la couleur dans le preview UI
// indique les n° factures déjà présents — l'utilisateur arbitre.
export async function bulkImportHeaders(
  db: SupabaseClient,
  input: BulkImportHeadersInput,
  userId: string,
) {
  const { clientId, rows } = input

  // 1. Upsert tous les fournisseurs uniques (case-insensitive)
  const uniqueNoms = [...new Set(rows.map(r => r.fournisseur.trim()).filter(Boolean))]
  const fournisseurIdByNom: Record<string, string | null> = {}
  await Promise.all(uniqueNoms.map(async (nom) => {
    fournisseurIdByNom[nom.toLowerCase()] = await upsertFournisseur(db, clientId, nom)
  }))

  // 2. Insert factures (header) — en batch
  const facturesPayload = rows.map((r) => {
    const nom = r.fournisseur.trim()
    return {
      client_id: clientId,
      fournisseur: nom,
      fournisseur_id: fournisseurIdByNom[nom.toLowerCase()] ?? null,
      numero_facture: r.numeroFacture?.trim() || null,
      date_facture: r.dateFacture,
      total_ht: r.totalHt,
      statut: 'facture' as const,
    }
  })

  const { data: inserted, error: fErr } = await db
    .from('achats_factures')
    .insert(facturesPayload)
    .select('id, numero_facture')

  if (fErr) throw new Error(fErr.message)
  if (!inserted || inserted.length !== rows.length) {
    throw new Error('Insertion incomplète des factures.')
  }

  // 3. Insert 1 ligne fictive par facture (pour respecter le schéma "≥1 ligne")
  const lignesPayload = inserted.map((f, i) => ({
    facture_id: f.id,
    client_id: clientId,
    designation: 'Facture (import Excel)',
    ingredient_id: null,
    quantite: 1,
    unite: null,
    prix_unitaire_ht: rows[i].totalHt,
    remise: 0,
    montant_ht: rows[i].totalHt,
    taux_tva: null,
  }))

  const { error: lErr } = await db.from('achats_lignes').insert(lignesPayload)
  if (lErr) {
    // Rollback : supprime les factures qu'on vient d'insérer
    await db.from('achats_factures').delete().in('id', inserted.map(f => f.id))
    throw new Error(lErr.message)
  }

  // 4. Audit log
  await db.from('transactions_api').insert({
    client_id: clientId,
    type: 'achats_import',
    source: 'bulk_headers_excel',
    payload_json: { count: rows.length, facture_ids: inserted.map(f => f.id) },
    user_id: userId,
  })

  return { imported: inserted.length, facture_ids: inserted.map(f => f.id) }
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
    montantTva: 'montant_tva',
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
    taux_tva?: number | null
  }> | undefined

  if (lignes) {
    // Détermine le signe applicable : statut envoyé en update, sinon statut courant
    let statutEffectif = (dbUpdates.statut as string | undefined) || undefined
    if (!statutEffectif) {
      const { data: cur } = await db
        .from('achats_factures')
        .select('statut')
        .eq('id', factureId)
        .eq('client_id', clientId)
        .maybeSingle()
      statutEffectif = (cur?.statut as string) || 'facture'
    }
    const signe: 1 | -1 = statutEffectif === 'avoir' ? -1 : 1

    // Recalcul du total HT depuis les nouvelles lignes
    const totalHt = lignes.reduce((sum, l) => {
      const { montantHt } = computeLigneEffective(l, signe)
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
        const { prixEffectif, montantHt, remise } = computeLigneEffective(l, signe)
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
          taux_tva: l.taux_tva ?? null,
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

  // Si le statut change vers/depuis 'avoir' SANS que les lignes aient été
  // re-postées, on bascule le signe des lignes existantes et du total pour
  // garder la cohérence comptable.
  const newStatut = dbUpdates.statut as string | undefined
  if (newStatut && !lignes) {
    const { data: cur } = await db
      .from('achats_factures')
      .select('statut, total_ht, montant_tva')
      .eq('id', factureId)
      .eq('client_id', clientId)
      .maybeSingle()
    const wasAvoir = cur?.statut === 'avoir'
    const willBeAvoir = newStatut === 'avoir'
    if (cur && wasAvoir !== willBeAvoir) {
      const { data: existingLignes } = await db
        .from('achats_lignes')
        .select('id, montant_ht')
        .eq('facture_id', factureId)
        .eq('client_id', clientId)
      for (const l of existingLignes ?? []) {
        await db
          .from('achats_lignes')
          .update({ montant_ht: -Number(l.montant_ht) })
          .eq('id', l.id)
      }
      dbUpdates.total_ht = -Number(cur.total_ht ?? 0)
      if (cur.montant_tva != null) {
        dbUpdates.montant_tva = -Number(cur.montant_tva)
      }
    }
  }

  const { error } = await db
    .from('achats_factures')
    .update(dbUpdates)
    .eq('id', factureId)
    .eq('client_id', clientId)

  if (error) throw new Error(error.message)
  return { updated: true }
}

/**
 * Fusionne plusieurs BL en une seule facture consolidée.
 *
 * Comportement :
 *   1. Vérifie : tous les BL appartiennent au client, statut='bl', non
 *      supprimés, non déjà fusionnés, même fournisseur.
 *   2. Crée une nouvelle facture (statut='facture') avec les valeurs
 *      saisies (numero, date, HT, TVA).
 *   3. Déplace toutes les lignes des BL vers la nouvelle facture.
 *   4. Met les BL à zéro : total_ht=0, montant_tva=0, et garde un lien
 *      `facture_consolidee_id` vers la nouvelle facture pour traçabilité.
 *
 * Pas de transaction PostgreSQL "vraie" via le client JS de Supabase :
 * en cas d'erreur sur l'une des étapes 3-4, on tente un rollback de la
 * facture créée à l'étape 2.
 */
export async function fusionnerBls(
  db: SupabaseClient,
  input: FusionnerBlsInput,
  userId: string,
) {
  const { clientId, blIds, numeroFacture, dateFacture, totalHt, montantTva, tauxTva } = input

  // 1. Charge et vérifie les BL
  const { data: bls, error: blErr } = await db
    .from('achats_factures')
    .select('id, fournisseur, fournisseur_id, statut, deleted_at, facture_consolidee_id')
    .in('id', blIds)
    .eq('client_id', clientId)

  if (blErr) throw new Error(blErr.message)
  if (!bls || bls.length !== blIds.length) {
    throw new NotFoundError('Un ou plusieurs BL introuvables.')
  }
  for (const b of bls) {
    if (b.deleted_at) throw new ValidationError(`Le BL ${b.id} est supprimé.`)
    if (b.statut !== 'bl') throw new ValidationError(`Le document ${b.id} n'est pas un BL (statut=${b.statut}).`)
    if (b.facture_consolidee_id) throw new ValidationError(`Le BL ${b.id} a déjà été fusionné.`)
  }
  const fournisseurs = new Set(bls.map((b) => (b.fournisseur || '').trim().toLowerCase()))
  if (fournisseurs.size > 1) {
    throw new ValidationError('Tous les BL doivent provenir du même fournisseur.')
  }
  const fournisseurNom = bls[0].fournisseur || ''
  const fournisseurId = bls[0].fournisseur_id || null

  // 2. Crée la facture consolidée
  const { data: facture, error: fErr } = await db
    .from('achats_factures')
    .insert({
      client_id: clientId,
      fournisseur: fournisseurNom,
      fournisseur_id: fournisseurId,
      numero_facture: numeroFacture.trim(),
      date_facture: dateFacture,
      total_ht: totalHt,
      montant_tva: montantTva ?? null,
      taux_tva: tauxTva ?? null,
      statut: 'facture',
    })
    .select('id')
    .single()

  if (fErr) {
    if (fErr.code === '23505' || /duplicate key/i.test(fErr.message)) {
      throw new ConflictError(`Une facture avec le numéro "${numeroFacture}" existe déjà.`)
    }
    throw new Error(fErr.message)
  }

  // 3. Déplace les lignes des BL vers la facture consolidée
  const { error: mvErr } = await db
    .from('achats_lignes')
    .update({ facture_id: facture.id })
    .in('facture_id', blIds)
    .eq('client_id', clientId)

  if (mvErr) {
    await db.from('achats_factures').delete().eq('id', facture.id)
    throw new Error(`Erreur lors du déplacement des lignes : ${mvErr.message}`)
  }

  // 4. Met les BL à zéro + pointe vers la facture consolidée
  const { error: upErr } = await db
    .from('achats_factures')
    .update({
      total_ht: 0,
      montant_tva: 0,
      facture_consolidee_id: facture.id,
    })
    .in('id', blIds)
    .eq('client_id', clientId)

  if (upErr) {
    // Best-effort rollback : on remet les lignes sur leur BL d'origine.
    // Pas possible sans tracking de l'origine de chaque ligne ; on
    // remet juste sur le 1er BL pour ne rien perdre.
    await db.from('achats_lignes').update({ facture_id: blIds[0] }).eq('facture_id', facture.id)
    await db.from('achats_factures').delete().eq('id', facture.id)
    throw new Error(`Erreur lors de la mise à zéro des BL : ${upErr.message}`)
  }

  // 5. Audit log
  await db.from('transactions_api').insert({
    client_id: clientId,
    type: 'achats_fusion_bl',
    source: 'liste_achats',
    payload_json: {
      facture_id: facture.id,
      bl_ids: blIds,
      fournisseur: fournisseurNom,
      total_ht: totalHt,
      montant_tva: montantTva,
    },
    user_id: userId,
  })

  return { facture_id: facture.id, bls_fusionnes: blIds.length }
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

/**
 * Cherche un ingrédient existant pour ce client (par nom case-insensitive),
 * sinon le crée. Depuis la migration 2026-05-15, la contrainte unique est
 * scopée par client (`UNIQUE (client_id, nom)`), donc le seul cas de conflit
 * possible est une race condition au sein du même client.
 */
export async function findOrCreateIngredient(
  db: SupabaseClient,
  clientId: string,
  nom: string,
  unite?: string | null,
  prix_kg?: number | null,
) {
  // Convention skalcook : tous les noms d'ingrédients en MAJUSCULES.
  const nomTrim = nom.trim().toUpperCase()
  if (!nomTrim) throw new ValidationError('Nom d\'ingrédient requis.')

  // 1. Existe pour ce client ?
  const { data: existing } = await db
    .from('ingredients')
    .select('id, nom, unite, prix_kg')
    .eq('client_id', clientId)
    .ilike('nom', nomTrim)
    .maybeSingle()
  if (existing) return existing

  // 2. Création
  const { data: created, error } = await db
    .from('ingredients')
    .insert({
      client_id: clientId,
      nom: nomTrim,
      unite: unite || 'kg',
      prix_kg: prix_kg ?? 0,
      est_sous_fiche: false,
    })
    .select('id, nom, unite, prix_kg')
    .single()

  if (error) {
    // Conflit (client_id, nom) — l'ingrédient existe déjà dans cet établissement.
    // En pratique le lookup `ilike` ci-dessus l'aurait trouvé sauf si une autre
    // transaction l'a inséré entre les deux requêtes (race condition).
    if (error.code === '23505' || /duplicate key/i.test(error.message)) {
      throw new ConflictError(`L'ingrédient "${nomTrim}" existe déjà dans votre établissement.`)
    }
    throw new Error(error.message)
  }
  return created
}

export async function createIngredient(
  db: SupabaseClient,
  input: CreateIngredientInput
) {
  const { clientId, nom, unite, prix_kg } = input
  return findOrCreateIngredient(db, clientId, nom, unite, prix_kg)
}

export async function getMercuriale(
  db: SupabaseClient,
  clientId: string,
  dateDebut?: string,
  dateFin?: string,
) {
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

  // Toutes les factures + BL du client (filtrées par période si demandée)
  let facturesQuery = db
    .from('achats_factures')
    .select('id, fournisseur, fournisseur_id, date_facture')
    .eq('client_id', clientId)
  if (dateDebut) facturesQuery = facturesQuery.gte('date_facture', dateDebut)
  if (dateFin)   facturesQuery = facturesQuery.lte('date_facture', dateFin)
  const { data: factures } = await facturesQuery.order('date_facture', { ascending: false })

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
    all_units?: string[]
    is_best?: boolean
  }
  const normUnit = (u: string | null) => (u ?? '').trim().toLowerCase()
  const rows = Object.entries(agg)
    .map(([ingredientId, byFourn]) => {
      const ing = ingredientsById[ingredientId]
      const cols: Record<string, Col> = {}
      let bestPrix: number | null = null
      const allUnitsRow = new Set<string>()

      for (const [fourn, data] of Object.entries(byFourn)) {
        const sorted = data.achats.sort((a, b) => b.date.localeCompare(a.date))
        const prixLast = sorted[0].prix
        const prixMoy = sorted.reduce((s, a) => s + a.prix, 0) / sorted.length
        const uniqueUnits = [...new Set(sorted.map((a) => a.unite ?? '').filter(Boolean))]
        for (const u of uniqueUnits) allUnitsRow.add(normUnit(u))
        cols[fourn] = {
          fournisseur_id: data.fournisseur_id,
          prix_last: Math.round(prixLast * 10000) / 10000,
          prix_moy: Math.round(prixMoy * 10000) / 10000,
          date_last: sorted[0].date,
          nb_achats: sorted.length,
          unite: sorted[0].unite,
          all_units: uniqueUnits.length > 1 ? uniqueUnits : undefined,
        }
        if (bestPrix === null || prixLast < bestPrix) bestPrix = prixLast
      }

      for (const fourn of Object.keys(cols)) {
        cols[fourn].is_best = bestPrix !== null && Math.abs(cols[fourn].prix_last - bestPrix) < 0.001
      }

      // Unités hétérogènes au niveau ligne (plusieurs fournisseurs avec unités différentes)
      const unitsMixed = [...allUnitsRow].filter(Boolean).length > 1

      return {
        ingredient_id: ingredientId,
        ingredient_nom: ing?.nom ?? '—',
        unite: Object.values(byFourn)[0]?.achats[0]?.unite ?? ing?.unite ?? '—',
        units_mixed: unitsMixed,
        all_units: [...allUnitsRow].filter(Boolean),
        cols,
      }
    })
    .sort((a, b) => a.ingredient_nom.localeCompare(b.ingredient_nom))

  return { rows, fournisseurs, allIngredients }
}

export async function getReconciliationData(db: SupabaseClient, clientId: string) {
  const [mappingRes, ingredientsRes, lignesRes] = await Promise.all([
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
    // Dernier taux_tva utilisé par ingrédient (pour pré-remplissage en saisie).
    // On prend les 5000 dernières lignes du client, suffisant pour reconstituer
    // l'historique récent sans faire un coûteux DISTINCT ON par ingrédient.
    db
      .from('achats_lignes')
      .select('ingredient_id, taux_tva, created_at')
      .eq('client_id', clientId)
      .not('ingredient_id', 'is', null)
      .not('taux_tva', 'is', null)
      .order('created_at', { ascending: false })
      .limit(5000),
  ])

  // Pour chaque ingrédient, on garde le taux_tva de la ligne la plus récente.
  const tvaByIngredient: Record<string, number> = {}
  for (const l of lignesRes.data ?? []) {
    const id = (l as { ingredient_id?: string | null }).ingredient_id
    if (!id || id in tvaByIngredient) continue
    const taux = Number((l as { taux_tva?: number | null }).taux_tva)
    if (Number.isFinite(taux) && taux >= 0 && taux <= 100) {
      tvaByIngredient[id] = taux
    }
  }

  return {
    mappings: mappingRes.data ?? [],
    ingredients: ingredientsRes.data ?? [],
    tvaByIngredient,
  }
}
