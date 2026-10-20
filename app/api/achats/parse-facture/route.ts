import Anthropic from '@anthropic-ai/sdk'
import { apiHandler } from '../../../../lib/apiHandler'
import { z } from 'zod'
import { normaliserFactures } from '../../../../lib/services/parseFacture'

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
// Le SDK Anthropic expose le détail dans `err.error.message` quand le serveur
// renvoie un payload structuré (invalid_request_error, billing, etc.).
function formatAnthropicError(err: unknown): { status: number; message: string } {
  const e = err as {
    status?: number
    message?: string
    error?: { type?: string; message?: string }
  }
  const status = e?.status ?? 500
  const innerMessage = e?.error?.message ?? e?.message ?? ''
  const innerLower = innerMessage.toLowerCase()

  // Crédits Anthropic épuisés → Anthropic renvoie 400/invalid_request_error
  // mais ce n'est PAS un problème de format de fichier. On distingue pour
  // éviter d'envoyer le user chercher un bug côté PDF.
  if (innerLower.includes('credit balance') || innerLower.includes('billing')) {
    return {
      status: 402,
      message: 'Crédits Anthropic épuisés — l\'administrateur doit recharger le compte sur console.anthropic.com (Plans & Billing).',
    }
  }

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
    // Vrai 400 : payload mal formé (PDF illisible, taille, type MIME). On
    // n'inclut PAS le message brut d'Anthropic — il dump souvent tout le
    // JSON du body et confond l'utilisateur.
    return { status: 400, message: 'Format de fichier rejeté par l\'IA — PDF illisible ou non supporté.' }
  }
  return { status: 500, message: 'Erreur inconnue côté IA.' }
}

// 7 MB de base64 ≈ 5 MB de fichier brut. Garde-fou anti-DoS : un base64 de
// plusieurs centaines de MB ferait exploser la mémoire de la function avant
// même d'arriver à Claude (qui rejette de toute façon au-delà de 5 MB image
// ou 32 MB PDF). Marge confortable pour des PDF de factures multi-pages.
const MAX_BASE64_LENGTH = 7_000_000

const schema = z.object({
  fileBase64: z.string()
    .min(1, 'fileBase64 requis')
    .max(MAX_BASE64_LENGTH, 'Fichier trop volumineux (max ≈ 5 MB).'),
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

Format attendu (toujours un array "factures", même s'il n'y en a qu'une).
Pour aller vite, chaque ligne est un TABLEAU compact (pas un objet), dans cet ordre :
[designation, quantite, unite, prix_unitaire_ht, montant_ht, taux_tva]
{"factures":[{"fournisseur":"…","date_facture":"YYYY-MM-DD","numero_facture":"…","type":"facture","total_ht_facture":726.74,"total_ttc_facture":784.15,"montant_tva_total":42.88,"montant_taxes_hors_tva":null,
"lignes":[["MARJOLAINE EN BOTTE (FRANCE)",5,"pièce",2.5,12.5,5.5],["OIGNON BLANC / KG",3.06,"kg",2.23,6.82,5.5]]}]}
JSON sur une seule ligne, sans indentation ni espaces superflus.

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
  guard: 'permission',
  permission: { fonctionnalite: 'achats', niveau: 'modification' },
  clientIdFrom: 'body.clientId',
  handler: async ({ data }) => {
    const { fileBase64, mimeType } = data

    const contentBlock = mimeType === 'application/pdf'
      ? { type: 'document' as const, source: { type: 'base64' as const, media_type: 'application/pdf' as const, data: fileBase64 } }
      : { type: 'image' as const, source: { type: 'base64' as const, media_type: mimeType as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif', data: fileBase64 } }

    let message
    try {
      message = await callAnthropicWithRetry(() => getAnthropic().messages.create({
        // Sonnet 5.5 + lignes en tableaux compacts : mesuré le 2026-10-20 sur
        // une facture de 33 lignes (Vergers Saint-Eustache), 10 s au lieu de
        // 43 s avec Sonnet 4.6 et des lignes en objets, pour des montants
        // identiques à la ligne près. Le temps est dominé par les tokens de
        // sortie : le format compact les divise par ~2.
        model: 'claude-sonnet-5-5',
        // Marge pour un PDF multi-factures (une facture ≈ 200 à 2 000 tokens en sortie).
        max_tokens: 16000,
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
      // On log seulement status + message ; l'objet err complet d'Anthropic peut
      // contenir des fragments de prompt système ou des headers internes.
      const e = err as { status?: number; message?: string }
      console.error('[parse-facture] Erreur Anthropic après retry :', {
        status: e?.status ?? null,
        message: e?.message?.slice(0, 200) ?? null,
        formatted,
      })
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

    const factures = normaliserFactures(parsed)

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
