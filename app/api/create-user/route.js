import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export async function POST(request) {
  try {
    const { email, password, nom, role } = await request.json()

    if (!email || !password || !nom) {
      return Response.json({ error: 'Paramètres manquants' }, { status: 400 })
    }

    // Créer l'utilisateur avec le client admin
    const { data, error: errCreate } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    })

    if (errCreate) {
      return Response.json({ error: errCreate.message }, { status: 400 })
    }

    // Créer le profil
    const { error: errProfil } = await supabaseAdmin
      .from('profils')
      .upsert({
        id: data.user.id,
        email,
        nom,
        role: role || 'cuisine'
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
