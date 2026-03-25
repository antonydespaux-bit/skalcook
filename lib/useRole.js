'use client'
import { useState, useEffect } from 'react'
import { supabase } from './supabase'

export function useRole() {
  const [role, setRole] = useState(null)
  const [nom, setNom] = useState('')
  const [loading, setLoading] = useState(true)

  const SUPERADMIN_EMAILS = ['antony.despaux@hotmail.fr', 'antony@skalcook.com']

  useEffect(() => {
    loadRole()
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
