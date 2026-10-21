import { supabase } from './supabase'
import { memoLecture } from './requeteCache'

// Profil de l'utilisateur connecté (nom, rôle historique, superadmin), lu une
// fois pour useRole, usePermissions et le journal d'activité.
export function monProfil(userId) {
  return memoLecture(`profil:${userId}`, () => supabase
    .from('profils')
    .select('nom, role, is_superadmin')
    .eq('id', userId)
    .maybeSingle())
}
