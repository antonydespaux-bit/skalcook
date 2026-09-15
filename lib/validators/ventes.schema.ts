import { z } from 'zod'
import { clientIdSchema, uuidSchema } from './achats.schema'

const dateIsoSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format YYYY-MM-DD attendu')

// Import des ventes (depuis VentesImporter) : lignes de ventes journalières
// + correspondances désignation → fiche à mémoriser. Passe par le service
// client côté serveur pour que les superadmins (hors acces_clients) puissent
// écrire, la RLS n'autorisant que les membres du client.
export const ventesImportSchema = z.object({
  client_id: clientIdSchema,
  ventes: z.array(z.object({
    jour:            dateIsoSchema,
    fiche_id:        uuidSchema,
    quantite_vendue: z.coerce.number(),
    prix_vente_net:  z.coerce.number().nullable().optional(),
  })).max(5000, 'Trop de lignes (max 5000)').default([]),
  mappings: z.array(z.object({
    designation_lightspeed: z.string().min(1),
    designation_norm:       z.string().min(1),
    fiche_id:               uuidSchema,
    source_table:           z.string().min(1),
  })).min(1, 'Au moins une correspondance').max(5000, 'Trop de correspondances (max 5000)'),
})

export type VentesImportInput = z.infer<typeof ventesImportSchema>
