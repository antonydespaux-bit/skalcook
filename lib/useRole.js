'use client'
import { useState, useEffect } from 'react'
import { supabase } from './supabase'

export function useRole() {
  const [role, setRole] = useState(null)
  const [nom, setNom] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadRole()
  }, [])

  const loadRole = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setLoading(false); return }

    const { data } = await supabase
      .from('profils')
      .select('role, nom')
      .eq('id', session.user.id)
      .single()

    setRole(data?.role || null)
    setNom(data?.nom || session.user.email)
    setLoading(false)
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
