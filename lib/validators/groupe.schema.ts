import { z } from 'zod'
import { uuidSchema } from './achats.schema'

const dateIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date attendue au format YYYY-MM-DD')
const JOUR_MS = 86_400_000

// Synthèse de la vue groupe sur une période (au plus un an, comme les
// exports de ventes).
export const groupeSyntheseSchema = z.object({
  groupeId: uuidSchema,
  debut:    dateIso,
  fin:      dateIso,
})
  .refine(d => d.fin >= d.debut, { message: 'fin doit être >= debut', path: ['fin'] })
  .refine(d => (Date.parse(d.fin) - Date.parse(d.debut)) / JOUR_MS <= 366, {
    message: 'Période limitée à un an',
    path: ['fin'],
  })

export type GroupeSyntheseInput = z.infer<typeof groupeSyntheseSchema>
