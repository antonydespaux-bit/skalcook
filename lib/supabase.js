import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: true, autoRefreshToken: true },
  global: { headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' } }
})

export const getClientId = () => {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('client_id')
  }
  return null
}

export const getParametres = async (clientId) => {
  // Sécurité : si pas de clientId, on ne fait pas la requête qui crash
  if (!clientId || clientId === 'undefined') {
    console.warn("getClientId est indéfini, retour de paramètres par défaut");
    return { seuil_vert_cuisine: 25, seuil_orange_cuisine: 35 }; 
  }

  const { data, error } = await supabase
    .from('parametres')
    .select('*')
    .eq('client_id', clientId)
    .maybeSingle() // plus robuste que single()
    
  return data || { seuil_vert_cuisine: 25, seuil_orange_cuisine: 35 };
}
