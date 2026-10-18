import { apiHandler } from '../../../../lib/apiHandler'
import { permissionsQuerySchema, savePermissionsSchema } from '../../../../lib/validators/admin.schema'
import { logServeur } from '../../../../lib/serverLog'
import { ecartsAStocker } from '../../../../lib/permissions'

// Matrice des droits d'un établissement (superadmin uniquement).
// GET  ?clientId=…  → écarts stockés + groupe de l'établissement
// POST { clientId, matrice, copierVersGroupe? } → remplace les écarts
export const GET = apiHandler({
  schema: permissionsQuerySchema,
  guard: 'superadmin',
  handler: async ({ data, db }) => {
    const [{ data: lignes, error }, { data: client, error: cErr }] = await Promise.all([
      db.from('permissions_roles').select('role, fonctionnalite, niveau').eq('client_id', data.clientId),
      db.from('clients').select('id, nom_etablissement, groupe_id').eq('id', data.clientId).maybeSingle(),
    ])
    if (error) throw new Error(error.message)
    if (cErr) throw new Error(cErr.message)
    let autresDuGroupe: { id: string; nom_etablissement: string | null }[] = []
    if (client?.groupe_id) {
      const { data: autres } = await db.from('clients').select('id, nom_etablissement')
        .eq('groupe_id', client.groupe_id).neq('id', data.clientId)
      autresDuGroupe = autres ?? []
    }
    return Response.json({ lignes: lignes ?? [], client, autresDuGroupe })
  },
})

export const POST = apiHandler({
  schema: savePermissionsSchema,
  guard: 'superadmin',
  handler: async ({ data, user, db, request }) => {
    const ecarts = ecartsAStocker(data.matrice) as { role: string; fonctionnalite: string; niveau: string }[]

    let cibles = [data.clientId]
    if (data.copierVersGroupe) {
      const { data: client } = await db.from('clients').select('groupe_id').eq('id', data.clientId).maybeSingle()
      if (client?.groupe_id) {
        const { data: autres } = await db.from('clients').select('id').eq('groupe_id', client.groupe_id)
        cibles = [...new Set([data.clientId, ...(autres ?? []).map((c: { id: string }) => c.id)])]
      }
    }

    for (const clientId of cibles) {
      const { error: delErr } = await db.from('permissions_roles').delete().eq('client_id', clientId)
      if (delErr) throw new Error(delErr.message)
      if (ecarts.length) {
        const { error: insErr } = await db.from('permissions_roles')
          .insert(ecarts.map((e) => ({ ...e, client_id: clientId })))
        if (insErr) throw new Error(insErr.message)
      }
      await logServeur(db, {
        user, clientId, action: 'MODIFICATION', entite: 'permissions_roles', request,
        entiteNom: 'Droits par rôle', details: { ecarts: ecarts.length, depuis: clientId === data.clientId ? null : data.clientId },
      })
    }
    return Response.json({ ok: true, ecarts: ecarts.length, etablissements: cibles.length })
  },
})
