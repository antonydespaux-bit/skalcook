'use client'
import { useState, useEffect, createContext, useContext } from 'react'
import { supabase } from './supabase'

const TenantContext = createContext(null)

export function TenantProvider({ children }) {
  const [tenant, setTenant] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadTenant()
  }, [])

  const loadTenant = async () => {
    try {
      // 1. Essayer depuis le cookie
      const slug = getCookie('tenant_slug')

      // 2. Essayer depuis le JWT de l'utilisateur connecté
      if (!slug) {
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.user?.user_metadata?.client_id) {
          const { data } = await supabase
            .from('clients')
            .select('*')
            .eq('id', session.user.user_metadata.client_id)
            .single()
          if (data) { setTenant(data); setLoading(false); return }
        }
      }

      // 3. Charger depuis Supabase via le slug
      if (slug) {
        const { data } = await supabase
          .from('clients')
          .select('*')
          .eq('slug', slug)
          .single()
        if (data) setTenant(data)
      }
    } catch (err) {
      console.error('Tenant load error:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <TenantContext.Provider value={{ tenant, loading }}>
      {children}
    </TenantContext.Provider>
  )
}

export function useTenant() {
  return useContext(TenantContext)
}

function getCookie(name) {
  if (typeof document === 'undefined') return null
  const value = `; ${document.cookie}`
  const parts = value.split(`; ${name}=`)
  if (parts.length === 2) return parts.pop().split(';').shift()
  return null
}
