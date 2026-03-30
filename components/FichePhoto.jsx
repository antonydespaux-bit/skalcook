'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

const BUCKET = 'fiches-photos'
const MAX_WIDTH = 1200
const MAX_HEIGHT = 900

/**
 * Extrait le chemin relatif depuis une URL complète Supabase Storage.
 * Si la valeur est déjà un chemin relatif, elle est retournée telle quelle.
 */
function extractStoragePath(raw) {
  if (!raw) return null
  if (!raw.startsWith('http')) return raw
  // Format URL publique : .../storage/v1/object/public/<bucket>/...
  const pub = `/storage/v1/object/public/${BUCKET}/`
  const iPub = raw.indexOf(pub)
  if (iPub !== -1) return decodeURIComponent(raw.slice(iPub + pub.length))
  // Format URL signée : .../storage/v1/object/sign/<bucket>/...?token=...
  const sign = `/storage/v1/object/sign/${BUCKET}/`
  const iSign = raw.indexOf(sign)
  if (iSign !== -1) return decodeURIComponent(raw.slice(iSign + sign.length).split('?')[0])
  return raw
}

/**
 * S'assure que le chemin relatif commence toujours par "cuisine/".
 * Les anciennes entrées en base ne contiennent parfois que "{clientId}/{ficheId}.jpg".
 */
function normalizePath(path) {
  if (!path) return null
  // Retire les slashes multiples, puis ajoute cuisine/ si absent
  const clean = path.replace(/\/+/g, '/')
  return /^cuisine\//.test(clean) ? clean : `cuisine/${clean}`
}

/**
 * Retourne l'URL publique d'un fichier dans le bucket public fiches-photos.
 */
function getPublicImageUrl(path) {
  if (!path) return null
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return data?.publicUrl || null
}

/**
 * Redimensionne un fichier image côté client via <canvas> avant upload.
 * Produit un Blob JPEG ≤ ~500 Ko.
 */
async function resizeImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      let { width, height } = img
      const ratio = Math.min(MAX_WIDTH / width, MAX_HEIGHT / height, 1)
      width = Math.round(width * ratio)
      height = Math.round(height * ratio)
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      canvas.getContext('2d').drawImage(img, 0, 0, width, height)
      canvas.toBlob(blob => {
        if (blob) resolve(blob)
        else reject(new Error('Échec de la conversion canvas'))
      }, 'image/jpeg', 0.85)
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image invalide')) }
    img.src = url
  })
}

/**
 * Composant photo pour les fiches techniques.
 *
 * @param {string}   ficheId       - UUID de la fiche
 * @param {string}   clientId      - UUID du client (= dossier dans le bucket)
 * @param {string|null} photoPath  - Chemin stocké en DB (ex: "cuisine/{clientId}/{ficheId}.jpg") ou null
 * @param {boolean}  peutModifier  - Affiche les contrôles d'upload/suppression
 * @param {function} onPhotoChange - Callback(newPath|null) après upload ou suppression
 * @param {object}   c             - Couleurs du thème
 */
