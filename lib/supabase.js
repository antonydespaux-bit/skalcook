import { createClient } from '@supabase/supabase-js'
import { isSuperadminEmail } from './superadmin'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: true, autoRefreshToken: true },
})

// Récupère TOUTES les lignes d'une requête en paginant au-delà du plafond
// PostgREST (1000 lignes par défaut). `makeQuery(from, to)` doit renvoyer un
// query builder Supabase déjà ordonné de façon déterministe, sur lequel on
// applique `.range(from, to)`. Sans ça, les gros inventaires (>1000 lignes)
// étaient silencieusement tronqués et les totaux sous-évalués.
export const fetchAllRows = async (makeQuery, pageSize = 1000) => {
  const all = []
  let from = 0
  for (;;) {
    const { data, error } = await makeQuery(from, from + pageSize - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < pageSize) break
    from += pageSize
  }
  return all
}

// Une page appelle getClientId() plusieurs fois en parallèle (Navbar, useTheme,
// useRole, la page elle-même) : sans cache, chaque appel refaisait
// /auth/v1/user + acces_clients + profils, soit ~12 allers-retours réseau
// avant le premier chargement de données. On partage donc la même résolution
// tant que l'utilisateur et l'établissement demandé (URL / localStorage) ne
// changent pas. TTL court pour reprendre en compte un accès retiré.
const CLIENT_ID_TTL_MS = 60_000
let clientIdCache = null // { key, promise, at }

if (typeof window !== 'undefined') {
  supabase.auth.onAuthStateChange((event) => {
    if (event !== 'TOKEN_REFRESHED') clientIdCache = null
  })
}

export const getClientId = async () => {
  // Client-side uniquement, avec validation stricte via acces_clients.
  if (typeof window === 'undefined') return null

  // Session locale (pas d'appel réseau) : l'id sert seulement à choisir
  // l'établissement, l'accès réel aux données reste garanti par la RLS.
  const { data: sessionData } = await supabase.auth.getSession()
  const user = sessionData?.session?.user
  if (!user?.id) return null

  let fromStorage = null
  try { fromStorage = localStorage.getItem('client_id') } catch {}
  let fromUrl = null
  try {
    const params = new URLSearchParams(window.location.search)
    fromUrl = params.get('client_id') || params.get('clientId') || params.get('clientID')
  } catch {}

  const key = `${user.id}|${fromUrl || ''}|${fromStorage || ''}`
  const now = Date.now()
  if (clientIdCache && clientIdCache.key === key && now - clientIdCache.at < CLIENT_ID_TTL_MS) {
    return clientIdCache.promise
  }
  const promise = resolveClientId(user, fromUrl, fromStorage)
  clientIdCache = { key, promise, at: now }
  // Un échec (réseau, etc.) ne doit pas rester en cache.
  // La résolution écrit souvent client_id dans localStorage : on recale la clé
  // pour que les appels suivants tombent bien sur ce cache.
  promise.then((id) => {
    if (clientIdCache?.promise !== promise) return
    if (!id) { clientIdCache = null; return }
    let stored = null
    try { stored = localStorage.getItem('client_id') } catch {}
    clientIdCache.key = `${user.id}|${fromUrl || ''}|${stored || ''}`
  }, () => { if (clientIdCache?.promise === promise) clientIdCache = null })
  return promise
}

const resolveClientId = async (user, fromUrl, fromStorage) => {
  const userId = user.id
  const userEmail = (user.email || '').toLowerCase().trim()
  const isSuperAdmin = isSuperadminEmail(userEmail)

  // Priorité 1: superadmin -> autoriser le client sélectionné, avec priorité à
  // l'URL (pas besoin d'interroger acces_clients).
  if (isSuperAdmin && (fromUrl || fromStorage)) {
    const chosen = fromUrl || fromStorage
    try { localStorage.setItem('client_id', chosen) } catch {}
    return chosen
  }

  const { data: accesRows, error: accesErr } = await supabase
    .from('acces_clients')
    .select('client_id')
    .eq('user_id', userId)

  if (accesErr) return null
  const authorized = new Set((accesRows || []).map((r) => r?.client_id).filter(Boolean))

  const candidateFromUrl = fromUrl
  const candidateFromStorage = fromStorage

  if (authorized.size === 0) return null

  // Priorité 2: client_id dans l'URL, mais seulement s'il est autorisé.
  if (candidateFromUrl && authorized.has(candidateFromUrl)) {
    try { localStorage.setItem('client_id', candidateFromUrl) } catch {}
    return candidateFromUrl
  }

  // Priorité 3: `profils.client_id` en base (référence métier), s'il est toujours dans acces_clients.
  const { data: profilRow } = await supabase
    .from('profils')
    .select('client_id')
    .eq('id', userId)
    .maybeSingle()

  const profilClientId = profilRow?.client_id || null
  if (profilClientId && authorized.has(profilClientId)) {
    try { localStorage.setItem('client_id', profilClientId) } catch {}
    return profilClientId
  }

  // Priorité 4: client_id localStorage, seulement s'il est autorisé.
  if (candidateFromStorage && authorized.has(candidateFromStorage)) {
    try { localStorage.setItem('client_id', candidateFromStorage) } catch {}
    return candidateFromStorage
  }

  // Priorité 5: un seul établissement autorisé.
  if (authorized.size === 1) {
    const [single] = Array.from(authorized)
    try { localStorage.setItem('client_id', single) } catch {}
    return single
  }

  // Cas multi-établissements: aucun choix valide actif.
  try { localStorage.removeItem('client_id') } catch {}
  return null
}

export const getParametres = async () => {
  const clientId = await getClientId()
  if (!clientId || clientId === 'undefined') {
    return {
      nom_etablissement: '',
      adresse: '',
      seuil_vert_cuisine: 28,
      seuil_orange_cuisine: 35,
      seuil_vert_boissons: 22,
      seuil_orange_boissons: 28,
      tva_restauration: 10,
    }
  }

  const { data } = await supabase
    .from('clients')
    .select('*')
    .eq('id', clientId)
    .maybeSingle()

  return {
    nom_etablissement: data?.nom_etablissement || '',
    logo_url: data?.logo_url || null,
    adresse: data?.adresse || '',
    seuil_vert_cuisine: data?.seuil_vert_cuisine ?? 28,
    seuil_orange_cuisine: data?.seuil_orange_cuisine ?? 35,
    seuil_vert_boissons: data?.seuil_vert_boissons ?? 22,
    seuil_orange_boissons: data?.seuil_orange_boissons ?? 28,
    tva_restauration: data?.tva_restauration ?? 10,
  }
}

