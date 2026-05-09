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

const PROMPT_EXTRACTION = `Tu analyses une photo ou scan d'une facture fournisseur de restauration.
Extrais les informations suivantes et retourne UNIQUEMENT du JSON valide, sans markdown, sans texte avant ou après.

Format attendu :
{
  "fournisseur": "Nom du fournisseur (string ou null)",
  "date_facture": "YYYY-MM-DD (string ou null)",
  "numero_facture": "Numéro ou référence de la facture (string ou null)",
  "montant_tva_total": 33.50,
  "lignes": [
    {
      "designation": "Nom du produit tel qu'il apparaît sur la facture",
      "quantite": 5.0,
      "unite": "kg",
      "prix_unitaire_ht": 2.50,
      "taux_tva": 5.5
    }
  ]
}

Règles :
- unite doit être l'unité standard la plus proche (kg, g, L, mL, pièce, carton, etc.)
- prix_unitaire_ht est le prix HT PAR UNITÉ (pas le total de la ligne)
- taux_tva est le taux de TVA applicable à la ligne en pourcentage (ex: 5.5 pour 5,5%, 10 pour 10%, 20 pour 20%).
  Beaucoup de factures alimentaires distinguent plusieurs taux (5,5% pour les denrées,
  10% pour la restauration sur place, 20% pour le non-alimentaire). Cherche les
  colonnes "Code TVA", "Taux", "TVA" ou les codes G1/G2/G3 qui renvoient à un
  tableau récap en pied de page. Si tu ne peux pas le déduire, utilise null.
- montant_tva_total est le total de la TVA en euros tel qu'il apparaît au pied
  de la facture (ligne "Montant TVA" ou "Total TVA"). Quand il y a plusieurs
  taux, c'est la somme des TVA par taux. Pas en pourcentage. Si absent, null.
- Si une valeur est absente ou illisible, utilise null
- Ne retourne QUE le JSON, rien d'autre`

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
      model: 'claude-opus-4-5',
      max_tokens: 2048,
      messages: [
        {
          role: 'user',
          content: [
            contentBlock,
            { type: 'text', text: PROMPT_EXTRACTION },
          ],
        },
      ],
    })

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

    const lignes = ((parsed.lignes as Array<Record<string, unknown>>) || [])
      .filter((l) => l && l.designation)
      .map((l) => {
        const tauxRaw = l.taux_tva
        const taux = tauxRaw == null ? null : Number(tauxRaw)
        return {
          designation: String(l.designation ?? '').trim(),
          quantite: Number(l.quantite) || 1,
          unite: String(l.unite ?? '').trim() || null,
          prix_unitaire_ht: Number(l.prix_unitaire_ht) || 0,
          taux_tva: taux != null && Number.isFinite(taux) && taux >= 0 && taux <= 100 ? taux : null,
        }
      })

    // Filtre date_facture : on n'accepte que YYYY-MM-DD valide, sinon null
    // (évite que Claude renvoie "hier" ou "2024-13-45" et fasse péter l'insert)
    const rawDate = (parsed.date_facture as string) ?? null
    const dateFactureValide = rawDate && /^\d{4}-\d{2}-\d{2}$/.test(rawDate) && !Number.isNaN(Date.parse(rawDate))
      ? rawDate
      : null

    const tvaTotalRaw = parsed.montant_tva_total
    const tvaTotal = tvaTotalRaw == null ? null : Number(tvaTotalRaw)
    const montantTvaTotal = tvaTotal != null && Number.isFinite(tvaTotal) && tvaTotal >= 0 ? tvaTotal : null

    return Response.json({
      fournisseur: (parsed.fournisseur as string) ?? null,
      date_facture: dateFactureValide,
      numero_facture: (parsed.numero_facture as string) ?? null,
      montant_tva_total: montantTvaTotal,
      lignes,
    })
  },
})
