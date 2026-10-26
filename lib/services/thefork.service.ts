/**
 * Client de l'API B2B TheFork (https://docs.thefork.io/B2B-API/introduction).
 *
 * Chaque groupe de restaurants reçoit ses propres identifiants de TheFork :
 * ils sont rangés chiffrés dans le Vault Supabase (fonction
 * thefork_identifiants, service_role uniquement), jamais dans le code ni dans
 * les variables d'environnement.
 *
 * Jeton OAuth2 client_credentials gardé en base (crm_thefork_jetons) jusqu'à
 * son expiration : consigne TheFork, ne pas en redemander un tant que le
 * précédent est valide, y compris d'une exécution à l'autre.
 *
 * Les listes (`/customers`, `/reservations`) ne renvoient que des
 * identifiants (jusqu'à 10 000 par page) ; le détail se lit fiche par fiche,
 * une requête à la fois au débit autorisé par le contrat, avec attente
 * croissante sur 429.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export const THEFORK_API = 'https://api.thefork.io'
const THEFORK_AUTH = 'https://auth.thefork.io/oauth/token'
const LIMITE_LISTE = 10_000

export interface JetonStock {
  lire(): Promise<{ valeur: string; expire: number } | null>
  ecrire(jeton: { valeur: string; expire: number }): Promise<void>
}

export interface TheForkClientConfig {
  clientId: string
  clientSecret: string
  baseUrl?: string
  /** Cache du jeton partagé entre exécutions ; en mémoire si absent. */
  jetons?: JetonStock
  /** Requêtes par seconde autorisées (contrat TheFork). */
  debitParSeconde?: number
  /** Heure (ms) à ne pas dépasser : une attente qui la franchirait arrête l'exécution. */
  finAt?: number
}

export interface TheForkCustomField {
  labelUuid: string
  label: string
  type: string
  value: string | number | boolean | null
  valueUuid: string | null
}

export interface TheForkCustomer {
  customerUuid: string
  email: string | null
  firstName: string | null
  lastName: string | null
  phone: string | null
  secondaryPhone?: string | null
  locale: string | null
  civility?: string | null
  rank?: string | null
  isVip: boolean | null
  isPromoter?: boolean | null
  address?: string | null
  city?: string | null
  zipcode?: string | null
  favFood?: string | null
  favDrinks?: string | null
  favSeating?: string | null
  originRestaurantUuid: string | null
  originRestaurantName: string | null
  optins?: { restaurantNewsletter?: boolean | null } | null
  customFields?: TheForkCustomField[] | null
  creationDate?: string | null
  lastUpdateDate?: string | null
}

export interface TheForkReservation {
  reservationUuid: string
  restaurantUuid: string
  customerUuid: string | null
  mealDate: string | null
  partySize: number | null
  status: string | null
  reservationChannel: string | null
  billAmount: number | null
  customerNote: string | null
}

interface ListePage {
  data: string[]
  totalCount: number
  page: number
  limit: number
}

export class TheForkError extends Error {
  constructor(message: string, public status?: number) {
    super(message)
  }
}

/** Levée quand le temps imparti à l'exécution est écoulé : on reprendra plus tard. */
export class TempsEcoule extends Error {
  constructor() { super('Temps imparti écoulé') }
}

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Limite de TheFork (Integrations, 26/10/2026) : rester sous 3 requêtes / s. */
export const DEBIT_MAX = 2.5

export class TheForkClient {
  private readonly baseUrl: string
  private readonly intervalle: number
  private derniereRequete = 0
  /** Dernière réponse anormale de TheFork (pour expliquer une passe interrompue). */
  dernierIncident: { statut: number | string; chemin: string } | null = null
  private jetonMemoire: { valeur: string; expire: number } | null = null

  constructor(private readonly cfg: TheForkClientConfig) {
    this.baseUrl = (cfg.baseUrl || THEFORK_API).replace(/\/$/, '')
    this.intervalle = 1000 / Math.min(cfg.debitParSeconde || DEBIT_MAX, DEBIT_MAX)
  }

  private async attendre(ms: number) {
    if (this.cfg.finAt && Date.now() + ms > this.cfg.finAt) throw new TempsEcoule()
    if (ms > 0) await pause(ms)
  }

