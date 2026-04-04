‘use client’

import { useEffect } from ‘react’

/**
 * Axeptio injecte le badge dans un shadow DOM : le CSS global ne suffit pas toujours à l’impression.
 * On masque le conteneur #axeptio_overlay en JS à l’ouverture de l’aperçu d’impression, et on appelle l’API officielle.
 * Sur mobile, on repositionne le badge en bas-droite pour ne pas bloquer la navigation du navigateur.
 */
export default function AxeptioPrintHide() {
  useEffect(() => {
    // ── Repositionnement mobile ─────────────────────────────────────
    const applyMobilePosition = () => {
      if (typeof window === ‘undefined’ || window.innerWidth >= 768) return
      const el = document.getElementById(‘axeptio_overlay’)
      if (!el) return
      el.style.setProperty(‘bottom’, ‘72px’, ‘important’)
      el.style.setProperty(‘right’, ‘16px’, ‘important’)
      el.style.setProperty(‘left’, ‘auto’, ‘important’)
    }

    const observer = new MutationObserver(applyMobilePosition)
    observer.observe(document.body, { childList: true, subtree: true })
    applyMobilePosition()

    let savedDisplay = ‘’

    const hide = () => {
      try {
        window.hideAxeptioButton?.()
      } catch {
        /* ignore */
      }
      const el = document.getElementById('axeptio_overlay')
      if (el) {
        savedDisplay = el.style.getPropertyValue('display')
        el.style.setProperty('display', 'none', 'important')
      }
    }

    const show = () => {
      try {
        window.showAxeptioButton?.()
      } catch {
        /* ignore */
      }
      const el = document.getElementById('axeptio_overlay')
      if (el) {
        if (savedDisplay) el.style.setProperty('display', savedDisplay)
        else el.style.removeProperty('display')
        savedDisplay = ''
      }
    }

    window.addEventListener('beforeprint', hide)
    window.addEventListener('afterprint', show)

    const mql = typeof window.matchMedia === 'function' ? window.matchMedia('print') : null
    const onPrintMediaChange = (e) => {
      if (e.matches) hide()
      else show()
    }
    mql?.addEventListener?.('change', onPrintMediaChange)
    mql?.addListener?.(onPrintMediaChange)

    return () => {
      observer.disconnect()
      window.removeEventListener('beforeprint', hide)
      window.removeEventListener('afterprint', show)
      mql?.removeEventListener?.('change', onPrintMediaChange)
      mql?.removeListener?.(onPrintMediaChange)
      show()
    }
  }, [])

  return null
}
