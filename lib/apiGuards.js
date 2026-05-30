import { createClient } from '@supabase/supabase-js'
import { isSuperadminEmail } from './superadmin'

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

  const supabaseAuth = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )
  const { data: { user }, error: userErr } = await supabaseAuth.auth.getUser(jwt)
  if (userErr || !user) {
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

  const supabaseAuth = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )
  const { data: { user }, error: userErr } = await supabaseAuth.auth.getUser(jwt)
  if (userErr || !user) {
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

  const supabaseAuth = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )
  const { data: { user }, error: userErr } = await supabaseAuth.auth.getUser(jwt)
  if (userErr || !user) {
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

  const supabaseAuth = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )
  const { data: { user }, error: userErr } = await supabaseAuth.auth.getUser(jwt)
  if (userErr || !user) {
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
