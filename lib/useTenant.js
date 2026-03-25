'use client'
import { useState, useEffect, createContext, useContext } from 'react'
import { supabase } from './supabase'

const TenantContext = createContext(null)

const SUPERADMIN_EMAILS = ['antony.despaux@hotmail.fr']

export function TenantProvider({ children }) {
  const [tenant, setTenant] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadTenant = async () => {
      try {
        // For super admin, trust localStorage first to avoid mismatches
        // caused by hostname-based tenant detection.
        try {
          const { data: { session } } = await supabase.auth.getSession()
          const email = (session?.user?.email || '').toLowerCase().trim()
          if (SUPERADMIN_EMAILS.includes(email)) {
            const storedClientId = localStorage.getItem('client_id')
            if (storedClientId) {
              const { data } = await supabase
                .from('clients')
                .select('*')
                .eq('id', storedClientId)
                .maybeSingle()
              if (data) {
                setTenant(data)
                setLoading(false)
                return
              }
            }
          }
        } catch (e) {
          // no-op : fallback to hostname/JWT logic below
        }

        const hostname = window.location.hostname
        const parts = hostname.split('.')
        const isReserved = parts[0] === 'www' || parts[0] === 'app' || parts.length < 2 || hostname === 'localhost'
        const slug = isReserved ? null : parts[0]

        if (!slug) {
          const { data: { session } } = await supabase.auth.getSession()
          if (session?.user?.user_metadata?.client_id) {
            const { data } = await supabase
              .from('clients')
              .select('*')
              .eq('id', session.user.user_metadata.client_id)
              .maybeSingle()
            if (data) { setTenant(data); setLoading(false); return }
          }
          setTenant(null)
          setLoading(false)
          return
        }

        const { data } = await supabase
          .from('clients')
          .select('*')
          .eq('slug', slug)
          .maybeSingle()

        setTenant(data || null)
      } catch (err) {
        console.error('Tenant load error:', err)
      } finally {
        setLoading(false)
      }
    }

    loadTenant()
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