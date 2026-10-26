/**
 * Synchronisation TheFork → CRM du groupe (crm_clients + crm_reservations).
 *
 * Fonctionne en deux temps, par une file d'attente reprenable
 * (crm_thefork_file) :
 *  1. Liste : identifiants des clients et réservations créés ou modifiés
 *     depuis le dernier passage (depuis import_depuis au premier). Peu
 *     d'appels (10 000 identifiants par page) ; tout part dans la file.
 *  2. Détail : chaque fiche de la file est lue au débit du contrat
 *     (crm_thefork_sync.debit_par_seconde) jusqu'à épuisement du temps
 *     imparti. Une coupure reprend au passage suivant, sans rien refaire.
 *
 * Les dates de liste sont incluses des deux côtés : le curseur repart de la
 * veille pour ne rien rater (chevauchement voulu).
 *
 * Fusion d'un client TheFork avec une fiche existante du groupe : même
 * identifiant TheFork, sinon même e-mail, sinon même téléphone. L'identité
 * (nom, e-mail, téléphone, adresse) ne fait que compléter une case vide : une
 * saisie d'un commercial n'est jamais écrasée.
 *
 * RGPD : ni allergies, ni régime, ni notes, ni niveau de risque ne sont
 * importés (données de santé ou inutiles au démarchage). « Contactable » =
 * accord newsletter TheFork ET pas de désinscription dans skalcook : une
 * désinscription locale n'est jamais annulée par la synchro. Un client que
 * TheFork ne connaît plus (404) est supprimé, ou anonymisé s'il a des devis
 * ou événements à conserver.
 *
 * Une fois l'import terminé, chaque passage revérifie les fiches les plus
 * anciennement contrôlées (VERIFICATIONS_PAR_PASSE) pour repérer les
 * suppressions, que TheFork ne signale pas.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { TempsEcoule, clientTheForkPourGroupe, type TheForkClient, type TheForkCustomer, type TheForkReservation } from './thefork.service'

export const SOURCE = 'thefork'
const LOT_FILE = 200
const VERIFICATIONS_PAR_PASSE = 100
const REVERIFIER_APRES_JOURS = 30
const TENTATIVES_MAX = 3
// Une seule tranche de l'import initial à aujourd'hui : la position est gardée
// à la page près, découper par année ferait relire presque toute la base à
// chaque tranche (constaté : 2010 → 54 798, 2015 → 118 639, 2016 → 132 247).
const TRANCHE_LISTE_JOURS = 36_500
const TRANCHE_RESAS_INITIALES_JOURS = 31
// Réservations à venir reprises par l'import initial
const HORIZON_RESAS_JOURS = 365
// Une page de liste (10 000 identifiants à lire puis ranger) peut prendre
// 15 à 20 s : on ne la commence pas s'il reste moins que cette marge.
const MARGE_PAGE_LISTE_MS = 25_000

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
  type: string | null
  source: string | null
  nom: string | null
  prenom: string | null
  raison_sociale: string | null
  email: string | null
  telephone: string | null
  adresse: string | null
  code_postal: string | null
  ville: string | null
  thefork_customer_uuid: string | null
  desinscrit_at: string | null
}

const vide = (v: unknown) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '')

function texte(...parts: Array<string | null | undefined | false>): string | null {
  const t = parts.map((p) => (typeof p === 'string' ? p.trim() : '')).filter(Boolean).join(' · ')
  return t || null
}

export const estEntreprise = (tf: TheForkCustomer) => tf.civility === 'company'

/** Champs propres à TheFork, recopiés à chaque passage (hors données de santé). */
export function champsTheFork(tf: TheForkCustomer, maintenant = new Date()) {
  const champs = (tf.customFields || [])
    .filter((f) => f && f.label && f.value !== '' && f.value !== null && f.value !== undefined)
  return {
    thefork_customer_uuid: tf.customerUuid,
    langue: tf.locale || null,
    vip_thefork: !!tf.isVip,
    prescripteur: !!tf.isPromoter,
    rang: tf.rank || null,
    champs_thefork: champs.length ? Object.fromEntries(champs.map((f) => [f.label, f.value])) : null,
    preferences: texte(
      tf.favFood && `Plats : ${tf.favFood}`,
      tf.favDrinks && `Boissons : ${tf.favDrinks}`,
      tf.favSeating && `Table : ${tf.favSeating}`,
    ),
    thefork_verifie_at: maintenant.toISOString(),
  }
}

