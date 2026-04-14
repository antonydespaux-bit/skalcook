'use client'
import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'

/**
 * NavigationTracker — pose un flag en sessionStorage dès qu'une navigation
 * interne a eu lieu dans l'app. Consommé par `<BackButton />` pour décider
 * entre `router.back()` et un fallback.
 *
 * Le premier rendu (chargement initial de la page) n'est pas compté comme
 * une navigation interne : ainsi, si l'utilisateur arrive directement sur
 * une page (lien externe, refresh, nouvel onglet), le flag reste à 0 et le
 * bouton retour utilise son fallback contextuel.
 */
export default function NavigationTracker() {
  const pathname = usePathname()
  const isFirstRender = useRef(true)

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    try {
      sessionStorage.setItem('skalcook:hasInternalNav', '1')
    } catch {
      // sessionStorage indisponible → on ignore silencieusement
    }
  }, [pathname])

  return null
}
