import Anthropic from '@anthropic-ai/sdk'
import { apiHandler } from '../../../../lib/apiHandler'
import { z } from 'zod'

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

const schema = z.object({
  fileBase64: z.string().min(1, 'fileBase64 requis'),
  mimeType: z.enum(
    ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'],
    { error: 'Type MIME non supporté. Utilisez JPEG, PNG, WebP ou PDF.' }
  ),
  clientId: z.string().uuid(),
})

const PROMPT_EXTRACTION = `Tu analyses une photo ou scan d'une facture fournisseur de restauration française.
La facture peut faire PLUSIEURS PAGES : les lignes sont sur les premières pages,
les TOTAUX (HT, TVA, TTC) sont en bas de la DERNIÈRE PAGE. Lis tout le document.

Extrais les informations suivantes et retourne UNIQUEMENT du JSON valide,
sans markdown, sans texte avant ou après.

Format attendu :
{
  "fournisseur": "Nom du fournisseur (string ou null)",
  "date_facture": "YYYY-MM-DD (string ou null)",
  "numero_facture": "Numéro ou référence de la facture (string ou null)",
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

Règles CRITIQUES :

1. FORMAT NUMÉRIQUE FRANÇAIS : sur ces factures, la virgule est le séparateur DÉCIMAL.
   Exemples : "1,610" → 1.61   "3,22" → 3.22   "2,000" → 2.0   "0,18" → 0.18.
   Renvoie TOUJOURS des nombres JSON avec un point décimal (1.61, 3.22, 2.0).
   Le séparateur de milliers est l'espace ou rien (ex: "1 234,56" → 1234.56).
   Ne confonds JAMAIS "1,610" (= 1.61) avec 1610.

2. TOTAUX FACTURE (en bas de la dernière page, sous le tableau des lignes) :
   - total_ht_facture : "Total HT" ou "Montant HT" du pied de facture (avant TVA).
   - total_ttc_facture : "Total TTC" ou "Net à payer" ou "A payer" du pied.
   - montant_tva_total : "Total TVA" ou "Montant TVA" en euros (pas en %).
   - montant_taxes_hors_tva : "Total taxes hors TVA" / éco-contributions /
     consigne / contributions diverses si présent. Sinon null.
   Si plusieurs taux de TVA sont récapitulés, montant_tva_total est leur SOMME.

3. LIGNES DE FACTURE (cherche dans tout le tableau, sur toutes les pages) :
   - designation : nom du produit comme écrit (ex: "MARJOLAINE EN BOTTE (FRANCE)").
   - quantite : nombre dans la colonne "Qté" / "Quantité".
   - unite : "kg", "g", "L", "mL", "pièce", "carton", etc. Si "U"/"Un"/"Unité" → "pièce".
   - prix_unitaire_ht : colonne "P.U." / "Prix unitaire HT" / "PU HT".
   - montant_ht : colonne "Montant HT" / "Total HT" / "Total ligne" (= qty × P.U.).
     IMPORTANT : si tu lis bien le montant ligne mais pas le P.U., renseigne
     quand même montant_ht. Le serveur dérivera le P.U. = montant_ht / quantite.
   - taux_tva : 5.5 / 10 / 20. Cherche colonnes "Code TVA", "Taux", "TVA" ou
     codes G1/G2/G3 renvoyant à un récap en pied. Sinon null.

4. Si une valeur est absente ou illisible, utilise null.
5. Ne retourne QUE le JSON, rien d'autre. Pas de markdown, pas d'explication.`