/** Accord de prospection : opt-in TheFork, jamais réactivé après une désinscription locale. */
export function contactable(tf: TheForkCustomer, existant?: Pick<CrmClientLigne, 'desinscrit_at'> | null): boolean {
  return !!tf.optins?.restaurantNewsletter && !existant?.desinscrit_at
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

/** Fiche à créer pour un client TheFork inconnu. */
export function nouvelleFiche(tf: TheForkCustomer, maison: string, maintenant = new Date()) {
  const entreprise = estEntreprise(tf)
  return {
    client_id: maison,
    type: entreprise ? 'entreprise' : 'particulier',
    raison_sociale: entreprise ? texte(tf.lastName, tf.firstName) : null,
    source: SOURCE,
    ...identiteTheFork(tf),
    ...champsTheFork(tf, maintenant),
    contactable: contactable(tf),
  }
}

/** Modifications à appliquer à une fiche existante. */
export function patchFusion(existant: CrmClientLigne, tf: TheForkCustomer, maintenant = new Date()): Record<string, unknown> {
  const patch: Record<string, unknown> = { ...champsTheFork(tf, maintenant), contactable: contactable(tf, existant) }
  for (const [k, v] of Object.entries(identiteTheFork(tf))) {
    if (v && vide(existant[k as keyof CrmClientLigne])) patch[k] = v
  }
  // Une fiche créée par la synchro suit TheFork pour le type ; une fiche saisie à la main garde le sien
  if (existant.source === SOURCE && estEntreprise(tf) && existant.type !== 'entreprise') {
    patch.type = 'entreprise'
    if (vide(existant.raison_sociale)) patch.raison_sociale = texte(tf.lastName, tf.firstName)
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

/** Ligne crm_reservations pour une réservation TheFork (sans la note du client : texte libre). */
export function ligneReservation(r: TheForkReservation, maison: string, crmClientId: string | null, lieuId: string | null = null) {
  return {
    client_id: maison,
    lieu_id: lieuId,
    crm_client_id: crmClientId,
    source: SOURCE,
    externe_id: r.reservationUuid,
    date_repas: r.mealDate,
    couverts: r.partySize,
    statut: r.status,
    canal: r.reservationChannel,
    montant: r.billAmount,
    note_client: null,
  }
}

// ─── Synchronisation ────────────────────────────────────────────────────────

const iso = (d: Date) => d.toISOString().slice(0, 10)
const jours = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000)

export interface ResultatSync {
  listes_clients: number
  listes_reservations: number
  clients_crees: number
  clients_fusionnes: number
  clients_maj: number
  clients_supprimes: number
  reservations_ecrites: number
  reservations_sans_maison: number
  erreurs: number
  file_restante: { clients: number; reservations: number }
  termine: boolean
  /** Diagnostic des listes : pages lues, total et taille de page annoncés par TheFork. */
  pages_listees: number
  dernier_total?: number
  taille_page?: number
  /** Passe arrêtée faute de temps (TheFork lent ou demandant d'attendre) : relancer. */
  interrompu: boolean
  /** Dernière réponse anormale de TheFork pendant la passe. */
  incident?: { statut: number | string; chemin: string } | null
  erreur?: string
}

interface Contexte {
  db: SupabaseClient
  api: TheForkClient
  groupeId: string
  etablissements: string[]
  maisons: Map<string, string | null>
  /** Lieu du groupe d'un restaurant TheFork (ex. Maison Michodière, sans établissement). */
  lieux: Map<string, string | null>
  maisonParDefaut: string
  ficheParUuid: Map<string, string>
  maintenant: Date
  res: ResultatSync
}

const CHAMPS_FICHE = 'id, client_id, type, source, nom, prenom, raison_sociale, email, telephone, adresse, code_postal, ville, thefork_customer_uuid, desinscrit_at'

async function candidats(ctx: Contexte, tf: TheForkCustomer): Promise<CrmClientLigne[]> {
  const { db, etablissements } = ctx
  const { data: parUuid } = await db.from('crm_clients').select(CHAMPS_FICHE)
    .eq('thefork_customer_uuid', tf.customerUuid).in('client_id', etablissements).limit(1)
  if (parUuid?.length) return parUuid
  const e = normEmail(tf.email)
  if (e) {
    const { data } = await db.from('crm_clients').select(CHAMPS_FICHE)
      .in('client_id', etablissements).eq('email_norm', e).is('thefork_customer_uuid', null).limit(5)
    if (data?.length) return data
  }
  const t = normTelephone(tf.phone)
  if (t) {
    const { data } = await db.from('crm_clients').select(CHAMPS_FICHE)
      .in('client_id', etablissements).eq('telephone_norm', t).is('thefork_customer_uuid', null).limit(5)
    if (data?.length) return data
  }
  return []
}

/** Crée ou fusionne la fiche CRM d'un client TheFork ; renvoie son id. */
async function enregistrerClient(ctx: Contexte, tf: TheForkCustomer): Promise<string> {
  const existant = choisirFiche(await candidats(ctx, tf), tf)
  if (existant) {
    const { error } = await ctx.db.from('crm_clients').update(patchFusion(existant, tf, ctx.maintenant)).eq('id', existant.id)
    if (error) throw new Error(`Fusion client : ${error.message}`)
    if (existant.thefork_customer_uuid) ctx.res.clients_maj++
    else ctx.res.clients_fusionnes++
    ctx.ficheParUuid.set(tf.customerUuid, existant.id)
    return existant.id
  }
  const maison = (tf.originRestaurantUuid && ctx.maisons.get(tf.originRestaurantUuid)) || ctx.maisonParDefaut
  const { data, error } = await ctx.db.from('crm_clients').insert(nouvelleFiche(tf, maison, ctx.maintenant)).select('id').single()
  if (error) throw new Error(`Création client : ${error.message}`)
  ctx.res.clients_crees++
  ctx.ficheParUuid.set(tf.customerUuid, data.id)
  return data.id
}

/**
 * Client supprimé chez TheFork : on supprime la fiche (et ses réservations),
 * ou on l'anonymise si des devis ou événements en dépendent.
 */
async function supprimerFiche(ctx: Contexte, uuid: string) {
  const { db } = ctx
  const { data: fiche } = await db.from('crm_clients').select('id').eq('thefork_customer_uuid', uuid)
    .in('client_id', ctx.etablissements).maybeSingle()
  if (!fiche) return
  const [{ count: nbDevis }, { count: nbEvts }] = await Promise.all([
    db.from('crm_devis').select('id', { count: 'exact', head: true }).eq('crm_client_id', fiche.id),
    db.from('crm_evenements').select('id', { count: 'exact', head: true }).eq('crm_client_id', fiche.id),
  ])
  if ((nbDevis || 0) + (nbEvts || 0) > 0) {
    await db.from('crm_clients').update({
      nom: 'Client supprimé', prenom: null, email: null, telephone: null, adresse: null, code_postal: null, ville: null,
      langue: null, preferences: null, champs_thefork: null, contactable: false, thefork_customer_uuid: null,
    }).eq('id', fiche.id)
  } else {
    await db.from('crm_clients').delete().eq('id', fiche.id)
  }
  ctx.res.clients_supprimes++
}

async function enregistrerReservation(ctx: Contexte, r: TheForkReservation): Promise<'ok' | 'sans_maison'> {
  const maison = ctx.maisons.get(r.restaurantUuid)
  if (!maison) {
    if (!ctx.maisons.has(r.restaurantUuid)) {
      // Restaurant pas encore relié : on le note pour que le superadmin le rattache
      ctx.maisons.set(r.restaurantUuid, null)
      await ctx.db.from('crm_thefork_restaurants')
        .upsert({ restaurant_uuid: r.restaurantUuid, groupe_id: ctx.groupeId }, { onConflict: 'restaurant_uuid', ignoreDuplicates: true })
    }
    ctx.res.reservations_sans_maison++
    return 'sans_maison'
  }
  let crmClientId: string | null = null
  if (r.customerUuid) {
    crmClientId = ctx.ficheParUuid.get(r.customerUuid) || null
    if (!crmClientId) {
      const { data } = await ctx.db.from('crm_clients').select('id').eq('thefork_customer_uuid', r.customerUuid)
        .in('client_id', ctx.etablissements).maybeSingle()
      crmClientId = data?.id || null
    }
    if (!crmClientId) {
      const tf = await ctx.api.client(r.customerUuid)
      if (tf) crmClientId = await enregistrerClient(ctx, tf)
    }
  }
  const { error } = await ctx.db.from('crm_reservations').upsert(ligneReservation(r, maison, crmClientId, ctx.lieux.get(r.restaurantUuid) || null), { onConflict: 'source,externe_id' })
  if (error) throw new Error(`Réservation : ${error.message}`)
  ctx.res.reservations_ecrites++
  return 'ok'
}

async function enfiler(db: SupabaseClient, groupeId: string, type: 'client' | 'reservation', uuids: string[]) {
  const maj_at = new Date().toISOString()
  for (let i = 0; i < uuids.length; i += 1000) {
    const { error } = await db.from('crm_thefork_file').upsert(
      uuids.slice(i, i + 1000).map((uuid) => ({ groupe_id: groupeId, type, uuid, statut: 'a_traiter', tentatives: 0, erreur: null, maj_at })),
      { onConflict: 'groupe_id,type,uuid' },
    )
    if (error) throw new Error(`File d'attente : ${error.message}`)
  }
}

async function marquer(db: SupabaseClient, groupeId: string, type: string, uuid: string, statut: string, erreur: string | null = null, tentatives?: number) {
  await db.from('crm_thefork_file').update({ statut, erreur, maj_at: new Date().toISOString(), ...(tentatives !== undefined ? { tentatives } : {}) })
    .eq('groupe_id', groupeId).eq('type', type).eq('uuid', uuid)
}

async function compterFile(db: SupabaseClient, groupeId: string, type: string) {
  const { count } = await db.from('crm_thefork_file').select('uuid', { count: 'exact', head: true })
    .eq('groupe_id', groupeId).eq('type', type).eq('statut', 'a_traiter')
  return count || 0
}

/** Traite la file d'un type jusqu'à épuisement ou fin du temps imparti. */
async function traiterFile(ctx: Contexte, type: 'client' | 'reservation') {
  const { db, api, groupeId } = ctx
  for (;;) {
    const { data: lot } = await db.from('crm_thefork_file').select('uuid, tentatives')
      .eq('groupe_id', groupeId).eq('type', type).eq('statut', 'a_traiter').order('maj_at').limit(LOT_FILE)
    if (!lot?.length) return
    for (const { uuid, tentatives } of lot) {
      try {
        if (type === 'client') {
          const tf = await api.client(uuid)
          if (!tf) { await supprimerFiche(ctx, uuid); await marquer(db, groupeId, type, uuid, 'introuvable'); continue }
          await enregistrerClient(ctx, tf)
          await marquer(db, groupeId, type, uuid, 'traite')
        } else {
          const r = await api.reservation(uuid)
          if (!r) { await marquer(db, groupeId, type, uuid, 'introuvable'); continue }
          const etat = await enregistrerReservation(ctx, r)
          await marquer(db, groupeId, type, uuid, etat === 'ok' ? 'traite' : 'erreur', etat === 'ok' ? null : 'Restaurant non relié')
        }
      } catch (err) {
        if (err instanceof TempsEcoule) throw err
        ctx.res.erreurs++
        const n = tentatives + 1
        await marquer(db, groupeId, type, uuid, n >= TENTATIVES_MAX ? 'erreur' : 'a_traiter',
          err instanceof Error ? err.message.slice(0, 300) : String(err), n)
      }
    }
  }
}

/** Remet en file les fiches le plus anciennement vérifiées (repère les suppressions). */
async function planifierVerifications(ctx: Contexte) {
  const limite = jours(ctx.maintenant, -REVERIFIER_APRES_JOURS).toISOString()
  const { data } = await ctx.db.from('crm_clients').select('thefork_customer_uuid')
    .in('client_id', ctx.etablissements).not('thefork_customer_uuid', 'is', null)
    .or(`thefork_verifie_at.is.null,thefork_verifie_at.lt.${limite}`)
    .order('thefork_verifie_at', { ascending: true, nullsFirst: true }).limit(VERIFICATIONS_PAR_PASSE)
  const uuids = (data || []).map((d) => d.thefork_customer_uuid as string)
  if (uuids.length) await enfiler(ctx.db, ctx.groupeId, 'client', uuids)
}

/**
 * Une passe de synchronisation pour un groupe, dans la limite de `budgetMs`.
 * `api` permet d'injecter un client (essais) ; sinon il est construit avec les
 * identifiants du groupe rangés dans le Vault.
 */
export async function synchroniserTheFork(
  db: SupabaseClient,
  groupeId: string,
  { budgetMs = 45_000, maintenant = new Date(), api }: { budgetMs?: number; maintenant?: Date; api?: TheForkClient } = {},
): Promise<ResultatSync> {
  const finAt = Date.now() + budgetMs
  const res: ResultatSync = {
    listes_clients: 0, listes_reservations: 0,
    clients_crees: 0, clients_fusionnes: 0, clients_maj: 0, clients_supprimes: 0,
    reservations_ecrites: 0, reservations_sans_maison: 0, erreurs: 0,
    file_restante: { clients: 0, reservations: 0 }, termine: false, interrompu: false, pages_listees: 0,
  }

  const { data: sync } = await db.from('crm_thefork_sync').select('*').eq('groupe_id', groupeId).maybeSingle()
  if (!sync) return { ...res, erreur: 'Synchronisation TheFork non configurée pour ce groupe.' }
  if (!sync.thefork_group_uuid) return { ...res, erreur: 'Identifiant de groupe TheFork manquant.' }

  const client = api || await clientTheForkPourGroupe(db, groupeId, { finAt, debitParSeconde: Number(sync.debit_par_seconde) || 5 })
  if (!client) return { ...res, erreur: 'Identifiants API TheFork manquants pour ce groupe.' }

  const [{ data: etabs }, { data: restos }] = await Promise.all([
    db.from('clients').select('id').eq('groupe_id', groupeId),
    db.from('crm_thefork_restaurants').select('restaurant_uuid, client_id, lieu_id').eq('groupe_id', groupeId),
  ])
  const etablissements = (etabs || []).map((e: { id: string }) => e.id)
  type Resto = { restaurant_uuid: string; client_id: string | null; lieu_id: string | null }
  const maisons = new Map<string, string | null>((restos || []).map((r: Resto) => [r.restaurant_uuid, r.client_id]))
  const lieux = new Map<string, string | null>((restos || []).map((r: Resto) => [r.restaurant_uuid, r.lieu_id]))
  const maisonParDefaut = [...maisons.values()].find(Boolean) || etablissements[0]
  if (!maisonParDefaut) return { ...res, erreur: 'Aucun établissement dans ce groupe.' }

  const ctx: Contexte = { db, api: client, groupeId, etablissements, maisons, lieux, maisonParDefaut, ficheParUuid: new Map(), maintenant, res }
  const aujourdhui = iso(maintenant)
  const veille = iso(jours(maintenant, -1))
  let importInitialFait = !!sync.import_initial_fait
  const curseurs = {
    curseur_clients: sync.curseur_clients as string | null,
    curseur_reservations: sync.curseur_reservations as string | null,
    page_clients: (sync.page_clients as number) || 1,
    page_reservations: (sync.page_reservations as number) || 1,
  }

  try {
    // 1. Listes → file, une page à la fois : chaque page lue part dans la file
    //    et la position (tranche + page) est gardée, une passe interrompue
    //    reprend à la page suivante.
    const lister = async (
      type: 'client' | 'reservation',
      depart: string,
      finMax: string,
      trancheJours: number,
      page: (debut: string, fin: string, p: number) => Promise<{ ids: string[]; total: number; taille: number; suivante: boolean }>,
    ) => {
      const cle = type === 'client' ? 'curseur_clients' : 'curseur_reservations'
      const clePage = type === 'client' ? 'page_clients' : 'page_reservations'
      for (let debut = depart; debut <= finMax;) {
        const finTranche = iso(jours(new Date(`${debut}T00:00:00Z`), trancheJours - 1))
        const fin = finTranche < finMax ? finTranche : finMax
        curseurs[cle] = debut
        for (let p = curseurs[clePage] || 1; ; p++) {
          if (Date.now() > finAt - MARGE_PAGE_LISTE_MS) throw new TempsEcoule()
          const lot = await page(debut, fin, p)
          await enfiler(db, groupeId, type, lot.ids)
          res.pages_listees++
          res.dernier_total = lot.total
          res.taille_page = lot.taille
          if (type === 'client') res.listes_clients += lot.ids.length
          else res.listes_reservations += lot.ids.length
          if (!lot.suivante) break
          curseurs[clePage] = p + 1
        }
        curseurs[clePage] = 1
        debut = iso(jours(new Date(`${fin}T00:00:00Z`), 1))
        curseurs[cle] = debut
      }
      curseurs[cle] = veille
    }
    const g = sync.thefork_group_uuid

    // Clients : pas d'historique global (TheFork annonce des centaines de
    // milliers de profils « modifiés », la plupart jamais venus) ; les clients
    // de l'historique arrivent par leurs réservations. Ensuite, chaque jour,
    // les profils créés ou modifiés depuis la veille.
    if (!curseurs.curseur_clients) curseurs.curseur_clients = veille
    else if (curseurs.curseur_clients < veille) {
      await lister('client', curseurs.curseur_clients, aujourdhui, TRANCHE_LISTE_JOURS,
        (d, f, p) => client.pageClients(g, d, f, p))
    }

    // Réservations : import initial par date de repas, mois par mois (TheFork
    // plafonne ses totaux à 10 000), de import_depuis jusqu'aux repas à venir ;
    // ensuite, chaque jour, les réservations modifiées depuis la veille.
    if (!sync.import_initial_fait) {
      await lister('reservation', curseurs.curseur_reservations || sync.import_depuis, iso(jours(maintenant, HORIZON_RESAS_JOURS)),
        TRANCHE_RESAS_INITIALES_JOURS, (d, f, p) => client.pageReservations(g, d, f, p, 'mealDate'))
      importInitialFait = true
    } else if (!curseurs.curseur_reservations || curseurs.curseur_reservations < veille) {
      await lister('reservation', curseurs.curseur_reservations || veille, aujourdhui, TRANCHE_LISTE_JOURS,
        (d, f, p) => client.pageReservations(g, d, f, p, 'updatedDate'))
    }

    // 2. Détail des fiches, clients d'abord (les réservations s'y rattachent)
    await traiterFile(ctx, 'client')
    await traiterFile(ctx, 'reservation')

    // 3. File vide : on revérifie quelques fiches anciennes (suppressions chez TheFork)
    await planifierVerifications(ctx)
    await traiterFile(ctx, 'client')
  } catch (err) {
    if (err instanceof TempsEcoule) res.interrompu = true
    else res.erreur = err instanceof Error ? err.message : String(err)
  }
  res.incident = client.dernierIncident

  res.file_restante = { clients: await compterFile(db, groupeId, 'client'), reservations: await compterFile(db, groupeId, 'reservation') }
  res.termine = !res.erreur && !res.interrompu && res.file_restante.clients === 0 && res.file_restante.reservations === 0
  await db.from('crm_thefork_sync').update({
    ...curseurs,
    import_initial_fait: importInitialFait,
    derniere_execution: new Date().toISOString(),
    dernier_resultat: res,
  }).eq('groupe_id', groupeId)
  return res
}
