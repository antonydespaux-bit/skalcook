'use client'
import { useRouter } from 'next/navigation'

/**
 * BackButton — bouton retour intelligent.
 *
 * Comportement :
 *  - Si au moins une navigation interne a eu lieu dans la session courante,
 *    exécute `router.back()` (retour vers la page précédemment consultée).
 *  - Sinon (arrivée directe sur la page, refresh, lien externe),
 *    redirige vers la route de fallback (par défaut `/dashboard`).
 *
 * Le flag `skalcook:hasInternalNav` est posé par `<NavigationTracker />`
 * monté dans `components/Providers.jsx`.
 */
export default function BackButton({
  fallback = '/dashboard',
  label = '← Retour',
  style,
  className,
}) {
  const router = useRouter()

  const handleClick = () => {
    let hasInternalNav = false
    try {
      hasInternalNav =
        typeof window !== 'undefined' &&
        window.sessionStorage.getItem('skalcook:hasInternalNav') === '1'
    } catch {
      // sessionStorage indisponible (mode privé strict) → fallback
    }

    if (hasInternalNav) {
      router.back()
    } else {
      router.push(fallback)
    }
  }

  const defaultStyle = {
    background: 'transparent',
    border: '0.5px solid rgba(255,255,255,0.2)',
    borderRadius: '8px',
    padding: '6px 10px',
    fontSize: '13px',
    cursor: 'pointer',
    color: 'rgba(255,255,255,0.7)',
  }

  return (
    <button
      onClick={handleClick}
      className={className}
      style={{ ...defaultStyle, ...style }}
    >
      {label}
    </button>
  )
}
