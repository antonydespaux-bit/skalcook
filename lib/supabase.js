import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseKey)

// Récupère le client_id depuis le JWT de l'utilisateur connecté
export const getClientId = async () => {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.user?.user_metadata?.client_id || null
}

// Récupère les paramètres depuis la table clients (plus depuis parametres)
export const getParametres = async () => {
  const clientId = await getClientId()
  if (!clientId) return {}

  const { data } = await supabase
    .from('clients')
    .select('*')
    .eq('id', clientId)
    .single()

  if (!data) return {}

  // Retourne le même format qu'avant pour ne pas casser les pages existantes
  return {
    'nom_etablissement': data.nom_etablissement || 'La Fantaisie',
    'adresse': data.adresse || '',
    'seuil_vert_cuisine': data.seuil_vert_cuisine?.toString() || '28',
    'seuil_orange_cuisine': data.seuil_orange_cuisine?.toString() || '35',
    'seuil_vert_boissons': data.seuil_vert_boissons?.toString() || '22',
    'seuil_orange_boissons': data.seuil_orange_boissons?.toString() || '28',
    'tva_restauration': data.tva_restauration?.toString() || '10',
    'couleur_principale': data.couleur_principale || '#2C1810',
    'couleur_accent': data.couleur_accent || '#C4956A',
    'couleur_fond': data.couleur_fond || '#FAF9F6',
    'logo_url': data.logo_url || null,
  }
}
