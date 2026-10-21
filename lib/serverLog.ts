import type { SupabaseClient } from '@supabase/supabase-js'
import { after } from 'next/server'

// Journal d'activité écrit côté serveur (routes API), même table et même
// forme que lib/useLog.js côté navigateur. Sert aux actions qui passent par
// l'API (achats, inventaires, ventes) et n'étaient pas journalisées : sans
// elles, l'onglet Activité du superadmin restait vide alors que les équipes
// saisissaient des factures tous les jours.
//
// Ne lève jamais : un échec de journalisation ne doit pas faire échouer
// l'action de l'utilisateur.
//
// Dans une route API, l'écriture part APRÈS l'envoi de la réponse (after() de
// Next.js) : l'utilisateur n'attend plus la lecture du profil ni l'insertion
// du log (jusqu'à 4 s quand l'instance Supabase ralentit). Hors requête
// (tests, scripts), l'écriture est faite tout de suite.

type Action = 'CREATION' | 'MODIFICATION' | 'SUPPRESSION' | 'IMPORT' | 'VALIDATION' | 'FUSION' | 'CONNEXION'

export async function logServeur(
  db: SupabaseClient,
  params: {
    user: { id: string; email?: string } | null
    /** null uniquement pour une action du superadmin hors établissement. */
    clientId: string | null
    sansEtablissement?: boolean
    action: Action
    entite: string
    entiteId?: string | null
    entiteNom?: string | null
    section?: string | null
    details?: Record<string, unknown> | null
    request?: Request
  },
): Promise<void> {
  const { user, clientId, action, entite, entiteId, entiteNom, section, details, request, sansEtablissement } = params
  if (!user?.id || (!clientId && !sansEtablissement)) return
  // Lu tout de suite : la requête peut ne plus être lisible après la réponse.
  const userAgent = request?.headers.get('user-agent') ?? null

  const ecrire = async () => {
    try {
      const { data: profil } = await db.from('profils').select('nom, role').eq('id', user.id).maybeSingle()
      const p = profil as { nom?: string | null; role?: string | null } | null
      const { error } = await db.from('logs').insert([{
        client_id: clientId || null,
        user_id: user.id,
        user_nom: p?.nom || user.email || null,
        user_role: p?.role || 'inconnu',
        action,
        entite,
        entite_id: entiteId ?? null,
        entite_nom: entiteNom ?? null,
        section: section ?? null,
        details: details ? JSON.stringify(details) : null,
        user_agent: userAgent,
      }])
      if (error) console.error('[logServeur]', error.message)
    } catch (e) {
      console.error('[logServeur]', e)
    }
  }

  try {
    after(ecrire)
  } catch {
    // Hors du contexte d'une requête Next.js.
    await ecrire()
  }
}
