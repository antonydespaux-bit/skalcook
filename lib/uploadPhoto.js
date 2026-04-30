const MIME_MAP = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg',
  png: 'image/png', webp: 'image/webp',
  gif: 'image/gif', heic: 'image/heic', heif: 'image/heif',
}

/**
 * Upload une photo de fiche vers Supabase Storage.
 *
 * Le SDK Supabase ignore l'option `contentType` quand fileBody instanceof Blob
 * (il utilise FormData, et le navigateur détermine le Content-Type depuis blob.type,
 * ce qui est instable pour les parts multipart sans filename explicite).
 *
 * Fix : passer un ArrayBuffer (pas un Blob) → le SDK utilise la branche binaire
 * et set headers["content-type"] = options.contentType explicitement.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ clientId: string, ficheId: string, file: File|Blob, isBar?: boolean }} opts
 * @returns {Promise<string>} URL publique de la photo uploadée
 */
export async function uploadFichePhoto(supabase, { clientId, ficheId, file, isBar = false }) {
  const ext = file.name.split('.').pop().toLowerCase()
  const mimeType = MIME_MAP[ext] || 'image/jpeg'
  const folder = isBar ? 'bar' : 'cuisine'
  const path = `${folder}/${ficheId}.${ext}`

  // Lire les octets bruts en ArrayBuffer (pas Blob !)
  // → le SDK Supabase utilise la branche binary upload (pas FormData)
  // → headers["content-type"] = mimeType est envoyé explicitement au serveur
  const buffer = await file.arrayBuffer()

  // Supprimer tous les fichiers existants pour ce ficheId (toutes extensions)
  const { data: existing } = await supabase.storage
    .from('fiches-photos').list(folder, { search: ficheId })
  if (existing?.length) {
    await supabase.storage.from('fiches-photos')
      .remove(existing.map(f => `${folder}/${f.name}`))
  }

  // Upload ArrayBuffer avec contentType explicite — option désormais respectée
  const { error } = await supabase.storage
    .from('fiches-photos').upload(path, buffer, { contentType: mimeType, cacheControl: '3600', upsert: false })
  if (error) throw new Error(`Upload échoué : ${error.message}`)

  // Retourner l'URL publique (le bucket fiches-photos est public)
  const { data } = supabase.storage.from('fiches-photos').getPublicUrl(path)
  return data.publicUrl
}
