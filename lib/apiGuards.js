import { createClient } from '@supabase/supabase-js'
import { isSuperadminEmail } from './superadmin'
import { niveauEffectif, atteint } from './permissions'

// ─── Client singleton (lazy, créé au premier appel) ──────────────────────────

let _serviceRoleClient = null

/**
 * Retourne le client Supabase service-role (singleton lazy).
 * Ne pas appeler au top-level module, seulement dans des fonctions.
 */
export function getServiceClient() {
  if (!_serviceRoleClient) {
    _serviceRoleClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )
  }
  return _serviceRoleClient
}

/**
 * Proxy lazy vers le client service-role.
 * Utilisable comme `supabaseServiceRole.from(...)` sans risque d'évaluation au build.
 */
export const supabaseServiceRole = new Proxy({}, {
  get(_, prop) {
    return getServiceClient()[prop]
  }
})

// ─── Vérification du jeton de session ───────────────────────────────────────

let _authClient = null
function getAuthClient() {
  if (!_authClient) {
    _authClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } },
    )
  }
  return _authClient
}

/**
 * Utilisateur porté par le jeton de session (Bearer), ou null.
 *
 * Le projet signe ses jetons en ES256 : getClaims() vérifie la signature et
 * l'expiration localement, avec les clés publiques du projet (JWKS, mises en
 * cache par instance), au lieu d'appeler /auth/v1/user à chaque requête API.
 * Cet appel prenait jusqu'à 7 s quand l'instance Supabase ralentit.
 *
 * Contrepartie : un jeton reste accepté jusqu'à son expiration (1 h) même
 * après une déconnexion. Les droits, eux, sont relus en base à chaque
 * requête (acces_clients, permissions_roles) : retirer un accès reste
 * immédiat.
 * @param {string} jwt
 * @returns {Promise<{ id: string, email: string, user_metadata: object } | null>}
 */
export async function utilisateurDuJeton(jwt) {
  try {
    const { data, error } = await getAuthClient().auth.getClaims(jwt)
    const claims = data?.claims
    if (error || !claims?.sub || claims.role !== 'authenticated') return null
    return { id: claims.sub, email: claims.email || '', user_metadata: claims.user_metadata || {} }
  } catch {
    return null
  }
}

// ─── Guards ──────────────────────────────────────────────────────────────────

/**
 * Vérifie que le token Bearer correspond à une session valide (n'importe quel
 * utilisateur connecté, sans scope établissement). Pour les endpoints qui ne
 * touchent aucune donnée tenant mais doivent rester fermés aux anonymes
 * (ex. appels LLM facturés → anti Denial-of-Wallet).
 * @returns { user } si autorisé, { response } sinon.
 */
export async function requireAuthenticated(request) {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return { response: Response.json({ error: 'Non authentifié.' }, { status: 401 }) }
  }

  const jwt = authHeader.slice(7).trim()
  if (!jwt) {
    return { response: Response.json({ error: 'Non authentifié.' }, { status: 401 }) }
  }

  const user = await utilisateurDuJeton(jwt)
  if (!user) {
    return { response: Response.json({ error: 'Session invalide.' }, { status: 401 }) }
  }

  return { user }
}

/**
 * Vérifie que le token Bearer appartient à un super-admin (email ou flag is_superadmin).
 * @returns { user } si autorisé, { response } sinon.
 */
export async function requireSuperAdmin(request) {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return { response: Response.json({ error: 'Non authentifié.' }, { status: 401 }) }
  }

  const jwt = authHeader.slice(7).trim()
  if (!jwt) {
    return { response: Response.json({ error: 'Non authentifié.' }, { status: 401 }) }
  }

  const user = await utilisateurDuJeton(jwt)
  if (!user) {
    return { response: Response.json({ error: 'Session invalide.' }, { status: 401 }) }
  }

  const userEmail = (user.email || '').toLowerCase().trim()
  if (isSuperadminEmail(userEmail)) return { user }

  const { data: profil, error: profilErr } = await getServiceClient()
    .from('profils')
    .select('is_superadmin')
    .eq('id', user.id)
    .single()

  if (profilErr || !profil?.is_superadmin) {
    return { response: Response.json({ error: 'Accès refusé : super admin requis.' }, { status: 403 }) }
  }

  return { user }
}

/**
 * Vérifie que le token Bearer appartient à un admin de l'établissement (ou un super-admin).
 * @param {Request} request
 * @param {string} clientId  UUID de l'établissement à vérifier.
 * @returns { user } si autorisé, { response } sinon.
 */
