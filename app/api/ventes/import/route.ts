import { apiHandler } from '../../../../lib/apiHandler'
import { ventesImportSchema } from '../../../../lib/validators/ventes.schema'

// Import des ventes : écrit via le service client (bypass RLS) après contrôle
// d'accès. Le guard memberOfClient laisse passer les superadmins, qui ne sont
// pas dans acces_clients mais gèrent les établissements.
export const POST = apiHandler({
  schema: ventesImportSchema,
  guard: 'memberOfClient',
  clientIdFrom: 'body.client_id',
  handler: async ({ data, db }) => {
    const { client_id, ventes, mappings } = data

    // client_id forcé côté serveur (jamais celui, potentiellement falsifié, des lignes).
    if (ventes.length > 0) {
      const rows = ventes.map((v) => ({
        jour: v.jour,
        fiche_id: v.fiche_id,
        quantite_vendue: v.quantite_vendue,
        prix_vente_net: v.prix_vente_net ?? null,
        client_id,
      }))
      const { error } = await db.from('ventes_journalieres').insert(rows)
      if (error) throw new Error(error.message)
    }

    const mapRows = mappings.map((m) => ({
      client_id,
      designation_lightspeed: m.designation_lightspeed,
      designation_norm: m.designation_norm,
      fiche_id: m.fiche_id,
      source_table: m.source_table,
    }))
    const { error: mErr } = await db
      .from('mapping_ventes')
      .upsert(mapRows, { onConflict: 'client_id,designation_norm' })
    if (mErr) throw new Error(mErr.message)

    return Response.json({ ok: true, ventes: ventes.length, mappings: mappings.length })
  },
})