  private async token(force = false): Promise<string> {
    const valide = (j: { expire: number } | null) => j && Date.now() < j.expire
    if (!force && valide(this.jetonMemoire)) return this.jetonMemoire!.valeur
    if (!force && this.cfg.jetons) {
      const stocke = await this.cfg.jetons.lire()
      if (stocke && valide(stocke)) { this.jetonMemoire = stocke; return stocke.valeur }
    }
    const res = await fetch(THEFORK_AUTH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        audience: this.baseUrl,
        grant_type: 'client_credentials',
        client_id: this.cfg.clientId,
        client_secret: this.cfg.clientSecret,
      }),
    })
    if (!res.ok) throw new TheForkError(`Authentification TheFork refusée (${res.status})`, res.status)
    const json = await res.json() as { access_token: string; expires_in: number }
    // Marge de 2 minutes avant l'expiration annoncée (8 600 s)
    this.jetonMemoire = { valeur: json.access_token, expire: Date.now() + (json.expires_in - 120) * 1000 }
    await this.cfg.jetons?.ecrire(this.jetonMemoire)
    return this.jetonMemoire.valeur
  }

  /**
   * GET au débit autorisé. Renvoie null sur 404. Sur 429 / 5xx, attend
   * (Retry-After sinon 2, 4, 8, 16, 32 s) puis réessaie.
   */
  async get<T>(chemin: string, query: Record<string, string | number> = {}): Promise<T | null> {
    const url = new URL(this.baseUrl + chemin)
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, String(v))
    let jetonRenouvele = false
    for (let essai = 0; ; essai++) {
      await this.attendre(this.derniereRequete + this.intervalle - Date.now())
      this.derniereRequete = Date.now()
      let res: Response
      try {
        // Une requête qui ne répond pas ne doit pas bloquer toute la passe
        res = await fetch(url, { headers: { Authorization: `Bearer ${await this.token()}` }, signal: AbortSignal.timeout(20_000) })
      } catch (err) {
        if (err instanceof TheForkError) throw err
        this.dernierIncident = { statut: 'délai dépassé', chemin }
        if (essai < 5) { await this.attendre(2000 * 2 ** essai); continue }
        throw new TheForkError(`TheFork ${chemin} : pas de réponse`)
      }
      if (res.status === 404) return null
      if (res.ok) return await res.json() as T
      this.dernierIncident = { statut: res.status, chemin }
      if (res.status === 401 && !jetonRenouvele) {
        // Jeton révoqué ou expiré plus tôt qu'annoncé : un seul renouvellement
        jetonRenouvele = true
        await this.token(true)
        continue
      }
      if ((res.status === 429 || res.status >= 500) && essai < 5) {
        const retry = Number(res.headers.get('retry-after'))
        await this.attendre(Number.isFinite(retry) && retry > 0 ? retry * 1000 : 2000 * 2 ** essai)
        continue
      }
      throw new TheForkError(`TheFork ${chemin} : ${res.status}`, res.status)
    }
  }

  /**
   * Une page de liste : identifiants, total annoncé, taille de page réellement
   * appliquée par TheFork, et s'il reste une page après celle-ci.
   */
  async pageIds(chemin: string, query: Record<string, string | number>, page: number) {
    const lot = await this.get<ListePage>(chemin, { ...query, page, limit: LIMITE_LISTE })
    const ids = lot?.data || []
    const taille = lot?.limit || ids.length || LIMITE_LISTE
    const total = lot?.totalCount ?? ids.length
    return { ids, total, taille, suivante: ids.length > 0 && (page - 1) * taille + ids.length < total }
  }

  pageClients(groupUuid: string, debut: string, fin: string, page: number) {
    return this.pageIds('/manager/v1/customers', { groupUuid, startDate: debut, endDate: fin }, page)
  }

  /** `filtre` : date de modification (synchro au fil de l'eau) ou date du repas (historique). */
  pageReservations(groupUuid: string, debut: string, fin: string, page: number, filtre: 'updatedDate' | 'mealDate' = 'updatedDate') {
    return this.pageIds('/manager/v1/reservations', { groupUuid, startDate: debut, endDate: fin, filterBy: filtre }, page)
  }

  /** Tous les identifiants d'une liste paginée. */
  async listerIds(chemin: string, query: Record<string, string | number>): Promise<string[]> {
    const ids: string[] = []
    for (let page = 1; ; page++) {
      const lot = await this.get<ListePage>(chemin, { ...query, page, limit: LIMITE_LISTE })
      if (!lot || !lot.data?.length) break
      ids.push(...lot.data)
      if (ids.length >= lot.totalCount || lot.data.length < (lot.limit || LIMITE_LISTE)) break
    }
    return ids
  }

  /** Clients créés ou modifiés entre deux dates (incluses). */
  clients(groupUuid: string, debut: string, fin: string) {
    return this.listerIds('/manager/v1/customers', { groupUuid, startDate: debut, endDate: fin })
  }

  /** Réservations créées ou modifiées entre deux dates (incluses). */
  reservations(groupUuid: string, debut: string, fin: string) {
    return this.listerIds('/manager/v1/reservations', { groupUuid, startDate: debut, endDate: fin, filterBy: 'updatedDate' })
  }

  client(uuid: string) {
    return this.get<TheForkCustomer>(`/manager/v1/customers/${encodeURIComponent(uuid)}`)
  }

  reservation(uuid: string) {
    return this.get<TheForkReservation>(`/manager/v1/reservations/${encodeURIComponent(uuid)}`)
  }
}

/** Cache du jeton d'un groupe dans crm_thefork_jetons. */
export function jetonsEnBase(db: SupabaseClient, groupeId: string): JetonStock {
  return {
    async lire() {
      const { data } = await db.from('crm_thefork_jetons').select('jeton, expire_at').eq('groupe_id', groupeId).maybeSingle()
      return data ? { valeur: data.jeton, expire: new Date(data.expire_at).getTime() } : null
    },
    async ecrire(j) {
      await db.from('crm_thefork_jetons').upsert({ groupe_id: groupeId, jeton: j.valeur, expire_at: new Date(j.expire).toISOString() })
    },
  }
}

/**
 * Client configuré pour un groupe : identifiants lus dans le Vault, débit et
 * jeton partagés. Null si le groupe n'a pas encore d'identifiants.
 */
export async function clientTheForkPourGroupe(
  db: SupabaseClient,
  groupeId: string,
  { finAt, debitParSeconde }: { finAt?: number; debitParSeconde?: number } = {},
): Promise<TheForkClient | null> {
  const { data, error } = await db.rpc('thefork_identifiants', { p_groupe_id: groupeId })
  const ident = Array.isArray(data) ? data[0] : data
  if (error || !ident?.client_id || !ident?.client_secret) return null
  return new TheForkClient({
    clientId: ident.client_id,
    clientSecret: ident.client_secret,
    baseUrl: process.env.THEFORK_API_URL || THEFORK_API,
    jetons: jetonsEnBase(db, groupeId),
    debitParSeconde,
    finAt,
  })
}
