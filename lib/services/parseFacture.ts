// Normalisation de la réponse de l'IA pour /api/achats/parse-facture :
// factures (une ou plusieurs par document), lignes compactes ou objets, prix
// unitaire déduit du montant ligne si besoin, montants en valeur absolue (le
// signe d'un avoir est porté par « statut »). Testé dans
// lib/__tests__/parseFacture.test.ts.

export function normaliserFactures(parsed: Record<string, unknown>) {
  // Décide du prix unitaire HT à partir de ce que Claude a renvoyé :
  //   - prix_unitaire_ht (P.U.) ET/OU montant_ht (total ligne)
  //
  // Stratégie :
  //   1. Si on a montant_ht et quantite > 0, calcule le PU "vérité" = montant_ht / quantite.
  //   2. Si on a aussi un PU IA :
  //      - les deux sont cohérents (écart < 5%) → on prend le PU IA (plus précis sur les centimes).
  //      - sinon (ex: l'IA a lu "1,610" comme 1610 au lieu de 1.61) → on prend le PU "vérité".
  //   3. Si on n'a que le PU IA → on l'utilise tel quel.
  //   4. Si on n'a rien → 0.
  const resolvePrixUnitaire = (puIA: number | null, montantHt: number | null, qte: number) => {
    // On raisonne en valeur absolue pour gérer les avoirs (montants négatifs)
    // sans rejeter les lignes valides.
    const puVerite = montantHt != null && qte !== 0 ? montantHt / qte : null
    const puIAAbs = puIA != null ? Math.abs(puIA) : null
    const puVeriteAbs = puVerite != null ? Math.abs(puVerite) : null
    if (puIAAbs != null && puVeriteAbs != null) {
      const ecart = Math.abs(puIAAbs - puVeriteAbs) / Math.max(puVeriteAbs, 0.01)
      return ecart < 0.05 ? puIAAbs : puVeriteAbs
    }
    return puIAAbs ?? puVeriteAbs ?? 0
  }

  const sanitizeMontant = (v: unknown): number | null => {
    if (v == null) return null
    const n = Number(v)
    // On accepte les négatifs pour les avoirs ; le signe est porté par "type".
    return Number.isFinite(n) ? n : null
  }

  type FactureRaw = Record<string, unknown>
  // Lignes compactes [designation, quantite, unite, PU, montant, TVA] (format
  // demandé) ; un objet reste accepté si l'IA revient à l'ancien format.
  const COLONNES_LIGNE = ['designation', 'quantite', 'unite', 'prix_unitaire_ht', 'montant_ht', 'taux_tva'] as const
  const versObjet = (l: unknown): Record<string, unknown> | null => {
    if (Array.isArray(l)) return Object.fromEntries(COLONNES_LIGNE.map((k, i) => [k, l[i] ?? null]))
    return l && typeof l === 'object' ? (l as Record<string, unknown>) : null
  }

  const processFacture = (raw: FactureRaw) => {
    const lignes = ((raw.lignes as unknown[]) || [])
      .map(versObjet)
      .filter((l): l is Record<string, unknown> => !!l && !!l.designation)
      .map((l) => {
        const tauxRaw = l.taux_tva
        const taux = tauxRaw == null ? null : Number(tauxRaw)
        const quantite = Math.abs(Number(l.quantite) || 1)
        const puRaw = Number(l.prix_unitaire_ht)
        const montantHtRaw = Number(l.montant_ht)
        const puIA = Number.isFinite(puRaw) && puRaw !== 0 ? puRaw : null
        const montantHt = Number.isFinite(montantHtRaw) && montantHtRaw !== 0 ? montantHtRaw : null
        const prixUnitaire = resolvePrixUnitaire(puIA, montantHt, quantite)
        return {
          designation: String(l.designation ?? '').trim(),
          quantite,
          unite: String(l.unite ?? '').trim() || null,
          prix_unitaire_ht: prixUnitaire,
          taux_tva: taux != null && Number.isFinite(taux) && taux >= 0 && taux <= 100 ? taux : null,
        }
      })

    // Filtre date_facture : on n'accepte que YYYY-MM-DD valide, sinon null
    // (évite que Claude renvoie "hier" ou "2024-13-45" et fasse péter l'insert)
    const rawDate = (raw.date_facture as string) ?? null
    const dateFactureValide = rawDate && /^\d{4}-\d{2}-\d{2}$/.test(rawDate) && !Number.isNaN(Date.parse(rawDate))
      ? rawDate
      : null

    // statut métier côté UI : 'avoir' si Claude a marqué le doc comme avoir,
    // ou si tous les totaux sont négatifs. Sinon 'facture'.
    const typeRaw = String(raw.type ?? '').toLowerCase()
    const totalHtRaw = sanitizeMontant(raw.total_ht_facture)
    const isAvoir = typeRaw === 'avoir' || (totalHtRaw != null && totalHtRaw < 0)

    return {
      fournisseur: (raw.fournisseur as string) ?? null,
      date_facture: dateFactureValide,
      numero_facture: (raw.numero_facture as string) ?? null,
      statut: (isAvoir ? 'avoir' : 'facture') as 'avoir' | 'facture',
      // Les montants sont retournés en valeur absolue : le statut 'avoir'
      // suffit côté save-facture pour appliquer le signe négatif.
      montant_tva_total: totalHtRaw != null ? Math.abs(sanitizeMontant(raw.montant_tva_total) ?? 0) || null : sanitizeMontant(raw.montant_tva_total),
      total_ht_facture: totalHtRaw != null ? Math.abs(totalHtRaw) : null,
      total_ttc_facture: (() => {
        const v = sanitizeMontant(raw.total_ttc_facture)
        return v != null ? Math.abs(v) : null
      })(),
      montant_taxes_hors_tva: (() => {
        const v = sanitizeMontant(raw.montant_taxes_hors_tva)
        return v != null ? Math.abs(v) : null
      })(),
      lignes,
    }
  }

  // L'IA peut renvoyer soit { factures: [...] } (nouveau format multi-factures),
  // soit l'ancien format à plat { fournisseur, lignes, ... }. On normalise vers
  // un array dans tous les cas pour que le client n'ait qu'un code à gérer.
  const rawFactures: FactureRaw[] = Array.isArray(parsed.factures)
    ? (parsed.factures as FactureRaw[])
    : [parsed as FactureRaw]

  return rawFactures.map(processFacture)
}