export async function requireAdminOrSuperadmin(request, clientId) {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return { response: Response.json({ error: 'Non authentifié.' }, { status: 401 }) }
  }

  const jwt = authHeader.slice(7).trim()
  if (!jwt) {
    return { response: Response.json({ error: 'Non authentifié.' }, { status: 401 }) }
  }

  const user = await utilisateurDuJeton(jwt)
  if (!user) {
    return { response: Response.json({ error: 'Session invalide.' }, { status: 401 }) }
  }

  const email = (user.email || '').toLowerCase().trim()
  if (isSuperadminEmail(email)) return { user }

  const { data: access, error: accessErr } = await getServiceClient()
    .from('acces_clients')
    .select('role')
    .eq('user_id', user.id)
    .eq('client_id', clientId)
    .maybeSingle()

  if (accessErr || !access?.role || access.role !== 'admin') {
    return { response: Response.json({ error: 'Accès refusé : admin requis.' }, { status: 403 }) }
  }

  return { user }
}

/**
 * Vérifie le droit de l'utilisateur sur une fonctionnalité de l'établissement
 * (matrice Rôle × Fonctionnalité, cf. lib/permissions.js et la table
 * permissions_roles). Superadmin : tous les droits.
 * @param {Request} request
 * @param {string} clientId
 * @param {string} fonctionnalite  id du catalogue (ex. 'achats')
 * @param {'lecture'|'modification'} niveauRequis
 * @returns { user } si autorisé, { response } sinon.
 */
export async function requirePermission(request, clientId, fonctionnalite, niveauRequis) {
  // Mêmes contrôles que requireMemberOfClient, mais l'accès à l'établissement
  // est lu en même temps que le profil et la matrice : un aller-retour vers
  // la base au lieu de deux (sensible quand l'instance Supabase ralentit).
  const result = await requireAuthenticated(request)
  if (result.response) return result
  const email = (result.user.email || '').toLowerCase().trim()
  if (isSuperadminEmail(email)) return result

  const db = getServiceClient()
  const [{ data: profil }, { data: access, error: accessErr }, { data: lignes }] = await Promise.all([
    db.from('profils').select('is_superadmin').eq('id', result.user.id).maybeSingle(),
    db.from('acces_clients').select('role').eq('user_id', result.user.id).eq('client_id', clientId).maybeSingle(),
    db.from('permissions_roles').select('role, fonctionnalite, niveau').eq('client_id', clientId).eq('fonctionnalite', fonctionnalite),
  ])
  if (accessErr || !access?.role) {
    return { response: Response.json({ error: 'Accès refusé : aucun accès à cet établissement.' }, { status: 403 }) }
  }
  if (profil?.is_superadmin) return result

  const niveau = niveauEffectif(lignes || [], access?.role, fonctionnalite)
  if (!atteint(niveau, niveauRequis)) {
    return { response: Response.json({ error: 'Accès refusé : droits insuffisants pour cette fonctionnalité.' }, { status: 403 }) }
  }
  return result
}

/**
 * Vérifie que le token Bearer appartient à un admin ou un directeur de
 * l'établissement (ou un super-admin). Pour les données sensibles (export
 * complet, chiffre d'affaires) que les rôles cuisine et bar ne voient pas.
 * @param {Request} request
 * @param {string} clientId
 * @returns { user } si autorisé, { response } sinon.
 */
export async function requireDirectionOrSuperadmin(request, clientId) {
  const result = await requireMemberOfClient(request, clientId)
  if (result.response) return result
  const email = (result.user.email || '').toLowerCase().trim()
  if (isSuperadminEmail(email)) return result

  const { data: profil } = await getServiceClient()
    .from('profils').select('is_superadmin').eq('id', result.user.id).maybeSingle()
  if (profil?.is_superadmin) return result

  const { data: access } = await getServiceClient()
    .from('acces_clients')
    .select('role')
    .eq('user_id', result.user.id)
    .eq('client_id', clientId)
    .maybeSingle()
  if (access?.role !== 'admin' && access?.role !== 'directeur') {
    return { response: Response.json({ error: 'Accès refusé : réservé aux administrateurs et directeurs.' }, { status: 403 }) }
  }
  return result
}

/**
 * Vérifie que le token Bearer appartient à un membre de l'établissement
 * (n'importe quel rôle dans acces_clients) ou un super-admin.
 * Utilisé pour les endpoints de lecture seule consultables par tous.
 * @param {Request} request
 * @param {string} clientId
 * @returns { user } si autorisé, { response } sinon.
 */
export async function requireMemberOfClient(request, clientId) {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return { response: Response.json({ error: 'Non authentifié.' }, { status: 401 }) }
  }

  const jwt = authHeader.slice(7).trim()
  if (!jwt) {
    return { response: Response.json({ error: 'Non authentifié.' }, { status: 401 }) }
  }

  const user = await utilisateurDuJeton(jwt)
  if (!user) {
    return { response: Response.json({ error: 'Session invalide.' }, { status: 401 }) }
  }

  const email = (user.email || '').toLowerCase().trim()
  if (isSuperadminEmail(email)) return { user }

  const { data: access, error: accessErr } = await getServiceClient()
    .from('acces_clients')
    .select('role')
    .eq('user_id', user.id)
    .eq('client_id', clientId)
    .maybeSingle()

  if (accessErr || !access?.role) {
    return { response: Response.json({ error: 'Accès refusé : aucun accès à cet établissement.' }, { status: 403 }) }
  }

  return { user }
}
