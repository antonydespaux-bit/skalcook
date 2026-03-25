
import { useState, useEffect } from 'react'
import { theme } from './theme.jsx'
import { supabase } from './supabase'

const defaultCouleurs = theme.couleurs
const SUPERADMIN_EMAILS = ['antony.despaux@hotmail.fr']
const DEFAULT_SKALCOOK_LOGO = '/skalcook_logo.svg'

export function useTheme() {
  const [darkMode, setDarkMode] = useState(false)
  const [branding, setBranding] = useState(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    const saved = localStorage.getItem('darkMode')
    if (saved === 'true') setDarkMode(true)
    loadBranding()
  }, [])

  const loadBranding = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const email = (session.user?.email || '').toLowerCase().trim()
      const isSuperAdmin = SUPERADMIN_EMAILS.includes(email)

      // Priorité superadmin: client_id localStorage (changement établissement)
      let clientId = null
      if (isSuperAdmin) {
        clientId = localStorage.getItem('client_id')
      }
      if (!clientId) {
        clientId = session.user?.user_metadata?.client_id
      }
      if (!clientId) return

      const { data } = await supabase
        .from('clients')
        .select('nom_etablissement, logo_url, couleur_principale, couleur_accent, couleur_fond, slug')
        .eq('id', clientId)
        .single()
      if (data) setBranding(data)
    } catch (err) {
      console.error('Branding load error:', err)
    }
  }

  const toggleDarkMode = () => {
    const newValue = !darkMode
    setDarkMode(newValue)
    if (typeof window !== 'undefined') localStorage.setItem('darkMode', newValue.toString())
  }

  const c = !mounted ? defaultCouleurs : darkMode ? theme.dark : {
    ...defaultCouleurs,
    ...(branding?.couleur_principale && { principal: branding.couleur_principale }),
    ...(branding?.couleur_accent && { accent: branding.couleur_accent }),
    ...(branding?.couleur_fond && { fond: branding.couleur_fond }),
  }

  return {
    c,
    darkMode,
    toggleDarkMode,
    branding,
    nomEtablissement: branding?.nom_etablissement || '',
    logoUrl: (() => {
      const logoAffiche = branding?.logo_url || DEFAULT_SKALCOOK_LOGO
      console.log('Logo affiché :', logoAffiche)
      return logoAffiche
    })(),
  }
}

