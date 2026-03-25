import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: true, autoRefreshToken: true },
  global: { headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' } }
})

export const getClientId = async () => {
  // Client-side uniquement (localStorage + URL + auth.getUser)
  if (typeof window === 'undefined') return null

  // 1) localStorage (source la plus rapide)
  const stored = localStorage.getItem('client_id')
  if (stored) return stored

  // 2) URL (fallback) : ?client_id=... ou ?clientId=...
  try {
    const params = new URLSearchParams(window.location.search)
    const fromUrl = params.get('client_id') || params.get('clientId') || params.get('clientID')
    if (fromUrl) {
      localStorage.setItem('client_id', fromUrl)
      return fromUrl
    }
  } catch (e) {
    // no-op
  }

  // 3) Requête Supabase (si possible) : récupérer user_metadata.client_id depuis la session
  const { data: userData, error: userErr } = await supabase.auth.getUser()
  if (userErr) return null

  const clientId = userData?.user?.user_metadata?.client_id
  if (clientId) {
    localStorage.setItem('client_id', clientId)
    return clientId
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
