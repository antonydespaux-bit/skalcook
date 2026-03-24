import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'crypto'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

const supabaseServiceRole = createClient(
  supabaseUrl,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

function appOrigin(request) {
  const envUrl = process.env.NEXT_PUBLIC_SITE_URL
  if (envUrl) return envUrl.replace(/\/$/, '')
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host')
  const proto = request.headers.get('x-forwarded-proto') || 'http'
  if (host) return `${proto}://${host}`.replace(/\/$/, '')
  return 'http://localhost:3000'
}

function temporaryPassword() {
  return randomBytes(32).toString('base64url')
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

async function rollbackUser(userId) {
  await supabaseServiceRole.from('profils').delete().eq('id', userId)
  await supabaseServiceRole.auth.admin.deleteUser(userId)
}

export async function POST(request) {
  try {
    const gate = await requireSuperAdmin(request)
    if (gate.response) return gate.response

    const body = await request.json()
    const email = typeof body.email === 'string' ? body.email.trim() : ''
    const nom_complet = typeof body.nom_complet === 'string' ? body.nom_complet.trim() : ''
    const client_id = body.client_id

    if (!email || !nom_complet || !client_id) {
      return Response.json({ error: 'Paramètres manquants (email, nom_complet, client_id).' }, { status: 400 })
    }

    const redirectTo = `${appOrigin(request)}/nouveau-mot-de-passe`

    let createResult = await supabaseServiceRole.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { client_id }
    })

    if (createResult.error) {
      const msg = createResult.error.message || ''
      const exists =
        /already\s*(registered|exists)|user\s*already|duplicate/i.test(msg) ||
        createResult.error.status === 422
      if (exists) {
        return Response.json(
          { error: 'Un compte existe déjà avec cet email.' },
          { status: 409 }
        )
      }
      if (/password/i.test(msg)) {
        createResult = await supabaseServiceRole.auth.admin.createUser({
          email,
          password: temporaryPassword(),
          email_confirm: true,
          user_metadata: { client_id }
        })
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

    const { error: errProfil } = await supabaseServiceRole.from('profils').insert({
      id: userId,
      email,
      nom: nom_complet,
      role: 'admin',
      client_id
    })

    if (errProfil) {
      await supabaseServiceRole.auth.admin.deleteUser(userId)
      return Response.json({ error: errProfil.message || 'Erreur création profil.' }, { status: 400 })
    }

    const { data: linkData, error: errLink } = await supabaseServiceRole.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: { redirectTo }
    })

    if (errLink || !linkData?.properties?.action_link) {
      await rollbackUser(userId)
      return Response.json(
        { error: errLink?.message || 'Impossible de générer le lien de récupération.' },
        { status: 400 }
      )
    }

    const supabaseAnon = createClient(supabaseUrl, supabaseAnonKey)
    const { error: errRecoveryEmail } = await supabaseAnon.auth.resetPasswordForEmail(email, {
      redirectTo
    })

    if (errRecoveryEmail) {
      await rollbackUser(userId)
      return Response.json(
        {
          error:
            errRecoveryEmail.message ||
            'Impossible d’envoyer l’email de réinitialisation (vérifiez SMTP et URL autorisées dans Supabase).'
        },
        { status: 502 }
      )
    }

    return Response.json({ success: true, user_id: userId })
  } catch (err) {
    console.error(err)
    return Response.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
