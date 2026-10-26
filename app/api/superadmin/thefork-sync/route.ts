// Superadmin › TheFork : réglages et synchronisation du CRM d'un groupe.
//
// GET    ?groupe_id=…  état (sans jamais renvoyer les identifiants), file
//                       d'attente, restaurants à relier, compteurs.
// PATCH  { groupe_id, … } identifiants API (rangés chiffrés dans le Vault,
//                       jamais relus ici), identifiant de groupe TheFork,
//                       débit, seuils VIP / perdu, rattachement des
//                       restaurants, reprise des erreurs ou de zéro.
// POST   { groupe_id }  une passe de synchronisation (≈ 45 s). L'import
//                       initial en demande plusieurs : `termine` dit s'il
//                       reste des fiches dans la file.

import { z } from 'zod'
import { apiHandler } from '../../../../lib/apiHandler'
import { logServeur } from '../../../../lib/serverLog'
import { synchroniserTheFork } from '../../../../lib/services/theforkSync.service'
import { clientTheForkPourGroupe } from '../../../../lib/services/thefork.service'

export const maxDuration = 60

const schema = z.object({ groupe_id: z.string().uuid() })
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const getSchema = schema.extend({ sonde_debut: date.optional(), sonde_fin: date.optional(), sonde_filtre: z.enum(['updatedDate', 'mealDate']).optional() })

export const GET = apiHandler({
  schema: getSchema,
  guard: 'superadmin',
  handler: async ({ data, db }) => {
    // Sonde : combien de clients / réservations TheFork annonce sur une période
    // (une requête de 1 identifiant chacune, rien n'est importé).
    if (data.sonde_debut && data.sonde_fin) {
      const [{ data: sync }, api] = await Promise.all([
        db.from('crm_thefork_sync').select('thefork_group_uuid').eq('groupe_id', data.groupe_id).maybeSingle(),
        clientTheForkPourGroupe(db, data.groupe_id),
      ])
      if (!api || !sync?.thefork_group_uuid) return Response.json({ error: 'Synchronisation non configurée' }, { status: 400 })
      const q = { groupUuid: sync.thefork_group_uuid, startDate: data.sonde_debut, endDate: data.sonde_fin, limit: 1, page: 1 }
      const [c, r] = await Promise.all([
        api.get<{ totalCount: number }>('/manager/v1/customers', q),
        api.get<{ totalCount: number }>('/manager/v1/reservations', { ...q, filterBy: data.sonde_filtre || 'updatedDate' }),
      ])
      return Response.json({ periode: [data.sonde_debut, data.sonde_fin], clients: c?.totalCount ?? null, reservations: r?.totalCount ?? null })
    }
    const [{ data: sync }, { data: restaurants }, { data: groupe }, { data: etablissements }, { data: file }] = await Promise.all([
      db.from('crm_thefork_sync').select('*').eq('groupe_id', data.groupe_id).maybeSingle(),
      db.from('crm_thefork_restaurants').select('restaurant_uuid, client_id, lieu_id, nom').eq('groupe_id', data.groupe_id).order('nom'),
      db.from('groupes').select('id, nom, crm_partage, crm_vip_visites, crm_vip_mois, crm_perdu_mois').eq('id', data.groupe_id).maybeSingle(),
      db.from('clients').select('id, nom, nom_etablissement').eq('groupe_id', data.groupe_id).order('nom'),
      db.rpc('thefork_file_compteurs', { p_groupe_id: data.groupe_id }),
    ])
    const { data: lieux } = await db.from('crm_lieux').select('id, nom, client_id').eq('groupe_id', data.groupe_id).eq('actif', true).order('nom')
    const ids = (etablissements || []).map((e: { id: string }) => e.id)
    const [{ count: nbClients }, { count: nbResas }] = ids.length
      ? await Promise.all([
        db.from('crm_clients').select('id', { count: 'exact', head: true }).in('client_id', ids).not('thefork_customer_uuid', 'is', null),
        db.from('crm_reservations').select('id', { count: 'exact', head: true }).in('client_id', ids),
      ])
      : [{ count: 0 }, { count: 0 }]
    const { vault_secret_id, ...syncPublic } = sync || {}
    return Response.json({
      sync: sync ? syncPublic : null,
      identifiants: { enregistres: !!vault_secret_id, maj: sync?.identifiants_maj || null },
      groupe, etablissements: etablissements || [], lieux: lieux || [], restaurants: restaurants || [],
      compteurs: { clients: nbClients || 0, reservations: nbResas || 0 },
      file: file || [],
    })
  },
})

