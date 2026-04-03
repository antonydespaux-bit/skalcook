import { requireAdminOrSuperadmin, getServiceClient } from '../../../../lib/apiGuards'

export async function POST(request) {
  try {
    const body = await request.json()
    const { clientId, fournisseur, numeroFacture, dateFacture, statut, lignes, fileBase64, fileMime } = body ?? {}

    if (!clientId || !fournisseur || !dateFacture || !Array.isArray(lignes)) {
      return Response.json(
        { error: 'Paramètres manquants : clientId, fournisseur, dateFacture, lignes requis.' },
        { status: 400 }
      )
    }

    const { user, response: authError } = await requireAdminOrSuperadmin(request, clientId)
    if (authError) return authError

    const db = getServiceClient()

    // ── Détection doublon sur numéro de facture ──────────────────────────────
    const numTrimmed = numeroFacture?.trim() || null
    if (numTrimmed && !body.forceInsert) {
      const { data: existingRows } = await db
        .from('achats_factures')
        .select('id, date_facture, fournisseur, total_ht, created_at')
        .eq('client_id', clientId)
        .ilike('numero_facture', numTrimmed)
        .limit(1)

      const existing = existingRows?.[0] ?? null
      if (existing) {
        return Response.json(
          {
            error:    'DUPLICATE_FACTURE',
            existing: {
              id:           existing.id,
              date_facture: existing.date_facture,
              fournisseur:  existing.fournisseur,
              total_ht:     existing.total_ht,
              created_at:   existing.created_at,
            },
          },
          { status: 409 }
        )
      }
    }

    // a) Upsert fournisseur dans la table fournisseurs (créé si inconnu)
    let fournisseurId = null
    const nomFournisseur = fournisseur.trim()
    const { data: existingF } = await db
      .from('fournisseurs')
      .select('id')
      .eq('client_id', clientId)
      .ilike('nom', nomFournisseur)
      .maybeSingle()

    if (existingF) {
      fournisseurId = existingF.id
    } else {
      const { data: newF } = await db
        .from('fournisseurs')
        .insert({ client_id: clientId, nom: nomFournisseur })
        .select('id')
        .single()
      if (newF) fournisseurId = newF.id
    }

    // b) Upload fichier dans Storage (si fourni)
    let fichierUrl = null
    if (fileBase64 && fileMime) {
      try {
        const ext = fileMime === 'application/pdf' ? 'pdf'
          : fileMime === 'image/png' ? 'png'
          : fileMime === 'image/webp' ? 'webp'
          : 'jpg'
        const path = `${clientId}/${Date.now()}.${ext}`
        const buffer = Buffer.from(fileBase64, 'base64')
        const { error: upErr } = await db.storage
          .from('factures')
          .upload(path, buffer, { contentType: fileMime, upsert: false })
        if (upErr) {
          console.warn('Storage upload échoué (non bloquant) :', upErr.message)
        } else {
          fichierUrl = path
        }
      } catch (upEx) {
        console.warn('Storage upload exception (non bloquant) :', upEx.message)
      }
    }

    // c) Insertion achats_factures
    const totalHt = lignes.reduce((s, l) => {
      const r = Number(l.remise) || 0
      return s + (Number(l.quantite) || 0) * Number(l.prix_unitaire_ht) * (1 - r / 100)
    }, 0)
    const { data: facture, error: fErr } = await db
      .from('achats_factures')
      .insert({
        client_id:      clientId,
        fournisseur:    nomFournisseur,
        fournisseur_id: fournisseurId,
        numero_facture: numeroFacture?.trim() || null,
        date_facture:   dateFacture,
        total_ht:       totalHt,
        statut:         statut === 'bl' ? 'bl' : 'facture',
        fichier_url:    fichierUrl,
      })
      .select()
      .single()
    if (fErr) throw new Error(fErr.message)

    // d) Insertion achats_lignes
    const { error: lErr } = await db
      .from('achats_lignes')
      .insert(
        lignes.map(l => {
          const r = Number(l.remise) || 0
          const prixEffectif = Number(l.prix_unitaire_ht) * (1 - r / 100)
          return {
            facture_id:       facture.id,
            client_id:        clientId,
            designation:      l.designation,
            ingredient_id:    l.ingredient_id || null,
            quantite:         Number(l.quantite) || 0,
            unite:            l.unite || null,
            prix_unitaire_ht: prixEffectif,
            remise:           r,
            montant_ht:       (Number(l.quantite) || 0) * prixEffectif,
          }
        })
      )
    if (lErr) {
      // Rollback : supprimer la facture header déjà insérée
      await db.from('achats_factures').delete().eq('id', facture.id)
      throw new Error(lErr.message)
    }

    // c) Mise à jour ingredients.prix_kg pour les lignes cochées
    const toUpdate = lignes.filter(l => l.updatePrice && l.ingredient_id)
    for (const l of toUpdate) {
      const r = Number(l.remise) || 0
      const prixEffectif = Number(l.prix_unitaire_ht) * (1 - r / 100)
      const { error: uErr } = await db
        .from('ingredients')
        .update({ prix_kg: prixEffectif })
        .eq('id', l.ingredient_id)
        .eq('client_id', clientId)
      if (uErr) console.warn('MAJ prix échouée pour', l.designation, ':', uErr.message)
    }

    // d) Journal transactions_api
    await db.from('transactions_api').insert({
      client_id:    clientId,
      type:         'achats_import',
      source:       'facture_upload',
      payload_json: { facture_id: facture.id, lignes_count: lignes.length, prix_maj: toUpdate.length },
      user_id:      user.id,
    })

    // e) Upsert fournisseur_mapping pour les lignes reconnues
    const newMappings = lignes
      .filter(l => l.ingredient_id)
      .map(l => ({
        client_id:               clientId,
        designation_fournisseur: l.designation,
        designation_norm:        normDesig(l.designation),
        ingredient_id:           l.ingredient_id,
        fournisseur:             fournisseur.trim(),
      }))
    if (newMappings.length > 0) {
      await db
        .from('fournisseur_mapping')
        .upsert(newMappings, { onConflict: 'client_id,designation_norm' })
    }

    return Response.json({ facture_id: facture.id, prix_maj: toUpdate.length })
  } catch (err) {
    console.error('save-facture error:', err)
    return Response.json(
      { error: err.message || 'Erreur lors de l\'enregistrement.' },
      { status: 500 }
    )
  }
}

function normDesig(s) {
  if (!s) return ''
  return s
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}
