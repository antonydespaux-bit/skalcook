/**
 * Client de l'API B2B TheFork (https://docs.thefork.io/B2B-API/introduction).
 *
 * Authentification OAuth2 client_credentials (auth.thefork.io), jeton gardé
 * en mémoire jusqu'à son expiration. Les listes (`/customers`, `/reservations`)
 * ne renvoient que des identifiants, paginés par 100 : le détail se lit
 * ensuite fiche par fiche, en parallèle limité.
 *
 * Identifiants dans les variables d'environnement (THEFORK_CLIENT_ID,
 * THEFORK_CLIENT_SECRET), jamais en base ni dans le code.
 */

export const THEFORK_API = 'https://api.thefork.io'
const THEFORK_AUTH = 'https://auth.thefork.io/oauth/token'

export interface TheForkClientConfig {
  clientId: string
  clientSecret: string
  baseUrl?: string
}

export interface TheForkCustomer {
  customerUuid: string
  email: string | null
  firstName: string | null
  lastName: string | null
  phone: string | null
  secondaryPhone?: string | null
  locale: string | null
  isVip: boolean | null
  address?: string | null
  city?: string | null
  zipcode?: string | null
  favFood?: string | null
  favDrinks?: string | null
  notes?: string | null
  allergiesAndIntolerances?: string | null
  dietaryRestrictions?: string | null
  originRestaurantUuid: string | null
  originRestaurantName: string | null
  optins?: { restaurantNewsletter?: boolean | null } | null
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

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms))

export class TheForkClient {
  private readonly baseUrl: string
  private jeton: { valeur: string; expire: number } | null = null

  constructor(private readonly cfg: TheForkClientConfig) {
    this.baseUrl = (cfg.baseUrl || THEFORK_API).replace(/\/$/, '')
  }

  private async token(): Promise<string> {
    if (this.jeton && Date.now() < this.jeton.expire) return this.jeton.valeur
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
    // Marge d'une minute avant l'expiration annoncée
    this.jeton = { valeur: json.access_token, expire: Date.now() + (json.expires_in - 60) * 1000 }
    return this.jeton.valeur
  }

  /** GET avec 3 essais sur 429 / 5xx. Renvoie null sur 404. */
  async get<T>(chemin: string, query: Record<string, string | number> = {}): Promise<T | null> {
    const url = new URL(this.baseUrl + chemin)
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, String(v))
    for (let essai = 0; ; essai++) {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${await this.token()}` } })
      if (res.status === 404) return null
      if (res.ok) return await res.json() as T
      if ((res.status === 429 || res.status >= 500) && essai < 2) {
        await pause(1000 * (essai + 1))
        continue
      }
      if (res.status === 401 && essai < 1) { this.jeton = null; continue }
      throw new TheForkError(`TheFork ${chemin} : ${res.status}`, res.status)
    }
  }

  /** Tous les identifiants d'une liste paginée. */
  async listerIds(chemin: string, query: Record<string, string | number>): Promise<string[]> {
    const ids: string[] = []
    for (let page = 1; ; page++) {
      const lot = await this.get<ListePage>(chemin, { ...query, page, limit: 100 })
      if (!lot || !lot.data?.length) break
      ids.push(...lot.data)
      if (ids.length >= lot.totalCount || lot.data.length < (lot.limit || 100)) break
    }
    return ids
  }

  /** Détail de chaque identifiant (fiches introuvables ignorées). */
  async details<T>(chemin: (id: string) => string, ids: string[], concurrence = 8): Promise<T[]> {
    const out: T[] = []
    for (let i = 0; i < ids.length; i += concurrence) {
      const lot = await Promise.all(ids.slice(i, i + concurrence).map((id) => this.get<T>(chemin(id))))
      for (const x of lot) if (x) out.push(x)
    }
    return out
  }

  clients(groupUuid: string, debut: string, fin: string) {
    return this.listerIds('/manager/v1/customers', { groupUuid, startDate: debut, endDate: fin })
  }

  reservations(groupUuid: string, debut: string, fin: string) {
    return this.listerIds('/manager/v1/reservations', { groupUuid, startDate: debut, endDate: fin })
  }

  client(uuid: string) {
    return this.get<TheForkCustomer>(`/manager/v1/customers/${encodeURIComponent(uuid)}`)
  }

  detailsClients(ids: string[]) {
    return this.details<TheForkCustomer>((id) => `/manager/v1/customers/${encodeURIComponent(id)}`, ids)
  }

  detailsReservations(ids: string[]) {
    return this.details<TheForkReservation>((id) => `/manager/v1/reservations/${encodeURIComponent(id)}`, ids)
  }
}

/** Client configuré depuis l'environnement, ou null si les identifiants manquent. */
export function clientTheForkDepuisEnv(): TheForkClient | null {
  const clientId = process.env.THEFORK_CLIENT_ID
  const clientSecret = process.env.THEFORK_CLIENT_SECRET
  if (!clientId || !clientSecret) return null
  return new TheForkClient({ clientId, clientSecret, baseUrl: process.env.THEFORK_API_URL || THEFORK_API })
}
