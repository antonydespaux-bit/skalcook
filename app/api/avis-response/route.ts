import Anthropic from '@anthropic-ai/sdk'
import { apiHandler } from '../../../lib/apiHandler'
import { z } from 'zod'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const schema = z.object({
  reviewText: z.string().min(1, 'Texte de l\'avis requis'),
  stars: z.coerce.number().min(1).max(5),
  section: z.enum(['bar', 'restaurant', 'cuisine']).default('restaurant'),
})

export const POST = apiHandler({
  schema,
  guard: 'authenticated',
  handler: async ({ data }) => {
    const { reviewText, stars, section } = data
    const nomEtablissement = section === 'bar' ? 'notre bar' : 'notre restaurant'

    const message = await anthropic.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: `Tu es le propriétaire de "${nomEtablissement}" à Paris, un établissement haut de gamme.
Un client a écrit cet avis (${stars}/5 étoiles) : "${reviewText}"

Instructions :
- Détecte la langue de l'avis et réponds dans CETTE MÊME langue
- Ton chaleureux, professionnel et élégant
- 3 à 4 phrases maximum
- Ne commence pas par "Cher client" ou "Dear customer"
- Si l'avis est négatif, reconnais le problème et propose une solution concrète
- Si l'avis est positif, remercie sincèrement et invite à revenir
- Style 5 étoiles, hôtel de luxe`,
        },
      ],
    })

    return Response.json({ response: (message.content[0] as { text: string }).text })
  },
})
