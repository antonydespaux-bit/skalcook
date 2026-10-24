/**
 * Synchronisation TheFork → CRM du groupe (crm_clients + crm_reservations).
 *
 * Avance par fenêtres de dates, avec un budget de temps par exécution (une
 * fonction Vercel ne doit pas dépasser sa durée max) : la position est gardée
 * dans crm_thefork_sync (curseur_clients, curseur_reservations). La tâche de
 * nuit reprend où elle s'est arrêtée ; l'import initial (2 ans) se fait donc
 * en plusieurs passes.
 *
 * Fusion d'un client TheFork avec une fiche existante du groupe : même
 * identifiant TheFork, sinon même e-mail, sinon même téléphone (clés
 * normalisées comme les colonnes générées email_norm / telephone_norm).
 * Les champs propres à TheFork (VIP, accord newsletter, langue, allergies,
 * préférences) sont mis à jour ; l'identité (nom, e-mail, téléphone,
 * adresse) ne fait que compléter une case vide : une saisie d'un commercial
 * n'est jamais écrasée.
 *
 * Les curseurs reculent volontairement de quelques jours pour relire les
 * modifications récentes (annulations, fiches mises à jour). Constaté sur le
 * bac à sable : le filtre de dates de /reservations porte sur la création de
 * la réservation, pas sur la date du repas (une fenêtre d'octobre renvoie des
 * repas de mars). HORIZON_FUTUR_JOURS est une marge de sécurité si le filtre
 * portait sur la date du repas.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { TheForkClient, TheForkCustomer, TheForkReservation } from './thefork.service'

export const SOURCE = 'thefork'
const FENETRE_CLIENTS_JOURS = 7
const FENETRE_RESAS_JOURS = 3
const RELECTURE_CLIENTS_JOURS = 2
const RELECTURE_RESAS_JOURS = 7
const HORIZON_FUTUR_JOURS = 60

// ─── Normalisation (miroir des colonnes générées de crm_clients) ────────────

export function normEmail(email: string | null | undefined): string | null {
  const e = (email || '').trim().toLowerCase()
  return e || null
}

/** 9 derniers chiffres : +33 6 12 34 56 78 et 06 12 34 56 78 donnent la même clé. */
export function normTelephone(tel: string | null | undefined): string | null {
  const chiffres = (tel || '').replace(/\D/g, '')
  return chiffres ? chiffres.slice(-9) : null
}

// ─── Fusion ─────────────────────────────────────────────────────────────────

export interface CrmClientLigne {
  id: string
  client_id: string
  nom: string | null
  prenom: string | null
  email: string | null
  telephone: string | null
  adresse: string | null
  code_postal: string | null
  ville: string | null
  thefork_customer_uuid: string | null
}

const vide = (v: unknown) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '')

function texte(...parts: Array<string | null | undefined>): string | null {
  const t = parts.map((p) => (p || '').trim()).filter(Boolean).join(' · ')
  return t || null
}

/** Champs que TheFork fait foi : toujours recopiés. */
export function champsTheFork(tf: TheForkCustomer) {
  return {
    thefork_customer_uuid: tf.customerUuid,
    langue: tf.locale || null,
    vip_thefork: !!tf.isVip,
    contactable: !!tf.optins?.restaurantNewsletter,
    allergies: texte(tf.allergiesAndIntolerances, tf.dietaryRestrictions),
    preferences: texte(tf.favFood && `Plats : ${tf.favFood}`, tf.favDrinks && `Boissons : ${tf.favDrinks}`),
  }
}

/** Identité lue chez TheFork (ne sert qu'à remplir les cases vides). */
export function identiteTheFork(tf: TheForkCustomer) {
  return {
    nom: tf.lastName?.trim() || null,
    prenom: tf.firstName?.trim() || null,
    email: tf.email?.trim() || null,
    telephone: tf.phone?.trim() || tf.secondaryPhone?.trim() || null,
    adresse: tf.address?.trim() || null,
    code_postal: tf.zipcode?.trim() || null,
    ville: tf.city?.trim() || null,
  }
}

/** Modifications à appliquer à une fiche existante. */
export function patchFusion(existant: CrmClientLigne, tf: TheForkCustomer): Record<string, unknown> {
  const patch: Record<string, unknown> = { ...champsTheFork(tf) }
  for (const [k, v] of Object.entries(identiteTheFork(tf))) {
    if (v && vide(existant[k as keyof CrmClientLigne])) patch[k] = v
  }
  return patch
}

/** Meilleure fiche existante pour un client TheFork : identifiant, puis e-mail, puis téléphone. */
export function choisirFiche(candidats: CrmClientLigne[], tf: TheForkCustomer): CrmClientLigne | null {
  const parUuid = candidats.find((c) => c.thefork_customer_uuid === tf.customerUuid)
  if (parUuid) return parUuid
  const e = normEmail(tf.email)
  const parEmail = e && candidats.find((c) => !c.thefork_customer_uuid && normEmail(c.email) === e)
  if (parEmail) return parEmail
  const t = normTelephone(tf.phone)
  const parTel = t && candidats.find((c) => !c.thefork_customer_uuid && normTelephone(c.telephone) === t)
  return parTel || null
}

