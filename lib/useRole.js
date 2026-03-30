'use client'
import { useState, useEffect, useCallback } from 'react'
import { usePathname } from 'next/navigation'
import { supabase, getClientId } from './supabase'
import { isSuperadminEmail } from './superadmin'

export function useRole() {
  const [role, setRole] = useState(null)
  const [nom, setNom] = useState('')
  const [loading, setLoading] = useState(true)
  const pathname = usePathname()

  const loadRole = useCallback(async () => {
    const run = async (isRetry) => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user?.id) {
        setLoading(false)
        return
      }

      const userId = session.user.id
      const sessionEmail = (session?.user?.email || '').toLowerCase().trim()
      let email = sessionEmail
      if (!email) {
        const { data: userData } = await supabase.auth.getUser()
        email = (userData?.user?.email || '').toLowerCase().trim()
      }

      const isSuperAdminEmail = isSuperadminEmail(email)

      try {
        // Source de vérité multi-tenant: rôle de acces_clients pour le client actif.
        const activeClientId = await getClientId()
        if (activeClientId) {
          const { data: accessRow, error: accessErr } = await supabase
            .from('acces_clients')
            .select('role')
            .eq('user_id', userId)
            .eq('client_id', activeClientId)
            .maybeSingle()

          if (!accessErr && accessRow?.role) {
            setRole(isSuperAdminEmail ? 'admin' : accessRow.role)
            setNom(session.user?.user_metadata?.nom || session.user.email)
            setLoading(false)
            return
          }
        }

        // Fallback : profils — maybeSingle évite 406 / PGRST116 quand 0 ou plusieurs lignes.
        const { data, error } = await supabase
          .from('profils')
          .select('role, nom, client_id')
          .eq('id', userId)
          .maybeSingle()

        const shouldRefreshSession =
          !isRetry &&
          (Boolean(error) || (data != null && data.client_id == null && !isSuperAdminEmail))

        if (shouldRefreshSession) {
          console.log('Session active ?', !!session)
          const { data: refreshed, error: refreshErr } = await supabase.auth.refreshSession()
          if (!refreshErr && refreshed?.session) {
            await run(true)
            return
          }
        }

        if (error) {
          if (isSuperAdminEmail) {
            setRole('admin')
            setNom('Antony (SuperAdmin)')
            setLoading(false)
            return
          }
          setRole(data?.role || null)
          setNom(data?.nom || session.user.email)
          setLoading(false)
          return
        }

        setRole(isSuperAdminEmail ? 'admin' : (data?.role || null))
        setNom(data?.nom || session.user.email)
        setLoading(false)
      } catch (err) {
        if (isSuperAdminEmail) {
          setRole('admin')
          setNom('Antony (SuperAdmin)')
          setLoading(false)
          return
        }
        setRole(null)
        setNom(session.user.email)
        setLoading(false)
      }
    }

    await run(false)
  }, [])

  useEffect(() => {
    loadRole()
  }, [pathname, loadRole])

  useEffect(() => {
    const handler = () => loadRole()
    if (typeof window !== 'undefined') {
      window.addEventListener('tenant_refresh', handler)
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('tenant_refresh', handler)
      }
    }
  }, [loadRole])

  const peutModifier = role === 'admin' || role === 'cuisine' || role === 'bar'
  const peutVoirCuisine = role === 'admin' || role === 'cuisine' || role === 'directeur'
  const peutVoirBar = role === 'admin' || role === 'bar' || role === 'directeur'
  const estAdmin = role === 'admin'
  const estDirecteur = role === 'directeur'

  return {
    role, nom, loading,
    peutModifier, peutVoirCuisine, peutVoirBar,
    estAdmin, estDirecteur
  }
}