const reglagesSchema = z.object({
  groupe_id: z.string().uuid(),
  client_id: z.string().trim().min(1).max(500).optional(),
  client_secret: z.string().trim().min(1).max(500).optional(),
  thefork_group_uuid: z.string().uuid().optional(),
  actif: z.boolean().optional(),
  import_depuis: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  debit_par_seconde: z.number().positive().max(50).optional(),
  // Repartir de zéro : relire l'historique des réservations depuis import_depuis
  reinitialiser: z.boolean().optional(),
  // Remettre en file les fiches en erreur (ex. restaurant relié entre-temps)
  relancer_erreurs: z.boolean().optional(),
  crm_vip_visites: z.number().int().min(1).max(365).optional(),
  crm_vip_mois: z.number().int().min(1).max(60).optional(),
  crm_perdu_mois: z.number().int().min(1).max(60).optional(),
  restaurants: z.array(z.object({
    restaurant_uuid: z.string().min(1).max(100),
    client_id: z.string().uuid().nullable(),
    lieu_id: z.string().uuid().nullable().optional(),
    nom: z.string().max(200).nullable().optional(),
  })).max(50).optional(),
}).refine((d) => !!d.client_id === !!d.client_secret, { message: 'client_id et client_secret vont ensemble.' })

export const PATCH = apiHandler({
  schema: reglagesSchema,
  guard: 'superadmin',
  handler: async ({ data, db, user, request }) => {
    const {
      groupe_id, client_id, client_secret, restaurants, crm_vip_visites, crm_vip_mois, crm_perdu_mois,
      reinitialiser, relancer_erreurs, ...sync
    } = data

    if (client_id && client_secret) {
      const { error } = await db.rpc('thefork_enregistrer_identifiants', {
        p_groupe_id: groupe_id, p_client_id: client_id, p_client_secret: client_secret,
      })
      if (error) throw new Error(error.message)
      await logServeur(db, {
        user, clientId: null, sansEtablissement: true, action: 'MODIFICATION', entite: 'crm_thefork_sync', request,
        entiteId: groupe_id, entiteNom: 'Identifiants API TheFork',
      })
    }

    const seuils = Object.fromEntries(Object.entries({ crm_vip_visites, crm_vip_mois, crm_perdu_mois }).filter(([, v]) => v !== undefined))
    if (Object.keys(seuils).length) {
      const { error } = await db.from('groupes').update(seuils).eq('id', groupe_id)
      if (error) throw new Error(error.message)
    }

    const ligne: Record<string, unknown> = Object.fromEntries(Object.entries(sync).filter(([, v]) => v !== undefined))
    if (reinitialiser) Object.assign(ligne, { curseur_clients: null, curseur_reservations: null, page_clients: 1, page_reservations: 1, import_initial_fait: false })
    if (Object.keys(ligne).length) {
      const { error } = await db.from('crm_thefork_sync').upsert({ groupe_id, ...ligne }, { onConflict: 'groupe_id' })
      if (error) throw new Error(error.message)
    }

    if (relancer_erreurs) {
      const { error } = await db.from('crm_thefork_file').update({ statut: 'a_traiter', tentatives: 0, erreur: null })
        .eq('groupe_id', groupe_id).eq('statut', 'erreur')
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
    // Vercel coupe à 60 s : la passe s'arrête à 40 s pour finir proprement
    const resultat = await synchroniserTheFork(db, data.groupe_id, { budgetMs: 40_000 })
    return Response.json(resultat, { status: resultat.erreur ? 502 : 200 })
  },
})
