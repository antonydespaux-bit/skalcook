import { createClient } from '@supabase/supabase-js'
import { isSuperadminEmail } from '../../../../lib/superadmin'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceRole = createClient(
  supabaseUrl,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export async function DELETE(request) {
  try {
    const { id } = await request.json()
    const authHeader = request.headers.get('Authorization')
    const jwt = authHeader?.replace('Bearer ', '')

    // 1. Vérif Auth
    const { data: { user }, error: authErr } = await supabaseServiceRole.auth.getUser(jwt)
    if (authErr || !user) {
      return Response.json({ error: 'Non autorisé' }, { status: 401 })
    }

    // 2. Vérif Superadmin
    const { data: profil } = await supabaseServiceRole
      .from('profils')
      .select('is_superadmin')
      .eq('id', user.id)
      .single()

    if (!isSuperadminEmail(user.email) && !profil?.is_superadmin) {
      return Response.json({ error: 'Accès refusé' }, { status: 403 })
    }

    // 3. Suppression via Service Role
    const { error } = await supabaseServiceRole
      .from('prospects')
      .delete()
      .eq('id', id)

    if (error) throw error

    return Response.json({ success: true })
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}
