import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const supabaseServiceRole = createClient(
  supabaseUrl,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const SUPERADMIN_EMAILS = ['antony.despaux@hotmail.fr', 'antony@skalcook.com']

async function requireSuperAdmin(request) {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return { response: Response.json({ error: 'Non authentifié.' }, { status: 401 }) }
  }

  const jwt = authHeader.slice(7).trim()
  if (!jwt) {
    return { response: Response.json({ error: 'Non authentifié.' }, { status: 401 }) }
  }

  const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey)
  const { data: { user }, error: userErr } = await supabaseAuth.auth.getUser(jwt)
  if (userErr || !user) {
    return { response: Response.json({ error: 'Session invalide.' }, { status: 401 }) }
  }

  const userEmail = (user.email || '').toLowerCase().trim()
  if (SUPERADMIN_EMAILS.includes(userEmail)) {
    return { user }
  }

  const { data: profil, error: profilErr } = await supabaseServiceRole
    .from('profils')
    .select('is_superadmin')
    .eq('id', user.id)
    .single()

  if (profilErr || !profil?.is_superadmin) {
    return { response: Response.json({ error: 'Accès refusé : super admin requis.' }, { status: 403 }) }
  }

  return { user }
}

export async function GET(request) {
  try {
    const gate = await requireSuperAdmin(request)
    if (gate.response) return gate.response

    const url = new URL(request.url)
    const userId = url.searchParams.get('user_id') || ''
    if (!userId) {
      return Response.json({ error: 'Paramètre user_id manquant.' }, { status: 400 })
    }

    const [profilRes, clientsRes, accesRes] = await Promise.all([
      supabaseServiceRole
        .from('profils')
        .select('id, nom, email, role, client_id, created_at')
        .eq('id', userId)
        .maybeSingle(),
      supabaseServiceRole
        .from('clients')
        .select('id, nom_etablissement, nom, slug, actif')
        .order('nom_etablissement', { ascending: true }),
      supabaseServiceRole
        .from('acces_clients')
        .select('client_id')
        .eq('user_id', userId)
    ])

    if (profilRes.error) {
      return Response.json({ error: profilRes.error.message || 'Erreur profil.' }, { status: 400 })
    }
    if (clientsRes.error) {
      return Response.json({ error: clientsRes.error.message || 'Erreur clients.' }, { status: 400 })
    }
    if (accesRes.error) {
      return Response.json({ error: accesRes.error.message || 'Erreur accès.' }, { status: 400 })
    }

    const fromAcces = (accesRes.data || []).map((row) => row.client_id).filter(Boolean)
    const seeded = profilRes.data?.client_id
      ? Array.from(new Set([...fromAcces, profilRes.data.client_id]))
      : fromAcces

    return Response.json({
      profil: profilRes.data || null,
      clients: clientsRes.data || [],
      selectedClientIds: seeded
    })
  } catch (err) {
    console.error(err)
    return Response.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

