import { supabase } from './supabase'

// Cache court des lectures répétées à chaque page (branding, rôle, profil,
// établissement). Sans lui, chaque composant qui appelle useTheme() (77
// fichiers) ou useRole() relisait la même ligne à son montage et à chaque
// navigation : 5 à 10 requêtes identiques par page, qui s'empilent quand
// l'instance Supabase ralentit.
//
// Même principe que getClientId() (lib/supabase.js) : on partage la même
// promesse pendant TTL_MS. Une réponse en erreur n'est pas gardée. Le cache
// est vidé au changement d'établissement (tenant_refresh), à la connexion /
// déconnexion, et par viderCacheLectures() après une modification de ces
// données (paramètres, mon compte).

const TTL_MS = 60_000
const cache = new Map() // cle -> { promise, at }

/**
 * @template T
 * @param {string} cle  identifiant de la lecture (inclure user / établissement)
 * @param {() => Promise<T>} charger  requête Supabase ({ data, error })
 * @returns {Promise<T>}
 */
export function memoLecture(cle, charger, ttl = TTL_MS) {
  const now = Date.now()
  const existant = cache.get(cle)
  if (existant && now - existant.at < ttl) return existant.promise

  const promise = Promise.resolve().then(charger)
  cache.set(cle, { promise, at: now })
  const oublier = () => { if (cache.get(cle)?.promise === promise) cache.delete(cle) }
  promise.then((res) => { if (res?.error) oublier() }, oublier)
  return promise
}

export function viderCacheLectures() {
  cache.clear()
}

if (typeof window !== 'undefined') {
  // Enregistré au chargement du module, donc avant les écouteurs des hooks :
  // ils relisent après le vidage.
  window.addEventListener('tenant_refresh', viderCacheLectures)
  supabase.auth.onAuthStateChange((event) => {
    if (event !== 'TOKEN_REFRESHED') viderCacheLectures()
  })
}
