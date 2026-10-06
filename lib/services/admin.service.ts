/**
 * Service layer for Admin / User management domain.
 * Pure business logic — no HTTP concerns.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { CreateUserInput, CreateGlobalUserInput, UpdateUserInput, UpdateClientInput, CreateClientInput, UpdateClientSettingsInput } from '../validators/admin.schema'
import { ValidationError, NotFoundError, ConflictError, ForbiddenError } from '../errors'

// ── List users for a client ────────────────────────────────────────────────

export async function listClientUsers(db: SupabaseClient, clientId: string) {
  const { data: rawAccesRows, error } = await db
    .from('acces_clients')
    .select('user_id, role')
    .eq('client_id', clientId)

  if (error) throw new Error(error.message)
  if (!rawAccesRows || rawAccesRows.length === 0) return []

  // Ignore les lignes corrompues (user_id null) qui cassent les endpoints
  // de modification/suppression en aval (Zod rejette user_id=null). Ces
  // lignes orphelines doivent être nettoyées directement en DB.
  const accesRows = rawAccesRows.filter((r) => typeof r.user_id === 'string' && r.user_id.length > 0)
  if (accesRows.length === 0) return []

  const userIds = accesRows.map((r) => r.user_id)
  const { data: profils } = await db
    .from('profils')
    .select('id, nom, email, created_at')
    .in('id', userIds)

  const profilMap = new Map((profils ?? []).map((p) => [p.id, p]))

  // Pour tous les utilisateurs, on complète depuis auth.users :
  //  - si la ligne `profils` est absente (import manuel, création via
  //    dashboard Supabase, etc.)
  //  - si `profils.nom` est null/vide (ancien flow d'invite, migration)
  //  - si `profils.email` manque
  // On récupère en parallèle, un getUserById par user_id. Pour 10-50
  // utilisateurs par client c'est largement assez rapide.
  const authResults = await Promise.all(
    userIds.map((id) => db.auth.admin.getUserById(id).catch(() => null))
  )
  const authMap = new Map<string, { email: string | null; nom: string | null; created_at: string | null }>()
  for (let i = 0; i < userIds.length; i++) {
    const u = authResults[i]?.data?.user
    if (u) {
      authMap.set(userIds[i], {
        email: u.email ?? null,
        nom: (u.user_metadata?.nom as string | undefined) ?? null,
        created_at: u.created_at ?? null,
      })
    }
  }

  const pickNonEmpty = (...vals: Array<string | null | undefined>) => {
    for (const v of vals) {
      if (typeof v === 'string' && v.trim() !== '') return v.trim()
    }
    return ''
  }

  return accesRows.map((a) => {
    const p = profilMap.get(a.user_id)
    const fallback = authMap.get(a.user_id)
    return {
      id: a.user_id,            // `id` pour l'UI /admin qui utilise profil.id
      user_id: a.user_id,       // compat anciens consumers
      role: a.role,
      nom: pickNonEmpty(p?.nom, fallback?.nom),
      email: pickNonEmpty(p?.email, fallback?.email),
      created_at: p?.created_at || fallback?.created_at || null,
    }
  })
}

// ── List all users (superadmin) ────────────────────────────────────────────

export async function listAllUsers(db: SupabaseClient, roleFilter?: string) {
  let query = db.from('profils').select('*').order('created_at', { ascending: false })
  if (roleFilter) query = query.eq('role', roleFilter)
  const { data: profils, error } = await query

  if (error) throw new Error(error.message)

  // Count accesses per user
  const userIds = (profils ?? []).map((p) => p.id)
  if (userIds.length === 0) return []

  const { data: accesRows } = await db
    .from('acces_clients')
    .select('user_id, client_id')
    .in('user_id', userIds)

  const accessCount: Record<string, number> = {}
  for (const a of accesRows ?? []) {
    accessCount[a.user_id] = (accessCount[a.user_id] || 0) + 1
  }

  return (profils ?? []).map((p) => ({
    ...p,
    nb_etablissements: accessCount[p.id] || 0,
  }))
}

// ── Invitation (helper commun aux 3 flux de création) ──────────────────────
//
// Toute création de compte passe par inviteUserByEmail : Supabase crée
// l'utilisateur sans mot de passe et envoie l'email "Invite user" (template
// Auth) dont le lien ouvre une session sur /nouveau-mot-de-passe.
//
// Attention : le trigger `creer_profil` (AFTER INSERT ON auth.users) crée
// déjà une ligne profils minimale → on UPSERT ensuite, un INSERT partirait
// en conflit de PK et nom/rôle ne seraient jamais écrits.

function resolveRedirectTo(requestOrigin?: string) {
  const envOrigin = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || ''
  const origin = (envOrigin || requestOrigin || '').replace(/\/$/, '')
  return origin ? `${origin}/nouveau-mot-de-passe` : undefined
}

async function inviteAuthUser(
  db: SupabaseClient,
  email: string,
  metadata: Record<string, unknown>,
  siteOrigin?: string,
) {
  const { data, error } = await db.auth.admin.inviteUserByEmail(email, {
    redirectTo: resolveRedirectTo(siteOrigin),
    data: metadata,
  })
  if (error) {
    if (/already|exist|registered/i.test(error.message || '')) {
      throw new ConflictError('Un compte existe déjà avec cet email. Demandez à l\'utilisateur de se connecter, ou utilisez une autre adresse.')
    }
    throw new Error(error.message)
  }
  return data.user.id
}

async function writeProfilAndAccess(
  db: SupabaseClient,
  profil: Record<string, unknown> & { id: string },
  accesses: { client_id: string; role: string }[],
) {
  const { error: profilErr } = await db.from('profils').upsert(profil, { onConflict: 'id' })
  if (profilErr) throw new Error(`Profil non enregistré : ${profilErr.message}`)

  if (accesses.length > 0) {
    const { error: accesErr } = await db
      .from('acces_clients')
      .upsert(accesses.map((a) => ({ user_id: profil.id, ...a })), { onConflict: 'user_id,client_id' })
    if (accesErr) throw new Error(`Accès non enregistrés : ${accesErr.message}`)
  }
}

// ── Create user ────────────────────────────────────────────────────────────

export async function createUser(db: SupabaseClient, input: CreateUserInput, siteOrigin?: string) {
  const { email, nom, role, client_id: clientId } = input

  const userId = await inviteAuthUser(db, email, { nom, client_id: clientId }, siteOrigin)
  await writeProfilAndAccess(
    db,
    { id: userId, email, nom, role, client_id: clientId },
    [{ client_id: clientId, role }],
  )

  return { userId, email, nom, role, invitationSent: true }
}

// ── Create global user (superadmin) ────────────────────────────────────────

export async function createGlobalUser(db: SupabaseClient, input: CreateGlobalUserInput, siteOrigin?: string) {
  const { email, nom, role, client_ids: clientIds, telephone, site_web, siret_personnel, adresse_pro } = input

  const userId = await inviteAuthUser(db, email, { nom }, siteOrigin)
  await writeProfilAndAccess(
    db,
    {
      id: userId,
      email,
      nom,
      role,
      client_id: null,
      telephone: telephone || null,
      site_web: site_web || null,
      siret_personnel: siret_personnel || null,
      adresse_pro: adresse_pro || null,
    },
    (clientIds ?? []).map((cId) => ({ client_id: cId, role })),
  )

  return { userId, email, nom, role, invitationSent: true }
}

// ── Invite admin ───────────────────────────────────────────────────────────

export async function inviteAdmin(db: SupabaseClient, email: string, nom: string, clientId: string, siteOrigin?: string) {
  const userId = await inviteAuthUser(db, email, { nom, client_id: clientId }, siteOrigin)
  await writeProfilAndAccess(
    db,
    { id: userId, email, nom, role: 'admin', client_id: clientId },
    [{ client_id: clientId, role: 'admin' }],
  )

  return {
    userId,
    email,
    invitationSent: true,
  }
}

// ── Update user ────────────────────────────────────────────────────────────

export async function updateUser(db: SupabaseClient, input: UpdateUserInput) {
  const { user_id: userId, email, nom, role, telephone, site_web, siret_personnel, adresse_pro } = input

  // Update auth user if email changed
  if (email) {
    await db.auth.admin.updateUserById(userId, {
      email,
      user_metadata: { nom: nom || undefined },
    })
  }

  // Update profils
  const updates: Record<string, unknown> = {}
  if (nom !== undefined) updates.nom = nom
  if (role !== undefined) updates.role = role
  if (email !== undefined) updates.email = email
  if (telephone !== undefined) updates.telephone = telephone
  if (site_web !== undefined) updates.site_web = site_web
  if (siret_personnel !== undefined) updates.siret_personnel = siret_personnel
  if (adresse_pro !== undefined) updates.adresse_pro = adresse_pro

  if (Object.keys(updates).length > 0) {
    const { error } = await db.from('profils').update(updates).eq('id', userId)
    if (error) throw new Error(error.message)
  }

  return { updated: true }
}

// ── Delete user ────────────────────────────────────────────────────────────

export async function deleteUser(db: SupabaseClient, userId: string, currentUserId: string) {
  if (userId === currentUserId) {
    throw new ForbiddenError('Impossible de supprimer votre propre compte.')
  }

  // Cascade: acces_clients → profils → auth user
  await db.from('acces_clients').delete().eq('user_id', userId)
  await db.from('profils').delete().eq('id', userId)
  const { error } = await db.auth.admin.deleteUser(userId)
  if (error) throw new Error(error.message)

  return { deleted: true }
}

// ── User detail ────────────────────────────────────────────────────────────

export async function getUserDetail(db: SupabaseClient, userId: string) {
  const [profilRes, accesRes, clientsRes] = await Promise.all([
    db.from('profils').select('*').eq('id', userId).maybeSingle(),
    db.from('acces_clients').select('client_id, role').eq('user_id', userId),
    db.from('clients').select('id, nom_etablissement, slug').order('nom_etablissement'),
  ])

  if (!profilRes.data) throw new NotFoundError('Utilisateur introuvable.')

  const accessClientIds = new Set((accesRes.data ?? []).map((a) => a.client_id))
  if (profilRes.data.client_id) accessClientIds.add(profilRes.data.client_id)

  return {
    profil: profilRes.data,
    clients: clientsRes.data ?? [],
    selectedClientIds: Array.from(accessClientIds),
  }
}

// ── Update client ──────────────────────────────────────────────────────────

export async function updateClient(db: SupabaseClient, input: UpdateClientInput) {
  const { id, ...updates } = input

  const dbUpdates: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) dbUpdates[key] = value
  }

  if (Object.keys(dbUpdates).length === 0) {
    throw new ValidationError('Aucun champ à mettre à jour.')
  }

  const { error } = await db.from('clients').update(dbUpdates).eq('id', id)
  if (error) throw new Error(error.message)

  return { updated: true }
}

// ── Create client (establishment) ──────────────────────────────────────────
// RLS bloque les INSERT sur `clients` côté client : on passe par service_role.

export async function createClient(db: SupabaseClient, input: CreateClientInput) {
  const { data, error } = await db
    .from('clients')
    .insert([input])
    .select()
    .single()

  if (error) {
    if (/duplicate|unique/i.test(error.message)) {
      throw new ConflictError('Un établissement existe déjà avec ce slug.')
    }
    throw new Error(error.message)
  }
  return { client: data }
}

// ── Update client settings (full) ──────────────────────────────────────────

export async function updateClientSettings(db: SupabaseClient, input: UpdateClientSettingsInput) {
  const { id, ...updates } = input

  const dbUpdates: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) dbUpdates[key] = value
  }

  if (Object.keys(dbUpdates).length === 0) {
    throw new ValidationError('Aucun champ à mettre à jour.')
  }

  const { error } = await db.from('clients').update(dbUpdates).eq('id', id)
  if (error) {
    if (/duplicate|unique/i.test(error.message)) {
      throw new ConflictError('Un établissement existe déjà avec ce slug.')
    }
    throw new Error(error.message)
  }

  return { updated: true }
}

// ── Activity logs ──────────────────────────────────────────────────────────

export async function getActivityLogs(
  db: SupabaseClient,
  filters: { clientId?: string; userId?: string; device?: string; timespan: string }
) {
  const { clientId, userId, device, timespan } = filters

  // Time filter
  let dateFilter: string | null = null
  const now = new Date()
  if (timespan === '24h') {
    dateFilter = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()
  } else if (timespan === '7d') {
    dateFilter = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
  } else if (timespan === '30d') {
    dateFilter = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()
  }

  let query = db
    .from('logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50)

  if (clientId) query = query.eq('client_id', clientId)
  if (userId) query = query.eq('user_id', userId)
  if (dateFilter) query = query.gte('created_at', dateFilter)

  const { data: logs, error } = await query
  if (error) throw new Error(error.message)

  const allLogs = logs ?? []

  // Enrich logs with parsed device/browser from user_agent
  const enrichedLogs = allLogs.map(l => {
    const { device: d, browser: b } = parseUserAgent(l.user_agent)
    return { ...l, device: d, browser: b }
  })

  // Device filter (applied after enrichment since it's derived from user_agent)
  const filteredLogs = device ? enrichedLogs.filter(l => l.device === device) : enrichedLogs

  // Build KPIs
  const now24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
  const todayIso = todayStart.toISOString()

  const activeUsers24h = new Set(filteredLogs.filter(l => l.created_at >= now24h).map(l => l.user_id)).size
  const modificationsToday = filteredLogs.filter(l => l.created_at >= todayIso).length

  // Top client
  const clientCounts: Record<string, number> = {}
  for (const l of filteredLogs) {
    if (l.client_id) clientCounts[l.client_id] = (clientCounts[l.client_id] || 0) + 1
  }
  const topClientId = Object.entries(clientCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null

  // Load clients + users for dropdowns
  const [clientsRes, profilsRes] = await Promise.all([
    db.from('clients').select('id, nom_etablissement').order('nom_etablissement'),
    db.from('profils').select('id, nom, email').order('nom'),
  ])

  const clientsList = clientsRes.data ?? []
  const topClientName = topClientId ? clientsList.find(c => c.id === topClientId)?.nom_etablissement : null

  // Chart data: group by day (last 7 days)
  const chartMap: Record<string, number> = {}
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000)
    chartMap[d.toISOString().slice(0, 10)] = 0
  }
  for (const l of filteredLogs) {
    const day = l.created_at?.slice(0, 10)
    if (day && chartMap[day] !== undefined) chartMap[day]++
  }
  const chartData = Object.entries(chartMap).map(([date, actions]) => ({
    date: new Date(date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }),
    actions,
  }))

  // Enrich logs with user names (fallback on profils if user_nom absent)
  const profilMap = new Map((profilsRes.data ?? []).map(p => [p.id, p]))
  const recentLogs = filteredLogs.map(l => ({
    ...l,
    user_nom: l.user_nom || profilMap.get(l.user_id)?.nom || profilMap.get(l.user_id)?.email || l.user_id?.slice(0, 8) || '—',
  }))

  return {
    kpis: {
      activeUsers24h,
      modificationsToday,
      topClient: topClientName || '—',
    },
    chartData,
    recentLogs,
    clients: clientsList,
    users: (profilsRes.data ?? []).map(p => ({ user_id: p.id, user_nom: p.nom || p.email })),
  }
}

// User-agent parsing : extract device OS + browser from raw UA string.
function parseUserAgent(ua: string | null | undefined): { device: string; browser: string } {
  if (!ua) return { device: 'Inconnu', browser: 'Inconnu' }

  let device = 'Autre'
  if (/iPhone|iPad|iPod/i.test(ua)) device = 'iOS'
  else if (/Android/i.test(ua)) device = 'Android'
  else if (/Windows/i.test(ua)) device = 'Windows'
  else if (/Macintosh|Mac OS X/i.test(ua)) device = 'Mac'
  else if (/Linux/i.test(ua)) device = 'Linux'

  let browser = 'Autre'
  if (/Edg\//i.test(ua)) browser = 'Edge'
  else if (/OPR\/|Opera/i.test(ua)) browser = 'Opera'
  else if (/Firefox/i.test(ua)) browser = 'Firefox'
  else if (/Chrome\//i.test(ua)) browser = 'Chrome'
  else if (/Safari/i.test(ua)) browser = 'Safari'

  return { device, browser }
}