// ─── Fenêtres de dates ──────────────────────────────────────────────────────

const iso = (d: Date) => d.toISOString().slice(0, 10)
const jours = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000)
const date = (s: string) => new Date(`${s}T00:00:00Z`)

/** Découpe [debut, fin] en fenêtres de `taille` jours (bornes incluses). */
export function fenetres(debut: string, fin: string, taille: number): Array<[string, string]> {
  const out: Array<[string, string]> = []
  for (let d = date(debut); d <= date(fin); d = jours(d, taille)) {
    const f = jours(d, taille - 1)
    out.push([iso(d), iso(f > date(fin) ? date(fin) : f)])
  }
  return out
}

// ─── Synchronisation ────────────────────────────────────────────────────────

export interface ResultatSync {
  clients_lus: number
  clients_crees: number
  clients_fusionnes: number
  reservations_lues: number
  reservations_ecrites: number
  reservations_sans_maison: number
  restaurants_inconnus: string[]
  termine: boolean
  curseur_clients: string | null
  curseur_reservations: string | null
  erreur?: string
}

interface Contexte {
  db: SupabaseClient
  api: TheForkClient
  groupeId: string
  etablissements: string[]
  maisons: Map<string, string | null>
  maisonParDefaut: string
  ficheParUuid: Map<string, string>
  res: ResultatSync
}

const CHAMPS_FICHE = 'id, client_id, nom, prenom, email, telephone, adresse, code_postal, ville, thefork_customer_uuid'

async function candidats(ctx: Contexte, tf: TheForkCustomer): Promise<CrmClientLigne[]> {
  const { db, etablissements } = ctx
  const out: CrmClientLigne[] = []
  const { data: parUuid } = await db.from('crm_clients').select(CHAMPS_FICHE)
    .eq('thefork_customer_uuid', tf.customerUuid).limit(1)
  out.push(...(parUuid || []))
  if (out.length) return out
  const e = normEmail(tf.email)
  if (e) {
    const { data } = await db.from('crm_clients').select(CHAMPS_FICHE)
      .in('client_id', etablissements).eq('email_norm', e).is('thefork_customer_uuid', null).limit(5)
    out.push(...(data || []))
  }
  const t = normTelephone(tf.phone)
  if (!out.length && t) {
    const { data } = await db.from('crm_clients').select(CHAMPS_FICHE)
      .in('client_id', etablissements).eq('telephone_norm', t).is('thefork_customer_uuid', null).limit(5)
    out.push(...(data || []))
  }
  return out
}

/** Crée ou fusionne la fiche CRM d'un client TheFork ; renvoie son id. */
async function enregistrerClient(ctx: Contexte, tf: TheForkCustomer): Promise<string> {
  const deja = ctx.ficheParUuid.get(tf.customerUuid)
  if (deja) return deja
  const existant = choisirFiche(await candidats(ctx, tf), tf)
  if (existant) {
    const { error } = await ctx.db.from('crm_clients').update(patchFusion(existant, tf)).eq('id', existant.id)
    if (error) throw new Error(`Fusion client : ${error.message}`)
    if (!existant.thefork_customer_uuid) ctx.res.clients_fusionnes++
    ctx.ficheParUuid.set(tf.customerUuid, existant.id)
    return existant.id
  }
  const maison = (tf.originRestaurantUuid && ctx.maisons.get(tf.originRestaurantUuid)) || ctx.maisonParDefaut
  const { data, error } = await ctx.db.from('crm_clients').insert({
    client_id: maison,
    type: 'particulier',
    source: SOURCE,
    ...identiteTheFork(tf),
    ...champsTheFork(tf),
  }).select('id').single()
  if (error) throw new Error(`Création client : ${error.message}`)
  ctx.res.clients_crees++
  ctx.ficheParUuid.set(tf.customerUuid, data.id)
  return data.id
}

