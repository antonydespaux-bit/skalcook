/**
 * Renommer un utilisateur depuis /admin (admin du client ou superadmin).
 *
 * - Vérifie que l'utilisateur appartient bien au client (sinon 403).
 * - Upsert dans `profils` : update si la ligne existe, insert sinon.
 * - Met à jour `auth.users.user_metadata.nom` pour garder la source
 *   d'auth cohérente.
 * - L'endpoint tolère les users sans ligne `profils` existante, ce qui
 *   résout le cas où la liste affichait '—' faute de profils row.
 */

import { apiHandler } from '../../../../lib/apiHandler'
import { z } from 'zod'

const schema = z.object({
  client_id: z.string().uuid(),
  user_id:   z.string().uuid(),
  nom:       z.string().min(1, 'Nom requis').max(255),
})

export const POST = apiHandler({
  schema,
  guard: 'adminOrSuperadmin',
  clientIdFrom: 'body.client_id',
  handler: async ({ data, db }) => {
    const nom = data.nom.trim()
    if (!nom) {
      return Response.json({ error: 'Nom requis.' }, { status: 400 })
    }

    // 1. Sécurité : le user doit bien être membre de ce client.
    const { data: acces, error: accesErr } = await db
      .from('acces_clients')
      .select('user_id, role')
      .eq('user_id', data.user_id)
      .eq('client_id', data.client_id)
      .maybeSingle()

    if (accesErr) throw new Error(accesErr.message)
    if (!acces) {
      return Response.json(
        { error: "Cet utilisateur n'appartient pas à cet établissement." },
        { status: 403 }
      )
    }

    // 2. Récupère l'email depuis auth.users (source de vérité pour l'email).
    const { data: authRes } = await db.auth.admin.getUserById(data.user_id)
    const email = authRes?.user?.email ?? null
    const existingMetadata = (authRes?.user?.user_metadata as Record<string, unknown> | undefined) ?? {}

    // 3. Upsert dans profils (onConflict sur l'id = clé primaire).
    //    - Si la ligne existe déjà, on met à jour seulement `nom`.
    //    - Sinon, on la crée avec les infos disponibles.
    const { data: existing } = await db
      .from('profils')
      .select('id')
      .eq('id', data.user_id)
      .maybeSingle()

    if (existing) {
      const { error } = await db
        .from('profils')
        .update({ nom })
        .eq('id', data.user_id)
      if (error) throw new Error(error.message)
    } else {
      const { error } = await db
        .from('profils')
        .insert({
          id: data.user_id,
          nom,
          email,
          role: acces.role ?? 'cuisine',
          client_id: data.client_id,
        })
      if (error) throw new Error(error.message)
    }

    // 4. Met aussi à jour user_metadata.nom (source secondaire utilisée en
    //    fallback par listClientUsers).
    await db.auth.admin.updateUserById(data.user_id, {
      user_metadata: { ...existingMetadata, nom },
    }).catch(() => null)

    return Response.json({ ok: true, nom })
  },
})
