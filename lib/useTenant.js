'use client'
import { useState, useEffect, createContext, useContext } from 'react'
import { usePathname } from 'next/navigation'
import { supabase, getClientId } from './supabase'
import { isSuperadminEmail } from './superadmin'
import { log } from './useLog'
import { memoLecture } from './requeteCache'

// L'établissement est relu à chaque navigation (pathname) : on partage la
// lecture quelques secondes au lieu de refaire la requête à chaque page.
const lireClient = (champ, valeur) => memoLecture(`client:${champ}:${valeur}`, () => supabase
  .from('clients')
  .select('*')
  .eq(champ, valeur)
  .maybeSingle())

const TenantContext = createContext(null)

function withHasBar(tenant) {
  if (!tenant) return tenant
  // Si le champ existe déjà (type boolean), on le respecte.
  if (typeof tenant.has_bar === 'boolean') return tenant
  const modules = Array.isArray(tenant.modules_actifs) ? tenant.modules_actifs : []
  return { ...tenant, has_bar: modules.includes('bar') }
}

export function TenantProvider({ children }) {
  const [tenant, setTenant] = useState(null)
  const [loading, setLoading] = useState(true)
  const pathname = usePathname()
  const [refreshNonce, setRefreshNonce] = useState(0)

  useEffect(() => {
    const loadTenant = async () => {
      try {
        // Priorite globale: si un client_id est choisi dans localStorage, on charge ce tenant.
        // Cela permet un vrai mode multi-etablissements independant du profil/JWT.
        const storedClientId = localStorage.getItem('client_id')
        if (storedClientId) {
          const { data } = await lireClient('id', storedClientId)
          if (data) {
            setTenant(withHasBar(data))
            return
          }
        }

        try {
          const { data: { session } } = await supabase.auth.getSession()
          const email = (session?.user?.email || '').toLowerCase().trim()
          if (isSuperadminEmail(email)) {
            const storedClientId = localStorage.getItem('client_id')
            if (storedClientId) {
              const { data } = await lireClient('id', storedClientId)
              if (data) {
                setTenant(withHasBar(data))
                return
              }
            }
            // Pour superadmin: si pas de client_id en localStorage, ne pas choisir un tenant par défaut.
            setTenant(null)
            return
          }
        } catch (e) {
          // no-op : fallback to hostname/JWT logic below
        }

        const hostname = window.location.hostname
        const parts = hostname.split('.')
        const isReserved = parts[0] === 'www' || parts[0] === 'app' || parts.length < 2 || hostname === 'localhost'
        const slug = isReserved ? null : parts[0]

        if (!slug) {
          const resolvedClientId = await getClientId()
          if (resolvedClientId) {
            const { data } = await lireClient('id', resolvedClientId)
            if (data) { setTenant(withHasBar(data)); return }
          }
          setTenant(null)
          return
        }

        const { data } = await lireClient('slug', slug)

        if (data) {
          setTenant(withHasBar(data))
          return
        }

        // Fallback: cookie tenant_slug posé par le middleware (Vercel preview, URL sans sous-domaine client).
        const cookieSlug = document.cookie
          .split('; ')
          .find(r => r.startsWith('tenant_slug='))
          ?.split('=')[1]
        if (cookieSlug && cookieSlug !== slug) {
          const { data: cookieData } = await lireClient('slug', cookieSlug)
          if (cookieData) { setTenant(withHasBar(cookieData)); return }
        }

        setTenant(null)
      } catch (err) {
        console.error('Tenant load error:', err)
      } finally {
        setLoading(false)
      }
    }

    loadTenant()
  }, [pathname, refreshNonce])

  // Journal de connexion : une entrée « CONNEXION » par jour, par navigateur
  // et par établissement ouvert. La date de dernière connexion d'auth ne
  // bouge qu'à la saisie du mot de passe ; ceci donne un vrai historique
  // d'usage dans Superadmin › Activité.
  useEffect(() => {
    if (!tenant?.id) return
    const jour = new Date().toISOString().slice(0, 10)
    const cle = `skalcook_connexion_${tenant.id}_${jour}`
    try {
      if (localStorage.getItem(cle)) return
      localStorage.setItem(cle, '1')
    } catch {
      return
    }
    log({ action: 'CONNEXION', entite: 'session', entite_nom: tenant.nom_etablissement || tenant.nom || null })
  }, [tenant?.id])

  useEffect(() => {
    const handler = () => setRefreshNonce(n => n + 1)
    window.addEventListener('tenant_refresh', handler)
    return () => window.removeEventListener('tenant_refresh', handler)
  }, [])

  return (
    <TenantContext.Provider value={{ tenant, loading }}>
      {children}
    </TenantContext.Provider>
  )
}

export function useTenant() {
  return useContext(TenantContext)
}
// Fin du fichier useTenant.js