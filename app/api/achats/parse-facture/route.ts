import Anthropic from '@anthropic-ai/sdk'
import { apiHandler } from '../../../../lib/apiHandler'
import { z } from 'zod'

// Étend le timeout de la function Vercel à 60s (par défaut: 10s sur Hobby,
// 60s déjà max sur Pro sans cette directive). L'OCR Claude peut prendre
// 20-40s sur un PDF multi-pages, sans compter les retries en cas d'erreur
// transitoire.
export const maxDuration = 60

// Instancié lazy à la première requête : assure que process.env.ANTHROPIC_API_KEY
// est bien chargé (utile en dev Turbopack) et permet de retourner une erreur
// claire si la clé manque, au lieu d'un 500 opaque.
let anthropicClient: Anthropic | null = null
function getAnthropic(): Anthropic {
  if (anthropicClient) return anthropicClient
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) throw new Error('ANTHROPIC_API_KEY non défini côté serveur.')
  anthropicClient = new Anthropic({ apiKey: key })
  return anthropicClient
}

// Retry avec backoff exponentiel sur les erreurs transitoires Anthropic :
//   429 = rate limit, 502/503 = bad gateway, 529 = overloaded.
// Ces erreurs sont la cause #1 des "lecture IA échouée" observés en série
// (après plusieurs scans rapprochés).
async function callAnthropicWithRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  let lastErr: unknown
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (err: unknown) {
      lastErr = err
      const e = err as { status?: number; response?: { status?: number } }
      const status = e?.status ?? e?.response?.status
      const isTransient = status === 429 || status === 502 || status === 503 || status === 529
      if (!isTransient || attempt === maxRetries) throw err
      const delayMs = Math.min(1000 * Math.pow(2, attempt), 8000)
      console.warn(`[parse-facture] Erreur transitoire ${status}, retry dans ${delayMs}ms (attempt ${attempt + 1}/${maxRetries})`)
      await new Promise((r) => setTimeout(r, delayMs))
    }
  }
  throw lastErr
}

// Traduit une erreur Anthropic en message clair pour l'UI.
function formatAnthropicError(err: unknown): { status: number; message: string } {
  const e = err as { status?: number; message?: string }
  const status = e?.status ?? 500
  if (status === 429) {
    return { status: 429, message: 'L\'IA est saturée (trop de demandes simultanées). Attendez 10-20 secondes et réessayez.' }
  }
  if (status === 529 || status === 503) {
    return { status: 503, message: 'L\'IA Anthropic est temporairement surchargée. Réessayez dans une minute.' }
  }
  if (status === 401 || status === 403) {
    return { status: 500, message: 'Clé API Anthropic invalide ou expirée — contacte le support.' }
  }
  if (status === 400) {
    return { status: 400, message: `Format de fichier rejeté par l'IA : ${e?.message ?? 'unknown'}` }
  }
  return { status: 500, message: e?.message ?? 'Erreur inconnue côté IA.' }
}

const schema = z.object({
  fileBase64: z.string().min(1, 'fileBase64 requis'),
  mimeType: z.enum(
    ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'],
    { error: 'Type MIME non supporté. Utilisez JPEG, PNG, WebP ou PDF.' }
  ),
  clientId: z.string().uuid(),
})