export const POST = apiHandler({
  schema,
  guard: 'adminOrSuperadmin',
  clientIdFrom: 'body.clientId',
  handler: async ({ data }) => {
    const { fileBase64, mimeType } = data

    const contentBlock = mimeType === 'application/pdf'
      ? { type: 'document' as const, source: { type: 'base64' as const, media_type: 'application/pdf' as const, data: fileBase64 } }
      : { type: 'image' as const, source: { type: 'base64' as const, media_type: mimeType as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif', data: fileBase64 } }

    const message = await getAnthropic().messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: [
            contentBlock,
            { type: 'text', text: PROMPT_EXTRACTION },
          ],
        },
        // Prefill : force la sortie en JSON pur dès le premier token
        // (évite que le modèle ouvre par "Voici le JSON :" ou un bloc markdown).
        { role: 'assistant', content: '{' },
      ],
    })

    // Trouve le premier bloc de type 'text' (évite de planter si un thinking block précède)
    const textBlock = message.content.find((b) => b.type === 'text')
    // Le prefill "{" n'est PAS dans message.content → on le rajoute pour parser.
    const rawText = '{' + (textBlock && 'text' in textBlock ? textBlock.text : '')

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
      const puVerite = montantHt != null && qte > 0 ? montantHt / qte : null
      if (puIA != null && puVerite != null) {
        const ecart = Math.abs(puIA - puVerite) / Math.max(puVerite, 0.01)
        return ecart < 0.05 ? puIA : puVerite
      }
      return puIA ?? puVerite ?? 0
    }

    const lignes = ((parsed.lignes as Array<Record<string, unknown>>) || [])
      .filter((l) => l && l.designation)
      .map((l) => {
        const tauxRaw = l.taux_tva
        const taux = tauxRaw == null ? null : Number(tauxRaw)
        const quantite = Number(l.quantite) || 1
        const puRaw = Number(l.prix_unitaire_ht)
        const montantHtRaw = Number(l.montant_ht)
        const puIA = Number.isFinite(puRaw) && puRaw > 0 ? puRaw : null
        const montantHt = Number.isFinite(montantHtRaw) && montantHtRaw > 0 ? montantHtRaw : null
        const prixUnitaire = resolvePrixUnitaire(puIA, montantHt, quantite)
        return {
          designation: String(l.designation ?? '').trim(),
          quantite,
          unite: String(l.unite ?? '').trim() || null,
          prix_unitaire_ht: prixUnitaire,
          taux_tva: taux != null && Number.isFinite(taux) && taux >= 0 && taux <= 100 ? taux : null,
        }
      })

    // Diagnostic : aide à comprendre les régressions OCR (lignes sans prix).
    const sansPrix = lignes.filter((l) => !l.prix_unitaire_ht).length
    if (sansPrix > 0) {
      console.warn(
        `[parse-facture] ${sansPrix}/${lignes.length} lignes sans prix.`,
        'Échantillon brut:',
        JSON.stringify(((parsed.lignes as unknown[]) || []).slice(0, 3))
      )
    }

    // Filtre date_facture : on n'accepte que YYYY-MM-DD valide, sinon null
    // (évite que Claude renvoie "hier" ou "2024-13-45" et fasse péter l'insert)
    const rawDate = (parsed.date_facture as string) ?? null
    const dateFactureValide = rawDate && /^\d{4}-\d{2}-\d{2}$/.test(rawDate) && !Number.isNaN(Date.parse(rawDate))
      ? rawDate
      : null

    const sanitizeMontant = (v: unknown): number | null => {
      if (v == null) return null
      const n = Number(v)
      return Number.isFinite(n) && n >= 0 ? n : null
    }
    const montantTvaTotal = sanitizeMontant(parsed.montant_tva_total)
    const totalHtFacture = sanitizeMontant(parsed.total_ht_facture)
    const totalTtcFacture = sanitizeMontant(parsed.total_ttc_facture)
    const montantTaxesHorsTva = sanitizeMontant(parsed.montant_taxes_hors_tva)

    return Response.json({
      fournisseur: (parsed.fournisseur as string) ?? null,
      date_facture: dateFactureValide,
      numero_facture: (parsed.numero_facture as string) ?? null,
      montant_tva_total: montantTvaTotal,
      total_ht_facture: totalHtFacture,
      total_ttc_facture: totalTtcFacture,
      montant_taxes_hors_tva: montantTaxesHorsTva,
      lignes,
    })
  },
})
