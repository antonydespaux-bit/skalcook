import type { SupabaseClient } from '@supabase/supabase-js'

// Journal d'activité écrit côté serveur (routes API), même table et même
// forme que lib/useLog.js côté navigateur. Sert aux actions qui passent par
// l'API (achats, inventaires, ventes) et n'étaient pas journalisées : sans
// elles, l'onglet Activité du superadmin restait vide alors que les équipes
// saisissaient des factures tous les jours.
//
// Ne lève jamais : un échec de journalisation ne doit pas faire échouer
// l'action de l'utilisateur.

type Action = 'CREATION' | 'MODIFICATION' | 'SUPPRESSION' | 'IMPORT' | 'VALIDATION' | 'FUSION'

export async function logServeur(
  db: SupabaseClient,
  params: {
    user: { id: string; email?: string } | null
    clientId: string
    action: Action
    entite: string
    entiteId?: string | null
    entiteNom?: string | null
    section?: string | null
    details?: Record<string, unknown> | null
    request?: Request
  },
): Promise<void> {
  const { user, clientId, action, entite, entiteId, entiteNom, section, details, request } = params
  if (!user?.id || !clientId) return
  try {
    const { data: profil } = await db.from('profils').select('nom, role').eq('id', user.id).maybeSingle()
    const p = profil as { nom?: string | null; role?: string | null } | null
    const { error } = await db.from('logs').insert([{
      client_id: clientId,
      user_id: user.id,
      user_nom: p?.nom || user.email || null,
      user_role: p?.role || 'inconnu',
      action,
      entite,
      entite_id: entiteId ?? null,
      entite_nom: entiteNom ?? null,
      section: section ?? null,
      details: details ? JSON.stringify(details) : null,
      user_agent: request?.headers.get('user-agent') ?? null,
    }])
    if (error) console.error('[logServeur]', error.message)
  } catch (e) {
    console.error('[logServeur]', e)
  }
}
