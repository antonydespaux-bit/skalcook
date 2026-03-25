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

export const getParametres = async () => {
  const clientId = await getClientId()
  if (!clientId || clientId === 'undefined') {
    return {
      nom_etablissement: '',
      adresse: '',
      seuil_vert_cuisine: 28,
      seuil_orange_cuisine: 35,
      seuil_vert_boissons: 22,
      seuil_orange_boissons: 28,
      tva_restauration: 10,
    }
  }

  const { data } = await supabase
    .from('clients')
    .select('*')
    .eq('id', clientId)
    .maybeSingle()

  return {
    nom_etablissement: data?.nom_etablissement || '',
    adresse: data?.adresse || '',
    seuil_vert_cuisine: data?.seuil_vert_cuisine ?? 28,
    seuil_orange_cuisine: data?.seuil_orange_cuisine ?? 35,
    seuil_vert_boissons: data?.seuil_vert_boissons ?? 22,
    seuil_orange_boissons: data?.seuil_orange_boissons ?? 28,
    tva_restauration: data?.tva_restauration ?? 10,
  }
}
