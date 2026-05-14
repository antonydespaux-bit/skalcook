'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTheme } from '../lib/useTheme'
import { EMOJI_GROUPS, ALL_EMOJIS } from '../lib/emojiData'

/**
 * EmojiPicker — sélecteur d'émojis réutilisable.
 *
 * Usage :
 *   <EmojiPicker value={emoji} onChange={setEmoji} />
 *
 * Le popover est rendu via un Portal React dans `document.body` avec position
 * fixed calculée depuis le trigger. Ça lui permet de survoler n'importe quel
 * conteneur parent, même s'il a un `overflow: hidden` ou un z-index bas.
 *
 * Props :
 *  - value     : émoji actuellement sélectionné (string)
 *  - onChange  : (emoji: string) => void
 *  - size      : 'sm' | 'md' (taille du trigger, défaut 'md')
 *  - disabled  : désactive l'ouverture
 *  - placement : 'bottom' (défaut) ou 'top'
 */
export default function EmojiPicker({
  value = '',
  onChange,
  size = 'md',
  disabled = false,
  placement = 'bottom',
}) {
  const { c } = useTheme()
  const [open, setOpen] = useState(false)
  const [activeGroup, setActiveGroup] = useState(EMOJI_GROUPS[0].id)
  const [search, setSearch] = useState('')
  // Rect du trigger pour positionner le popover. Recalculé à chaque ouverture
  // et lors d'un scroll/resize tant que le popover est ouvert.
  // Pas besoin d'un état `mounted` séparé : `open` est false au premier render
  // (SSR comme client), donc le createPortal ne s'exécute que côté client.
  const [rect, setRect] = useState(null)

  const triggerRef = useRef(null)
  const popoverRef = useRef(null)
  const searchInputRef = useRef(null)

  // Recalcule la position quand on ouvre le picker
  useEffect(() => {
    if (open && triggerRef.current) {
      setRect(triggerRef.current.getBoundingClientRect())
    }
  }, [open])

  // Reposition en cas de scroll ou resize pendant que le popover est ouvert
  useEffect(() => {
    if (!open) return
    const handler = () => {
      if (triggerRef.current) setRect(triggerRef.current.getBoundingClientRect())
    }
    window.addEventListener('scroll', handler, true)
    window.addEventListener('resize', handler)
    return () => {
      window.removeEventListener('scroll', handler, true)
      window.removeEventListener('resize', handler)
    }
  }, [open])

  // Fermer au clic en dehors (trigger ET popover)
  useEffect(() => {
    if (!open) return
    const handler = (e) => {
      if (
        !triggerRef.current?.contains(e.target) &&
        !popoverRef.current?.contains(e.target)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Fermer à l'appui sur Échap
  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open])

  // Focus auto sur le champ recherche à l'ouverture
  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => searchInputRef.current?.focus(), 30)
    return () => clearTimeout(t)
  }, [open])

  // Liste affichée : filtrée par recherche (sur tous les groupes) ou par
  // groupe actif si pas de recherche.
  const displayedEmojis = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (q) {
      return ALL_EMOJIS.filter(item => item.tags.includes(q) || item.e.includes(q))
    }
    const group = EMOJI_GROUPS.find(g => g.id === activeGroup)
    return group ? group.items : []
  }, [search, activeGroup])

  const triggerSize = size === 'sm' ? 36 : 44
  const triggerFontSize = size === 'sm' ? 18 : 22

  const handleSelect = (emoji) => {
    onChange?.(emoji)
    setOpen(false)
  }

  // Position du popover : on l'ancre sur le trigger via le rect courant.
  // Largeur de référence 320px, clamp dans la viewport avec marge de 8px.
  const popoverWidth = 320
  const popoverPosStyle = rect
    ? (() => {
        const left = Math.max(
          8,
          Math.min(rect.left, (typeof window !== 'undefined' ? window.innerWidth : 0) - popoverWidth - 8)
        )
        if (placement === 'top') {
          return { left, bottom: (typeof window !== 'undefined' ? window.innerHeight : 0) - rect.top + 6 }
        }
        return { left, top: rect.bottom + 6 }
      })()
    : {}

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          if (disabled) return
          if (!open) setSearch('')
          setOpen(o => !o)
        }}
        disabled={disabled}
        title="Choisir un émoji"
        style={{
          width: triggerSize,
          height: triggerSize,
          padding: 0,
          borderRadius: 8,
          border: `0.5px solid ${open ? c.accent : c.bordure}`,
          background: c.blanc,
          fontSize: triggerFontSize,
          lineHeight: 1,
          cursor: disabled ? 'not-allowed' : 'pointer',
          textAlign: 'center',
          opacity: disabled ? 0.5 : 1,
          transition: 'border-color 0.15s',
        }}
      >
        {value || <span style={{ fontSize: 14, color: c.texteMuted }}>＋</span>}
      </button>

      {open && rect && createPortal(
        <div
          ref={popoverRef}
          style={{
            position: 'fixed',
            zIndex: 10000,
            width: popoverWidth,
            maxWidth: 'calc(100vw - 16px)',
            background: c.blanc,
            border: `1px solid ${c.bordure}`,
            borderRadius: 12,
            boxShadow: '0 10px 30px rgba(0,0,0,0.15)',
            padding: 10,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            ...popoverPosStyle,
          }}
        >
          {/* Recherche */}
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Rechercher…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              width: '100%',
              padding: '7px 10px',
              borderRadius: 8,
              border: `0.5px solid ${c.bordure}`,
              background: c.fond,
              fontSize: 13,
              outline: 'none',
              color: c.texte,
              boxSizing: 'border-box',
            }}
          />

          {/* Onglets catégories (masqués si recherche active) */}
          {!search.trim() && (
            <div style={{ display: 'flex', gap: 2, overflowX: 'auto', paddingBottom: 4 }}>
              {EMOJI_GROUPS.map(g => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => setActiveGroup(g.id)}
                  title={g.label}
                  style={{
                    flexShrink: 0,
                    width: 32,
                    height: 32,
                    padding: 0,
                    borderRadius: 6,
                    border: 'none',
                    background: activeGroup === g.id ? c.accentClair : 'transparent',
                    fontSize: 16,
                    cursor: 'pointer',
                  }}
                >
                  {g.icon}
                </button>
              ))}
            </div>
          )}

          {/* Grille d'émojis */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(8, 1fr)',
              gap: 2,
              maxHeight: 220,
              overflowY: 'auto',
            }}
          >
            {displayedEmojis.map(item => (
              <button
                key={item.e + item.tags}
                type="button"
                onClick={() => handleSelect(item.e)}
                title={item.tags}
                style={{
                  width: '100%',
                  aspectRatio: '1 / 1',
                  padding: 0,
                  borderRadius: 6,
                  border: 'none',
                  background: value === item.e ? c.accentClair : 'transparent',
                  fontSize: 20,
                  cursor: 'pointer',
                  transition: 'background 0.1s',
                  lineHeight: 1,
                }}
                onMouseEnter={e => { if (value !== item.e) e.currentTarget.style.background = c.fond }}
                onMouseLeave={e => { if (value !== item.e) e.currentTarget.style.background = 'transparent' }}
              >
                {item.e}
              </button>
            ))}
            {displayedEmojis.length === 0 && (
              <div style={{ gridColumn: '1 / -1', padding: '20px 8px', textAlign: 'center', fontSize: 12, color: c.texteMuted }}>
                Aucun émoji ne correspond à « {search} »
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
