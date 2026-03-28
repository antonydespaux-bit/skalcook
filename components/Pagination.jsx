'use client'
import { theme } from '../lib/theme.jsx'

/**
 * Composant de pagination réutilisable.
 *
 * Props :
 *   page         — numéro de page courant (commence à 1)
 *   totalPages   — nombre total de pages
 *   onPageChange — callback (newPage: number) => void
 */
export default function Pagination({ page, totalPages, onPageChange }) {
  const c = theme.couleurs

  if (totalPages <= 1) return null

  const pages = []
  const delta = 2
  const left = Math.max(1, page - delta)
  const right = Math.min(totalPages, page + delta)

  if (left > 1) {
    pages.push(1)
    if (left > 2) pages.push('...')
  }
  for (let i = left; i <= right; i++) pages.push(i)
  if (right < totalPages) {
    if (right < totalPages - 1) pages.push('...')
    pages.push(totalPages)
  }

  const btnStyle = (active) => ({
    padding: '6px 12px',
    borderRadius: '8px',
    border: `0.5px solid ${active ? c.accent : c.bordure}`,
    background: active ? c.accent : 'white',
    color: active ? 'white' : c.texte,
    cursor: active ? 'default' : 'pointer',
    fontSize: '13px',
    fontWeight: active ? '600' : '400',
    minWidth: '36px',
    textAlign: 'center',
  })

  const arrowStyle = (disabled) => ({
    ...btnStyle(false),
    opacity: disabled ? 0.4 : 1,
    cursor: disabled ? 'default' : 'pointer',
  })

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'center', padding: '16px 0' }}>
      <button
        style={arrowStyle(page <= 1)}
        onClick={() => page > 1 && onPageChange(page - 1)}
        disabled={page <= 1}
        aria-label="Page précédente"
      >
        ‹
      </button>

      {pages.map((p, i) =>
        p === '...'
          ? <span key={`ellipsis-${i}`} style={{ padding: '6px 4px', color: c.texteMuted, fontSize: '13px' }}>…</span>
          : (
            <button
              key={p}
              style={btnStyle(p === page)}
              onClick={() => p !== page && onPageChange(p)}
            >
              {p}
            </button>
          )
      )}

      <button
        style={arrowStyle(page >= totalPages)}
        onClick={() => page < totalPages && onPageChange(page + 1)}
        disabled={page >= totalPages}
        aria-label="Page suivante"
      >
        ›
      </button>
    </div>
  )
}
