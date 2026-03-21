'use client'
import { supabase, getClientId } from './supabase'

export async function log({ action, entite, entite_id, entite_nom, section, details }) {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return

    const clientId = await getClientId()
    if (!clientId) return // Sécurité : pas de log sans client_id

    const { data: profil } = await supabase
      .from('profils')
      .select('nom, role')
      .eq('id', session.user.id)
      .single()

    await supabase.from('logs').insert([{
      client_id: clientId,
      user_id: session.user.id,
      user_nom: profil?.nom || session.user.email,
      user_role: profil?.role || 'inconnu',
      action,
      entite,
      entite_id: entite_id?.toString(),
      entite_nom,
      section,
      details
    }])
  } catch (e) {
    console.error('Erreur log:', e)
  }
}