const PROMPT_EXTRACTION = `Tu analyses un PDF/scan qui peut contenir UNE OU PLUSIEURS factures fournisseur
de restauration française, à la suite dans le même document.

Comment distinguer plusieurs factures :
- Une nouvelle facture commence à chaque fois que tu vois un en-tête "FACTURE N°",
  "FACTURE D'AVOIR", "FACTURE", "AVOIR" suivi d'un nouveau numéro distinct.
- Plusieurs pages qui partagent le MÊME numéro de facture = UNE SEULE facture
  (typiquement les lignes débordent sur une 2ème page, et les totaux HT/TVA/TTC
  sont en bas de la dernière page de cette facture).
- Si tu vois un nouveau numéro de facture / d'avoir, démarre une nouvelle entrée
  dans le tableau "factures".

Extrais les informations et retourne UNIQUEMENT du JSON valide, sans markdown,
sans texte avant ou après.

Format attendu (toujours un array "factures", même s'il n'y en a qu'une) :
{
  "factures": [
    {
      "fournisseur": "Nom du fournisseur (string ou null)",
      "date_facture": "YYYY-MM-DD (string ou null)",
      "numero_facture": "Numéro ou référence de la facture (string ou null)",
      "type": "facture" | "avoir",
      "total_ht_facture": 726.74,
      "total_ttc_facture": 784.15,
      "montant_tva_total": 42.88,
      "montant_taxes_hors_tva": 14.53,
      "lignes": [
        {
          "designation": "Nom du produit tel qu'il apparaît sur la facture",
          "quantite": 5.0,
          "unite": "kg",
          "prix_unitaire_ht": 2.50,
          "montant_ht": 12.50,
          "taux_tva": 5.5
        }
      ]
    }
  ]
}

Règles CRITIQUES :

1. FORMAT NUMÉRIQUE FRANÇAIS : sur ces factures, la virgule est le séparateur DÉCIMAL.
   Exemples : "1,610" → 1.61   "3,22" → 3.22   "2,000" → 2.0   "0,18" → 0.18.
   Renvoie TOUJOURS des nombres JSON avec un point décimal (1.61, 3.22, 2.0).
   Le séparateur de milliers est l'espace ou rien (ex: "1 234,56" → 1234.56).
   Ne confonds JAMAIS "1,610" (= 1.61) avec 1610.

2. TYPE DE DOCUMENT :
   - "avoir" si l'en-tête mentionne "FACTURE D'AVOIR" / "AVOIR" / "NOTE DE CRÉDIT",
     ou si les montants/quantités sont négatifs.
   - "facture" sinon.

3. TOTAUX FACTURE (en bas de la dernière page de chaque facture) :
   - total_ht_facture : "Total HT" ou "Montant HT" du pied de facture (avant TVA).
   - total_ttc_facture : "Total TTC" ou "Net à payer" ou "A payer" du pied.
   - montant_tva_total : "Total TVA" ou "Montant TVA" en euros (pas en %).
   - montant_taxes_hors_tva : "Total taxes hors TVA" / éco-contributions /
     consigne / contributions diverses si présent. Sinon null.
   Si plusieurs taux de TVA sont récapitulés, montant_tva_total est leur SOMME.
   Pour un avoir, ces montants peuvent être négatifs : renvoie-les tels quels.

4. LIGNES DE FACTURE (cherche dans le tableau de CHAQUE facture) :
   - designation : nom du produit comme écrit (ex: "MARJOLAINE EN BOTTE (FRANCE)").
   - quantite : nombre dans la colonne "Qté" / "Quantité".
   - unite : "kg", "g", "L", "mL", "pièce", "carton", etc. Si "U"/"Un"/"Unité" → "pièce".
   - prix_unitaire_ht : colonne "P.U." / "Prix unitaire HT" / "PU HT".
   - montant_ht : colonne "Montant HT" / "Total HT" / "Total ligne" (= qty × P.U.).
     IMPORTANT : si tu lis bien le montant ligne mais pas le P.U., renseigne
     quand même montant_ht. Le serveur dérivera le P.U. = montant_ht / quantite.
   - taux_tva : 5.5 / 10 / 20. Cherche colonnes "Code TVA", "Taux", "TVA" ou
     codes G1/G2/G3 renvoyant à un récap en pied. Sinon null.
   N'inclus PAS de ligne dont la quantité ET le montant sont 0 (lignes vides
   parfois imprimées par les ERP).

5. Si une valeur est absente ou illisible, utilise null.
6. Ne retourne QUE le JSON, rien d'autre. Pas de markdown, pas d'explication.`

export const POST = apiHandler({
  schema,
  guard: 'adminOrSuperadmin',
  clientIdFrom: 'body.clientId',
  handler: async ({ data }) => {
    const { fileBase64, mimeType } = data

    const contentBlock = mimeType === 'application/pdf'
      ? { type: 'document' as const, source: { type: 'base64' as const, media_type: 'application/pdf' as const, data: fileBase64 } }
      : { type: 'image' as const, source: { type: 'base64' as const, media_type: mimeType as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif', data: fileBase64 } }

    let message
    try {
      message = await callAnthropicWithRetry(() => getAnthropic().messages.create({
        model: 'claude-opus-4-7',
        // 8192 : marge pour un PDF multi-factures (1 facture ~ 500-1500 tokens en sortie).
        max_tokens: 8192,
        messages: [
          {
            role: 'user',
            content: [
              contentBlock,
              { type: 'text', text: PROMPT_EXTRACTION },
            ],
          },
        ],
      }))
    } catch (err) {
      const formatted = formatAnthropicError(err)
      console.error('[parse-facture] Erreur Anthropic après retry :', formatted, err)
      return Response.json({ error: formatted.message }, { status: formatted.status })
    }

    // Trouve le premier bloc de type 'text' (évite de planter si un thinking block précède)
    const textBlock = message.content.find((b) => b.type === 'text')
    const rawText = textBlock && 'text' in textBlock ? textBlock.text : ''

    let parsed: Record<string, unknown>
    try {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/)
      if (!jsonMatch) throw new Error('Aucun JSON trouvé dans la réponse')
      parsed = JSON.parse(jsonMatch[0])
    } catch {
      console.error('parse-facture JSON parse error, raw:', rawText.slice(0, 500))
      return Response.json(
        { error: 'Réponse IA non parseable.', raw: rawText.slice(0, 500) },
        { status: 500 }
      )
    }

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
    const processFacture = (raw: FactureRaw) => {
      const lignes = ((raw.lignes as Array<Record<string, unknown>>) || [])
        .filter((l) => l && l.designation)
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

    const factures = rawFactures.map(processFacture)

    // Diagnostic : aide à comprendre les régressions OCR (lignes sans prix).
    const totalLignes = factures.reduce((s, f) => s + f.lignes.length, 0)
    const sansPrix = factures.reduce((s, f) => s + f.lignes.filter((l) => !l.prix_unitaire_ht).length, 0)
    if (sansPrix > 0) {
      console.warn(
        `[parse-facture] ${sansPrix}/${totalLignes} lignes sans prix sur ${factures.length} facture(s).`
      )
    }

    return Response.json({ factures })
  },
})
