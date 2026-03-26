import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: true, autoRefreshToken: true },
  global: { headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' } }
})

export const getClientId = async () => {
  // Client-side uniquement, avec validation stricte via acces_clients.
  if (typeof window === 'undefined') return null

  const { data: userData, error: userErr } = await supabase.auth.getUser()
  const userId = userData?.user?.id
  if (userErr || !userId) return null

  const { data: accesRows, error: accesErr } = await supabase
    .from('acces_clients')
    .select('client_id')
    .eq('user_id', userId)

  if (accesErr) return null
  const authorized = new Set((accesRows || []).map((r) => r?.client_id).filter(Boolean))
  if (authorized.size === 0) return null

  let fromStorage = null
  try {
    fromStorage = localStorage.getItem('client_id')
  } catch {
    fromStorage = null
  }

  let fromUrl = null
  try {
    const params = new URLSearchParams(window.location.search)
    fromUrl = params.get('client_id') || params.get('clientId') || params.get('clientID')
  } catch {
    fromUrl = null
  }

  // Priorité 1: client_id localStorage/URL, mais seulement s'il est autorisé.
  const candidate = fromStorage || fromUrl
  if (candidate && authorized.has(candidate)) {
    try { localStorage.setItem('client_id', candidate) } catch {}
    return candidate
  }

  // Priorité 2: si un seul accès, on le fixe automatiquement.
  if (authorized.size === 1) {
    const [single] = Array.from(authorized)
    try { localStorage.setItem('client_id', single) } catch {}
    return single
  }

  // Cas multi-établissements: aucun choix valide actif.
  try { localStorage.removeItem('client_id') } catch {}
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
    logo_url: data?.logo_url || null,
    adresse: data?.adresse || '',
    seuil_vert_cuisine: data?.seuil_vert_cuisine ?? 28,
    seuil_orange_cuisine: data?.seuil_orange_cuisine ?? 35,
    seuil_vert_boissons: data?.seuil_vert_boissons ?? 22,
    seuil_orange_boissons: data?.seuil_orange_boissons ?? 28,
    tva_restauration: data?.tva_restauration ?? 10,
  }
}

function extractStoragePathFromPublicUrl(url, bucket) {
  if (!url || !bucket) return null
  try {
    const marker = `/storage/v1/object/public/${bucket}/`
    const idx = url.indexOf(marker)
    if (idx === -1) return null
    return decodeURIComponent(url.slice(idx + marker.length))
  } catch {
    return null
  }
}

async function isUrlReachable(url) {
  if (!url) return false
  try {
    const res = await fetch(url, { method: 'HEAD' })
    return !!res.ok
  } catch {
    return false
  }
}

async function findBestFichePhotoPath(clientId, ficheId, isBar = false) {
  if (!clientId || !ficheId) return null
  const bucket = supabase.storage.from('fiches-photos')
  const prefix = isBar ? `bar-${ficheId}` : `${ficheId}`
  const { data, error } = await bucket.list(clientId, {
    limit: 100,
    search: prefix
  })
  if (error || !data || data.length === 0) return null
  const item = data.find((f) => f?.name?.startsWith(prefix)) || data[0]
  if (!item?.name) return null
  return `${clientId}/${item.name}`
}

// Repare automatiquement photo_url si URL invalide, expirée, ou bucket incohérent.
export const ensureFichePhotoUrl = async ({ tableName, ficheId, clientId, photoUrl, isBar = false }) => {
  if (!tableName || !ficheId || !clientId || !photoUrl) return photoUrl || null

  const currentPath = extractStoragePathFromPublicUrl(photoUrl, 'fiches-photos')
  const currentLooksValid = currentPath && currentPath.startsWith(`${clientId}/`)
  const reachable = currentLooksValid ? await isUrlReachable(photoUrl) : false
  if (currentLooksValid && reachable) {
    return photoUrl
  }

  const repairedPath = await findBestFichePhotoPath(clientId, ficheId, isBar)
  if (!repairedPath) return photoUrl

  const { data: urlData } = supabase.storage.from('fiches-photos').getPublicUrl(repairedPath)
  const repairedUrl = urlData?.publicUrl || photoUrl

  if (repairedUrl && repairedUrl !== photoUrl) {
    await supabase
      .from(tableName)
      .update({ photo_url: repairedUrl })
      .eq('id', ficheId)
      .eq('client_id', clientId)
  }

  return repairedUrl
}
