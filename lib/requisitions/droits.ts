import { niveauUtilisateur } from '../apiGuards'

// Niveaux de l'utilisateur utiles aux réquisitions (côté serveur). Les routes
// combinent ces droits avec l'appartenance aux services (service_membres).

export interface NiveauxRequisitions {
  administration: string
  requisitions: string
  analyses: string
}

export async function niveauxRequisitions(user: { id: string; email?: string }, clientId: string): Promise<NiveauxRequisitions> {
  const [administration, requisitions, analyses] = await Promise.all([
    niveauUtilisateur(user, clientId, 'administration'),
    niveauUtilisateur(user, clientId, 'requisitions'),
    niveauUtilisateur(user, clientId, 'requisitions_analyses'),
  ])
  return { administration, requisitions, analyses }
}