export default function FichePhoto({ ficheId, clientId, photoPath, peutModifier, onPhotoChange, onSignedUrlChange, c = {} }) {
  const [signedUrl, setSignedUrl] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef(null)

  // Résout l'URL publique quand le chemin change
  useEffect(() => {
    const path = normalizePath(extractStoragePath(photoPath))
    const url = getPublicImageUrl(path)
    setSignedUrl(url)
    onSignedUrlChange?.(url)
  }, [photoPath])

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) { setError('Seules les images sont acceptées (JPEG, PNG, WebP)'); return }

    setError('')
    setUploading(true)
    try {
      const storagePath = `cuisine/${clientId}/${ficheId}.jpg`.replace(/\/+/g, '/')

      // Supprime l'ancienne photo si elle existe
      const oldPath = normalizePath(extractStoragePath(photoPath))
      if (oldPath) {
        await supabase.storage.from(BUCKET).remove([oldPath])
      }

      console.log('Fichier envoyé:', file)
      let { data, error: uploadErr } = await supabase.storage
        .from('fiches-photos')
        .upload(storagePath, file, {
          contentType: 'image/jpeg',
          upsert: false,
        })

      // Si le fichier existe déjà, on le supprime puis on réessaie
      if (uploadErr?.statusCode === '409' || uploadErr?.message?.includes('already exists')) {
        await supabase.storage.from('fiches-photos').remove([storagePath])
        ;({ data, error: uploadErr } = await supabase.storage
          .from('fiches-photos')
          .upload(storagePath, file, {
            contentType: 'image/jpeg',
            upsert: false,
          }))
      }

      if (uploadErr) throw uploadErr

      // Sauvegarde le chemin dans la colonne photo_url de la fiche
      const { error: dbErr } = await supabase
        .from('fiches')
        .update({ photo_url: storagePath })
        .eq('id', ficheId)
        .eq('client_id', clientId)

      if (dbErr) throw dbErr

      onPhotoChange?.(storagePath)
    } catch (err) {
      console.error('Upload photo error:', err)
      setError('Erreur lors de l\'upload. Réessaie.')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const handleDelete = async () => {
    if (!photoPath) return
    if (!confirm('Supprimer la photo de cette fiche ?')) return
    setUploading(true)
    try {
      const path = normalizePath(extractStoragePath(photoPath))
      if (path) await supabase.storage.from(BUCKET).remove([path])
      await supabase.from('fiches').update({ photo_url: null }).eq('id', ficheId).eq('client_id', clientId)
      setSignedUrl(null)
      onPhotoChange?.(null)
    } catch (err) {
      console.error('Delete photo error:', err)
      setError('Erreur lors de la suppression.')
    } finally {
      setUploading(false)
    }
  }

  const accent = c.accent || '#6366F1'
  const fond = c.fond || '#F5F5F0'
  const bordure = c.bordure || '#E4E4E7'
  const texteMuted = c.texteMuted || '#888'

  return (
    <div>
      {/* ── Photo existante ── */}
      {signedUrl ? (
        <div style={{ position: 'relative', marginBottom: peutModifier ? '10px' : 0 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={signedUrl}
            alt="Photo de la fiche"
            className="fiche-photo"
            style={{
              width: '100%',
              maxHeight: '320px',
              objectFit: 'cover',
              borderRadius: '10px',
              display: 'block',
              border: `0.5px solid ${bordure}`,
            }}
          />
          {peutModifier && (
            <div style={{ position: 'absolute', top: '8px', right: '8px', display: 'flex', gap: '6px' }}>
              <button
                onClick={() => inputRef.current?.click()}
                disabled={uploading}
                style={{
                  background: 'rgba(0,0,0,0.55)', color: 'white', border: 'none',
                  borderRadius: '6px', padding: '6px 10px', fontSize: '12px',
                  cursor: 'pointer', fontWeight: '500',
                }}
              >✏️ Changer</button>
              <button
                onClick={handleDelete}
                disabled={uploading}
                style={{
                  background: 'rgba(180,0,0,0.65)', color: 'white', border: 'none',
                  borderRadius: '6px', padding: '6px 10px', fontSize: '12px',
                  cursor: 'pointer', fontWeight: '500',
                }}
              >🗑</button>
            </div>
          )}
        </div>
      ) : (
        /* ── Placeholder upload ── */
        peutModifier && (
          <button
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            style={{
              width: '100%', padding: '20px', border: `1.5px dashed ${bordure}`,
              borderRadius: '10px', background: fond, cursor: 'pointer',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px',
              marginBottom: '10px', color: texteMuted, fontSize: '13px',
            }}
          >
            <span style={{ fontSize: '28px' }}>📷</span>
            <span>{uploading ? 'Upload en cours…' : 'Ajouter une photo'}</span>
            <span style={{ fontSize: '11px', opacity: 0.7 }}>JPEG · PNG · WebP — max 5 Mo — redimensionné automatiquement</span>
          </button>
        )
      )}

      {/* Input caché */}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      {error && (
        <div style={{ color: '#A32D2D', fontSize: '12px', marginTop: '6px' }}>{error}</div>
      )}
    </div>
  )
}
