import { apiHandler } from '../../../lib/apiHandler'
import { z } from 'zod'

const rowsSchema = z.array(z.record(z.string(), z.unknown())).optional().default([])

const importSchema = z.object({
  client_id: z.string().uuid(),
  payload: z.object({
    client: z.record(z.string(), z.unknown()).nullable().optional(),
    fournisseurs: rowsSchema,
    fiches_cuisine: rowsSchema,
    fiches_bar: rowsSchema,
    ingredients: rowsSchema,
    ingredients_bar: rowsSchema,
    achats_factures: rowsSchema,
    achats_lignes: rowsSchema,
    inventaires: rowsSchema,
    inventaire_lignes: rowsSchema,
    ventes_journalieres: rowsSchema,
    menus: rowsSchema,
  }),
})

type Row = Record<string, unknown>

export const POST = apiHandler({
  schema: importSchema,
  guard: 'adminOrSuperadmin',
  clientIdFrom: 'body.client_id',
  handler: async ({ data, db }) => {
    const clientId = data.client_id
    const p = data.payload

    // Sécurité : si le payload contient un client.id, il doit correspondre à la cible.
    const importedClientId =
      p.client && typeof (p.client as Row).id === 'string' ? ((p.client as Row).id as string) : null
    if (importedClientId && importedClientId !== clientId) {
      return Response.json(
        {
          error:
            "Le fichier appartient à un autre établissement (client.id différent). Import refusé.",
        },
        { status: 400 }
      )
    }

    // Force client_id sur chaque ligne et upsert par id, dans l'ordre des dépendances.
    const tables: Array<{ name: string; rows: Row[] }> = [
      { name: 'fournisseurs', rows: p.fournisseurs as Row[] },
      { name: 'ingredients', rows: p.ingredients as Row[] },
      { name: 'ingredients_bar', rows: p.ingredients_bar as Row[] },
      { name: 'fiches', rows: p.fiches_cuisine as Row[] },
      { name: 'fiches_bar', rows: p.fiches_bar as Row[] },
      { name: 'menus', rows: p.menus as Row[] },
      { name: 'achats_factures', rows: p.achats_factures as Row[] },
      { name: 'achats_lignes', rows: p.achats_lignes as Row[] },
      { name: 'inventaires', rows: p.inventaires as Row[] },
      { name: 'inventaire_lignes', rows: p.inventaire_lignes as Row[] },
      { name: 'ventes_journalieres', rows: p.ventes_journalieres as Row[] },
    ]

    const report: Record<string, { upserted: number; errors: number; lastError?: string }> = {}

    for (const { name, rows } of tables) {
      if (!rows || rows.length === 0) {
        report[name] = { upserted: 0, errors: 0 }
        continue
      }
      const normalized = rows.map((r) => ({ ...r, client_id: clientId }))
      const batchSize = 200
      let upserted = 0
      let errors = 0
      let lastError: string | undefined
      for (let i = 0; i < normalized.length; i += batchSize) {
        const batch = normalized.slice(i, i + batchSize)
        const { error } = await db.from(name).upsert(batch, { onConflict: 'id' })
        if (error) {
          errors += batch.length
          lastError = error.message
        } else {
          upserted += batch.length
        }
      }
      report[name] = { upserted, errors, ...(lastError ? { lastError } : {}) }
    }

    const totalUpserted = Object.values(report).reduce((s, r) => s + r.upserted, 0)
    const totalErrors = Object.values(report).reduce((s, r) => s + r.errors, 0)

    return Response.json({
      ok: true,
      total_upserted: totalUpserted,
      total_errors: totalErrors,
      report,
    })
  },
})
