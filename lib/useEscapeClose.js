'use client'
import { useEffect } from 'react'

/**
 * Ferme un overlay (modal, popover) sur appui de la touche Échap.
 * Pas de capture : si un champ avec son propre handler Escape l'a déjà géré
 * (ex: edit inline) et appelé stopPropagation, on ne ferme pas le modal.
 */
export function useEscapeClose(onClose) {
  useEffect(() => {
    if (!onClose) return
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
}
