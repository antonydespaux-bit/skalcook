'use client'
import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { supabase, getClientId } from './supabase'

export function useRole() {
  const [role, setRole] = useState(null)
  const [nom, setNom] = useState('')
  const [loading, setLoading] = useState(true)
  const pathname = usePathname()

  const SUPERADMIN_EMAILS = ['antony.despaux@hotmail.fr', 'antony@skalcook.com']

  useEffect(() => {
    loadRole()
  }, [pathname])

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
  }, [])

  const loadRole = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setLoading(false); return }

    const sessionEmail = (session?.user?.email || '').toLowerCase().trim()
    let email = sessionEmail
    if (!email) {
      const { data: userData } = await supabase.auth.getUser()
      email = (userData?.user?.email || '').toLowerCase().trim()
    }

    const isSuperAdminEmail = SUPERADMIN_EMAILS.includes(email)

    try {
      // Source de vérité multi-tenant: rôle de acces_clients pour le client actif.
      const activeClientId = await getClientId()
      if (activeClientId) {
        const { data: accessRow, error: accessErr } = await supabase
          .from('acces_clients')
          .select('role')
          .eq('user_id', session.user.id)
          .eq('client_id', activeClientId)
          .maybeSingle()

        if (!accessErr && accessRow?.role) {
          const { data: profilNom } = await supabase
            .from('profils')
            .select('nom')
            .eq('id', session.user.id)
            .maybeSingle()

          setRole(isSuperAdminEmail ? 'admin' : accessRow.role)
          setNom(profilNom?.nom || session.user.email)
          setLoading(false)
          return
        }
      }

      // Fallback de compatibilité: profils (ancien modèle).
      const { data, error } = await supabase
        .from('profils')
        .select('role, nom')
        .eq('id', session.user.id)
        .single()

      if (error) {
        if (isSuperAdminEmail) {
          // Ne jamais bloquer l'app superadmin si la ligne profils manque / est inaccessible.
          setRole('admin')
          setNom('Antony (SuperAdmin)')
          setLoading(false)
          return
        }
        // Pour les autres, on laisse l'UI fonctionner avec un role null.
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
