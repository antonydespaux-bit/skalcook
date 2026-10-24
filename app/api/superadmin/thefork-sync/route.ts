// POST /api/superadmin/thefork-sync { groupe_id }
//
// Lance une passe de synchronisation TheFork pour un groupe (bouton du
// superadmin). L'import initial demande plusieurs passes : la réponse dit si
// la synchronisation est terminée (`termine`) ou s'il faut relancer.
//
// GET /api/superadmin/thefork-sync?groupe_id=… : état de la synchronisation
// et restaurants TheFork à relier à un établissement.

import { z } from 'zod'
import { apiHandler } from '../../../../lib/apiHandler'
import { clientTheForkDepuisEnv } from '../../../../lib/services/thefork.service'
import { synchroniserTheFork } from '../../../../lib/services/theforkSync.service'

export const maxDuration = 60

const schema = z.object({ groupe_id: z.string().uuid() })

export const GET = apiHandler({
  schema,
  guard: 'superadmin',
  handler: async ({ data, db }) => {
    const [{ data: sync }, { data: restaurants }, { data: groupe }, { data: etablissements }] = await Promise.all([
      db.from('crm_thefork_sync').select('*').eq('groupe_id', data.groupe_id).maybeSingle(),
      db.from('crm_thefork_restaurants').select('restaurant_uuid, client_id, nom').eq('groupe_id', data.groupe_id).order('nom'),
      db.from('groupes').select('id, nom, crm_partage, crm_vip_visites, crm_vip_mois, crm_perdu_mois').eq('id', data.groupe_id).maybeSingle(),
      db.from('clients').select('id, nom, nom_etablissement').eq('groupe_id', data.groupe_id).order('nom'),
    ])
    const ids = (etablissements || []).map((e: { id: string }) => e.id)
    const [{ count: nbClients }, { count: nbResas }] = ids.length
      ? await Promise.all([
        db.from('crm_clients').select('id', { count: 'exact', head: true }).in('client_id', ids).not('thefork_customer_uuid', 'is', null),
        db.from('crm_reservations').select('id', { count: 'exact', head: true }).in('client_id', ids),
      ])
      : [{ count: 0 }, { count: 0 }]
    return Response.json({
      sync, groupe, etablissements: etablissements || [], restaurants: restaurants || [],
      compteurs: { clients: nbClients || 0, reservations: nbResas || 0 },
      identifiants: !!clientTheForkDepuisEnv(),
    })
  },
})

const reglagesSchema = z.object({
  groupe_id: z.string().uuid(),
  thefork_group_uuid: z.string().uuid().optional(),
  actif: z.boolean().optional(),
  import_depuis: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  // Repartir de zéro (relire tout depuis import_depuis)
  reinitialiser: z.boolean().optional(),
  crm_vip_visites: z.number().int().min(1).max(365).optional(),
  crm_vip_mois: z.number().int().min(1).max(60).optional(),
  crm_perdu_mois: z.number().int().min(1).max(60).optional(),
  restaurants: z.array(z.object({
    restaurant_uuid: z.string().min(1).max(100),
    client_id: z.string().uuid().nullable(),
    nom: z.string().max(200).nullable().optional(),
  })).max(50).optional(),
})

// PATCH : réglages du groupe (identifiant de groupe TheFork, seuils VIP /
// client perdu) et rattachement des restaurants TheFork aux établissements.
export const PATCH = apiHandler({
  schema: reglagesSchema,
  guard: 'superadmin',
  handler: async ({ data, db }) => {
    const { groupe_id, restaurants, crm_vip_visites, crm_vip_mois, crm_perdu_mois, reinitialiser, ...sync } = data

    const seuils = Object.fromEntries(Object.entries({ crm_vip_visites, crm_vip_mois, crm_perdu_mois }).filter(([, v]) => v !== undefined))
    if (Object.keys(seuils).length) {
      const { error } = await db.from('groupes').update(seuils).eq('id', groupe_id)
      if (error) throw new Error(error.message)
    }

    if (sync.thefork_group_uuid || sync.actif !== undefined || sync.import_depuis || reinitialiser) {
      const ligne: Record<string, unknown> = { groupe_id, ...sync }
      if (reinitialiser) Object.assign(ligne, { curseur_clients: null, curseur_reservations: null })
      const { data: existant } = await db.from('crm_thefork_sync').select('groupe_id').eq('groupe_id', groupe_id).maybeSingle()
      if (!existant && !sync.thefork_group_uuid) {
        return Response.json({ error: 'Identifiant de groupe TheFork requis pour activer la synchronisation.' }, { status: 400 })
      }
      const { error } = existant
        ? await db.from('crm_thefork_sync').update(ligne).eq('groupe_id', groupe_id)
        : await db.from('crm_thefork_sync').insert(ligne)
      if (error) throw new Error(error.message)
    }

    if (restaurants?.length) {
      // Un établissement rattaché doit appartenir au groupe
      const { data: etabs } = await db.from('clients').select('id').eq('groupe_id', groupe_id)
      const ids = new Set((etabs || []).map((e: { id: string }) => e.id))
      if (restaurants.some((r) => r.client_id && !ids.has(r.client_id))) {
        return Response.json({ error: 'Établissement hors du groupe.' }, { status: 400 })
      }
      const { error } = await db.from('crm_thefork_restaurants')
        .upsert(restaurants.map((r) => ({ ...r, groupe_id })), { onConflict: 'restaurant_uuid' })
      if (error) throw new Error(error.message)
    }
    return Response.json({ ok: true })
  },
})

export const POST = apiHandler({
  schema,
  guard: 'superadmin',
  handler: async ({ data, db }) => {
    const api = clientTheForkDepuisEnv()
    if (!api) return Response.json({ error: 'Identifiants TheFork absents (THEFORK_CLIENT_ID / THEFORK_CLIENT_SECRET).' }, { status: 503 })
    const resultat = await synchroniserTheFork(db, api, data.groupe_id, { budgetMs: 45_000 })
    return Response.json(resultat, { status: resultat.erreur ? 502 : 200 })
  },
})
