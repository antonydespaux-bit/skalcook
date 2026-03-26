import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)
const supabaseAnon = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
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

  const { data: { user }, error: userErr } = await supabaseAnon.auth.getUser(jwt)
  if (userErr || !user) {
    return { response: Response.json({ error: 'Session invalide.' }, { status: 401 }) }
  }

  const email = (user.email || '').toLowerCase().trim()
  if (SUPERADMIN_EMAILS.includes(email)) return { user }

  const { data: profil, error: profilErr } = await supabaseAdmin
    .from('profils')
    .select('is_superadmin')
    .eq('id', user.id)
    .single()

  if (profilErr || !profil?.is_superadmin) {
    return { response: Response.json({ error: 'Accès refusé : super admin requis.' }, { status: 403 }) }
  }
  return { user }
}

export async function POST(request) {
  try {
    const gate = await requireSuperAdmin(request)
    if (gate.response) return gate.response

    const { email, password, nom, role, client_id } = await request.json()

    if (!email || !password || !nom) {
      return Response.json({ error: 'Paramètres manquants' }, { status: 400 })
    }

    if (!client_id) {
      return Response.json({ error: 'client_id manquant' }, { status: 400 })
    }

    // Créer l'utilisateur avec client_id dans le JWT
    const { data, error: errCreate } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { client_id }
    })

    if (errCreate) {
      return Response.json({ error: errCreate.message }, { status: 400 })
    }

    // Créer le profil avec client_id
    const { error: errProfil } = await supabaseAdmin
      .from('profils')
      .upsert({
        id: data.user.id,
        email,
        nom,
        role: role || 'cuisine',
        client_id
      })

    if (errProfil) {
      return Response.json({ error: errProfil.message }, { status: 400 })
    }

    return Response.json({ success: true, user: data.user })

  } catch (err) {
    console.error(err)
    return Response.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
