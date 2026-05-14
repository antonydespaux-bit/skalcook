'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useTheme } from '../lib/useTheme'
import { EMOJI_GROUPS, ALL_EMOJIS } from '../lib/emojiData'

/**
 * EmojiPicker — sélecteur d'émojis réutilisable.
 *
 * Usage :
 *   <EmojiPicker value={emoji} onChange={setEmoji} />
 *
 * UX : un bouton compact affichant l'émoji actuel (ou un placeholder), qui
 * ouvre un popover contenant des onglets par catégorie + une recherche
 * textuelle. Le popover se ferme automatiquement après sélection ou au clic
 * en dehors.
 *
 * Props :
 *  - value     : émoji actuellement sélectionné (string)
 *  - onChange  : (emoji: string) => void
 *  - size      : 'sm' | 'md' (taille du bouton trigger, défaut 'md')
 *  - disabled  : désactive l'ouverture
 *  - placement : 'bottom' | 'top' (défaut 'bottom') — sens d'ouverture du popover
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
  const containerRef = useRef(null)
  const searchInputRef = useRef(null)

  // Fermer au clic en dehors
  useEffect(() => {
    if (!open) return
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Focus automatique sur le champ recherche à l'ouverture.
  // Le reset du champ recherche est fait dans le handler de toggle, pas ici,
  // pour éviter un setState synchrone dans un effect (cascading renders).
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

  return (
    <div ref={containerRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        onClick={() => {
          if (disabled) return
          // Reset la recherche à l'ouverture pour repartir d'une grille neuve.
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

      {open && (
        <div
          style={{
            position: 'absolute',
            [placement === 'top' ? 'bottom' : 'top']: triggerSize + 6,
            left: 0,
            zIndex: 1000,
            width: 320,
            maxWidth: 'calc(100vw - 32px)',
            background: c.blanc,
            border: `1px solid ${c.bordure}`,
            borderRadius: 12,
            boxShadow: '0 10px 30px rgba(0,0,0,0.15)',
            padding: 10,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
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
        </div>
      )}
    </div>
  )
}
