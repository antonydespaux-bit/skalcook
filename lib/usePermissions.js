'use client'
import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase'
import { isSuperadminEmail } from './superadmin'
import { useRole } from './useRole'
import { useTenant } from './useTenant'
import { atteint, niveauEffectif } from './permissions'

// Droits de l'utilisateur dans l'établissement actif (matrice
// permissions_roles, cf. lib/permissions.js). Chargés une fois par
// établissement par PermissionsProvider (components/Providers.jsx) ;
// les composants lisent via usePermissions().
//
// Superadmin : tous les droits. Pendant le chargement, `loading` est vrai et
// peutVoir / peutModifier renvoient false : les garde-fous attendent la fin
// du chargement avant de rediriger.

const PermissionsContext = createContext(null)

export function PermissionsProvider({ children }) {
  const { role, loading: roleLoading } = useRole()
  const tenantCtx = useTenant()
  const clientId = tenantCtx?.tenant?.id || null
  const [lignes, setLignes] = useState([])
  const [estSuperadmin, setEstSuperadmin] = useState(false)
  const [chargement, setChargement] = useState(true)

  useEffect(() => {
    let annule = false
    ;(async () => {
      setChargement(true)
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const email = (session?.user?.email || '').toLowerCase().trim()
        let sa = isSuperadminEmail(email)
        if (!sa && session?.user?.id) {
          const { data: p } = await supabase.from('profils').select('is_superadmin').eq('id', session.user.id).maybeSingle()
          sa = !!p?.is_superadmin
        }
        let rows = []
        if (clientId && !sa) {
          const { data } = await supabase.from('permissions_roles').select('role, fonctionnalite, niveau').eq('client_id', clientId)
          rows = data || []
        }
        if (!annule) { setEstSuperadmin(sa); setLignes(rows) }
      } catch {
        if (!annule) setLignes([])
      } finally {
        if (!annule) setChargement(false)
      }
    })()
    return () => { annule = true }
  }, [clientId])

  const niveau = useCallback((fonctionnalite) => {
    if (estSuperadmin) return 'modification'
    if (!role) return 'aucun'
    return niveauEffectif(lignes, role, fonctionnalite)
  }, [estSuperadmin, role, lignes])

  const valeur = useMemo(() => ({
    loading: chargement || roleLoading,
    role,
    estSuperadmin,
    niveau,
    peutVoir: (f) => atteint(niveau(f), 'lecture'),
    peutModifier: (f) => atteint(niveau(f), 'modification'),
  }), [chargement, roleLoading, role, estSuperadmin, niveau])

  return createElement(PermissionsContext.Provider, { value: valeur }, children)
}

export function usePermissions() {
  const ctx = useContext(PermissionsContext)
  if (ctx) return ctx
  // Hors provider (ne devrait pas arriver) : rien n'est autorisé.
  return { loading: true, role: null, estSuperadmin: false, niveau: () => 'aucun', peutVoir: () => false, peutModifier: () => false }
}
