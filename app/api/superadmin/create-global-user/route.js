import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'crypto'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const supabaseServiceRole = createClient(
  supabaseUrl,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const SUPERADMIN_EMAILS = ['antony.despaux@hotmail.fr', 'antony@skalcook.com']

function temporaryPassword() {
  return randomBytes(18).toString('base64url')
}

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

export async function POST(request) {
  try {
    const gate = await requireSuperAdmin(request)
    if (gate.response) return gate.response

    const body = await request.json()
    const email = typeof body.email === 'string' ? body.email.trim() : ''
    const nom = typeof body.nom === 'string' ? body.nom.trim() : ''
    const role = typeof body.role === 'string' ? body.role.trim() : ''
    const tempPasswordInput = typeof body.password_temporaire === 'string' ? body.password_temporaire.trim() : ''
    const clientIds = Array.isArray(body.client_ids) ? body.client_ids.filter(Boolean) : []

    if (!email || !nom || !role) {
      return Response.json({ error: 'Paramètres manquants (email, nom, role).' }, { status: 400 })
    }

    const password = tempPasswordInput || temporaryPassword()

    let createResult = await supabaseServiceRole.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    })

    if (createResult.error) {
      const msg = createResult.error.message || ''
      const exists =
        /already\s*(registered|exists)|user\s*already|duplicate/i.test(msg) ||
        createResult.error.status === 422
      if (exists) {
        return Response.json({ error: 'Un compte existe déjà avec cet email.' }, { status: 409 })
      }
    }

    const { data: created, error: errCreate } = createResult
    if (errCreate || !created?.user?.id) {
      return Response.json(
        { error: errCreate?.message || 'Impossible de créer l’utilisateur.' },
        { status: 400 }
      )
    }

    const userId = created.user.id

    // Profil global: client_id NULL, accès gérés par acces_clients.
    const { error: errProfil } = await supabaseServiceRole
      .from('profils')
      .upsert({
        id: userId,
        email,
        nom,
        role,
        client_id: null
      })

    if (errProfil) {
      await supabaseServiceRole.auth.admin.deleteUser(userId)
      return Response.json({ error: errProfil.message || 'Erreur création profil.' }, { status: 400 })
    }

    if (clientIds.length > 0) {
      const accessRows = clientIds.map((client_id) => ({
        user_id: userId,
        client_id,
        role
      }))

      const { error: errAcces } = await supabaseServiceRole
        .from('acces_clients')
        .insert(accessRows)

      if (errAcces) {
        await supabaseServiceRole.from('profils').delete().eq('id', userId)
        await supabaseServiceRole.auth.admin.deleteUser(userId)
        return Response.json({ error: errAcces.message || 'Erreur création accès.' }, { status: 400 })
      }
    }

    return Response.json({
      success: true,
      user_id: userId,
      email,
      password_temporaire: password
    })
  } catch (err) {
    console.error(err)
    return Response.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

