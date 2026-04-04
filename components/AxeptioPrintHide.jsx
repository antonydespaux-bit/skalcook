'use client'

import { useEffect } from 'react'

/**
 * Axeptio injecte le badge dans un shadow DOM : le CSS global ne suffit pas toujours à l'impression.
 * On masque le conteneur #axeptio_overlay en JS à l'ouverture de l'aperçu d'impression, et on appelle l'API officielle.
 * Sur mobile, on repositionne le badge en bas-droite pour ne pas bloquer la navigation du navigateur.
 */
export default function AxeptioPrintHide() {
  useEffect(() => {
    // ── Repositionnement mobile ─────────────────────────────────────
    // Axeptio peut ré-appliquer ses styles inline après notre premier passage.
    // On observe à la fois les mutations DOM (injection du widget) ET les
    // changements d'attribut style sur l'élément lui-même.
    const applyPos = (el) => {
      if (!el || window.innerWidth >= 768) return
      // Si déjà correct → ne rien faire (empêche la boucle infinie avec styleObserver)
      if (
        el.style.getPropertyValue('bottom') === '72px' &&
        el.style.getPropertyValue('right') === '16px' &&
        el.style.getPropertyValue('left') === 'auto'
      ) return
      el.style.setProperty('bottom', '72px', 'important')
      el.style.setProperty('right', '16px', 'important')
      el.style.setProperty('left', 'auto', 'important')
    }

    // Observe les re-styles Axeptio sur l'overlay lui-même
    const styleObserver = new MutationObserver(() => {
      if (window.innerWidth >= 768) return
      const el = document.getElementById('axeptio_overlay')
      if (el) applyPos(el)
    })

    const attachStyleObserver = (el) => {
      styleObserver.disconnect()
      styleObserver.observe(el, { attributes: true, attributeFilter: ['style'] })
    }

    // Observe le DOM body pour détecter l'injection initiale du widget
    const observer = new MutationObserver(() => {
      if (window.innerWidth >= 768) return
      const el = document.getElementById('axeptio_overlay')
      if (!el) return
      applyPos(el)
      attachStyleObserver(el)
    })
    observer.observe(document.body, { childList: true, subtree: true })

    // Au cas où le widget est déjà présent
    const existing = document.getElementById('axeptio_overlay')
    if (existing && window.innerWidth < 768) {
      applyPos(existing)
      attachStyleObserver(existing)
    }

    let savedDisplay = ''

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
      styleObserver.disconnect()
      window.removeEventListener('beforeprint', hide)
      window.removeEventListener('afterprint', show)
      mql?.removeEventListener?.('change', onPrintMediaChange)
      mql?.removeListener?.(onPrintMediaChange)
      show()
    }
  }, [])

  return null
}