async function enregistrerReservations(ctx: Contexte, resas: TheForkReservation[], groupUuid: string) {
  const lignes = []
  for (const r of resas) {
    const maison = ctx.maisons.get(r.restaurantUuid)
    if (!maison) {
      ctx.res.reservations_sans_maison++
      if (!ctx.maisons.has(r.restaurantUuid)) {
        // Restaurant pas encore relié : on le note pour que le superadmin le rattache
        ctx.maisons.set(r.restaurantUuid, null)
        ctx.res.restaurants_inconnus.push(r.restaurantUuid)
        await ctx.db.from('crm_thefork_restaurants')
          .upsert({ restaurant_uuid: r.restaurantUuid, groupe_id: ctx.groupeId }, { onConflict: 'restaurant_uuid', ignoreDuplicates: true })
      }
      continue
    }
    let crmClientId: string | null = null
    if (r.customerUuid) {
      crmClientId = ctx.ficheParUuid.get(r.customerUuid) || null
      if (!crmClientId) {
        const { data } = await ctx.db.from('crm_clients').select('id').eq('thefork_customer_uuid', r.customerUuid).maybeSingle()
        crmClientId = data?.id || null
      }
      if (!crmClientId) {
        const tf = await ctx.api.client(r.customerUuid)
        if (tf) crmClientId = await enregistrerClient(ctx, tf)
      }
    }
    lignes.push({
      client_id: maison,
      crm_client_id: crmClientId,
      source: SOURCE,
      externe_id: r.reservationUuid,
      date_repas: r.mealDate,
      couverts: r.partySize,
      statut: r.status,
      canal: r.reservationChannel,
      montant: r.billAmount,
      note_client: r.customerNote?.trim() || null,
    })
  }
  if (lignes.length) {
    const { error } = await ctx.db.from('crm_reservations').upsert(lignes, { onConflict: 'source,externe_id' })
    if (error) throw new Error(`Réservations : ${error.message} (groupe TheFork ${groupUuid})`)
    ctx.res.reservations_ecrites += lignes.length
  }
}

/**
 * Une passe de synchronisation pour un groupe skalcook, dans la limite de
 * `budgetMs`. Sauvegarde les curseurs et le résultat dans crm_thefork_sync.
 */
export async function synchroniserTheFork(
  db: SupabaseClient,
  api: TheForkClient,
  groupeId: string,
  { budgetMs = 45_000, maintenant = new Date() }: { budgetMs?: number; maintenant?: Date } = {},
): Promise<ResultatSync> {
  const fin = Date.now() + budgetMs
  const temps = () => Date.now() < fin

  const { data: sync, error: sErr } = await db.from('crm_thefork_sync').select('*').eq('groupe_id', groupeId).maybeSingle()
  if (sErr || !sync) throw new Error('Synchronisation TheFork non configurée pour ce groupe.')

  const [{ data: etabs }, { data: restos }] = await Promise.all([
    db.from('clients').select('id').eq('groupe_id', groupeId),
    db.from('crm_thefork_restaurants').select('restaurant_uuid, client_id').eq('groupe_id', groupeId),
  ])
  const etablissements = (etabs || []).map((e) => e.id)
  const maisons = new Map<string, string | null>((restos || []).map((r) => [r.restaurant_uuid, r.client_id]))
  const maisonParDefaut = [...maisons.values()].find(Boolean) || etablissements[0]
  if (!maisonParDefaut) throw new Error('Aucun établissement dans ce groupe.')

  const res: ResultatSync = {
    clients_lus: 0, clients_crees: 0, clients_fusionnes: 0,
    reservations_lues: 0, reservations_ecrites: 0, reservations_sans_maison: 0,
    restaurants_inconnus: [], termine: false,
    curseur_clients: sync.curseur_clients, curseur_reservations: sync.curseur_reservations,
  }
  const ctx: Contexte = { db, api, groupeId, etablissements, maisons, maisonParDefaut, ficheParUuid: new Map(), res }
  const aujourdhui = iso(maintenant)
  const sauver = () => db.from('crm_thefork_sync').update({
    curseur_clients: res.curseur_clients,
    curseur_reservations: res.curseur_reservations,
    derniere_execution: new Date().toISOString(),
    dernier_resultat: res,
  }).eq('groupe_id', groupeId)

  try {
    // 1. Clients créés ou modifiés
    const debutClients = res.curseur_clients || sync.import_depuis
    let clientsFinis = true
    for (const [d, f] of fenetres(debutClients, aujourdhui, FENETRE_CLIENTS_JOURS)) {
      if (!temps()) { clientsFinis = false; break }
      const ids = await api.clients(sync.thefork_group_uuid, d, f)
      res.clients_lus += ids.length
      for (const tf of await api.detailsClients(ids)) await enregistrerClient(ctx, tf)
      // On relira les derniers jours au prochain passage
      const relire = iso(jours(maintenant, -RELECTURE_CLIENTS_JOURS))
      res.curseur_clients = f < relire ? iso(jours(date(f), 1)) : relire
    }

    // 2. Réservations (passées puis à venir)
    const horizon = iso(jours(maintenant, HORIZON_FUTUR_JOURS))
    const debutResas = res.curseur_reservations || sync.import_depuis
    let resasFinies = true
    for (const [d, f] of fenetres(debutResas, horizon, FENETRE_RESAS_JOURS)) {
      if (!temps()) { resasFinies = false; break }
      const ids = await api.reservations(sync.thefork_group_uuid, d, f)
      res.reservations_lues += ids.length
      await enregistrerReservations(ctx, await api.detailsReservations(ids), sync.thefork_group_uuid)
      const relire = iso(jours(maintenant, -RELECTURE_RESAS_JOURS))
      res.curseur_reservations = f < relire ? iso(jours(date(f), 1)) : relire
    }
    res.termine = clientsFinis && resasFinies
  } catch (err) {
    res.erreur = err instanceof Error ? err.message : String(err)
  }
  await sauver()
  return res
}
