import { apiHandler } from '../../../lib/apiHandler'
import { z } from 'zod'

const querySchema = z.object({
  client_id: z.string().uuid(),
})

export const GET = apiHandler({
  schema: querySchema,
  guard: 'memberOfClient',
  clientIdFrom: 'body.client_id',
  handler: async ({ data, db }) => {
    const clientId = data.client_id

    // Load ALL data in parallel for RGPD portability export (Article 20)
    const [
      clientRes, fichesCuisineRes, fichesBarRes,
      ingredientsRes, ingredientsBarRes,
      facturesRes, lignesAchatRes,
      inventairesRes, inventaireLignesRes,
      ventesRes, menusRes, fournisseursRes,
    ] = await Promise.all([
      db.from('clients').select('*').eq('id', clientId).maybeSingle(),
      db.from('fiches').select('*').eq('client_id', clientId),
      db.from('fiches_bar').select('*').eq('client_id', clientId),
      db.from('ingredients').select('*').eq('client_id', clientId),
      db.from('ingredients_bar').select('*').eq('client_id', clientId),
      db.from('achats_factures').select('*').eq('client_id', clientId),
      db.from('achats_lignes').select('*').eq('client_id', clientId),
      db.from('inventaires').select('*').eq('client_id', clientId),
      db.from('inventaire_lignes').select('*').eq('client_id', clientId),
      db.from('ventes_journalieres').select('*').eq('client_id', clientId),
      db.from('menus').select('*').eq('client_id', clientId),
      db.from('fournisseurs').select('*').eq('client_id', clientId),
    ])

    const exportData = {
      exported_at: new Date().toISOString(),
      format_version: '2.0',
      client: clientRes.data,
      fiches_cuisine: fichesCuisineRes.data ?? [],
      fiches_bar: fichesBarRes.data ?? [],
      ingredients: ingredientsRes.data ?? [],
      ingredients_bar: ingredientsBarRes.data ?? [],
      achats_factures: facturesRes.data ?? [],
      achats_lignes: lignesAchatRes.data ?? [],
      inventaires: inventairesRes.data ?? [],
      inventaire_lignes: inventaireLignesRes.data ?? [],
      ventes_journalieres: ventesRes.data ?? [],
      menus: menusRes.data ?? [],
      fournisseurs: fournisseursRes.data ?? [],
    }

    return new Response(JSON.stringify(exportData, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="skalcook-export-${clientId}.json"`,
      },
    })
  },
})
