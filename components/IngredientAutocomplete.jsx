'use client'
import { useState, useRef, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { useTheme } from '../lib/useTheme'

const MAX_LIST_HEIGHT = 240
const MARGIN = 4
const VIEWPORT_PADDING = 8

/**
 * Champ de saisie de désignation pour ligne de facture, avec autocomplétion
 * sur la liste des ingrédients du client.
 *
 * Différences avec <IngredientSearch> (utilisé dans les fiches techniques) :
 * - value = texte libre (pas un ingredient_id)
 * - onChange(text) → saisie libre, l'utilisateur peut taper une désignation
 *   qui ne correspond à aucun ingrédient (ex : libellé OCR)
 * - onSelect(ingredient) → quand l'utilisateur clique sur une suggestion ;
 *   le parent décide de remplir la désignation et de lier l'ingrédient
 *
 * La liste de suggestions est rendue via un Portal (position fixed) pour
 * échapper aux conteneurs `overflow` (tableau, modal) qui la rogneraient.
 */
export default function IngredientAutocomplete({
  ingredients = [],
  value = '',
  onChange,
  onSelect,
  placeholder = 'Nom du produit',
  style = {},
  inputStyle = {},
}) {
  const { c } = useTheme()
  const [ouvert, setOuvert] = useState(false)
  const [surbrillance, setSurbrillance] = useState(-1)
  const [coords, setCoords] = useState(null)
  const inputRef = useRef(null)

  const recherche = String(value || '')

  // Match par début de mot (évite "BOEUF" quand on tape "OEUF")
  const ingredientsFiltres = recherche.length > 0
    ? ingredients.filter(i => {
        const termeNorm = recherche.toLowerCase()
        const nomNorm = (i.nom || '').toLowerCase()
        return nomNorm.startsWith(termeNorm) ||
          nomNorm.split(/[\s\-]+/).some(mot => mot.startsWith(termeNorm))
      }).slice(0, 12)
    : []

  const computeCoords = () => {
    if (!inputRef.current) return null
    const rect = inputRef.current.getBoundingClientRect()
    const spaceBelow = window.innerHeight - rect.bottom - VIEWPORT_PADDING
    const spaceAbove = rect.top - VIEWPORT_PADDING
    const flipAbove = spaceBelow < 120 && spaceAbove > spaceBelow
    const maxHeight = Math.max(80, Math.min(MAX_LIST_HEIGHT, flipAbove ? spaceAbove : spaceBelow))
    return {
      left: rect.left,
      width: rect.width,
      top: flipAbove ? null : rect.bottom + MARGIN,
      bottom: flipAbove ? window.innerHeight - rect.top + MARGIN : null,
      maxHeight,
    }
  }

  useLayoutEffect(() => {
    if (!ouvert || ingredientsFiltres.length === 0) return
    // Sync DOM measurement → state : useLayoutEffect est l'endroit prévu pour ça.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCoords(computeCoords())
    const onReposition = () => setCoords(computeCoords())
    window.addEventListener('scroll', onReposition, true)
    window.addEventListener('resize', onReposition)
    return () => {
      window.removeEventListener('scroll', onReposition, true)
      window.removeEventListener('resize', onReposition)
    }
  }, [ouvert, recherche, ingredientsFiltres.length])

  const handleInput = (e) => {
    onChange(e.target.value)
    setOuvert(true)
    setSurbrillance(-1)
  }

  const handleSelect = (ing) => {
    onSelect(ing)
    setOuvert(false)
    setSurbrillance(-1)
  }

  const handleKeyDown = (e) => {
    if (!ouvert || ingredientsFiltres.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSurbrillance(prev => Math.min(prev + 1, ingredientsFiltres.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSurbrillance(prev => Math.max(prev - 1, 0))
    } else if (e.key === 'Enter' && surbrillance >= 0) {
      e.preventDefault()
      handleSelect(ingredientsFiltres[surbrillance])
    } else if (e.key === 'Escape') {
      setOuvert(false)
    }
  }

  const handleBlur = () => {
    // Délai pour permettre le onMouseDown des suggestions
    setTimeout(() => setOuvert(false), 150)
  }

  const showList = ouvert && ingredientsFiltres.length > 0 && coords && typeof document !== 'undefined'

  return (
    <div style={{ position: 'relative', width: '100%', ...style }}>
      <input
        ref={inputRef}
        type="text"
        value={recherche}
        onChange={handleInput}
        onFocus={() => recherche.length > 0 && setOuvert(true)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        style={inputStyle}
      />

      {showList && createPortal(
        <div
          style={{
            position: 'fixed',
            left: coords.left,
            width: coords.width,
            top: coords.top ?? undefined,
            bottom: coords.bottom ?? undefined,
            background: c.blanc, borderRadius: 8, zIndex: 1000,
            border: `1px solid ${c.bordure}`,
            boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
            maxHeight: coords.maxHeight, overflowY: 'auto',
          }}
        >
          {ingredientsFiltres.map((ing, idx) => (
            <div
              key={ing.id}
              onMouseDown={() => handleSelect(ing)}
              onMouseEnter={() => setSurbrillance(idx)}
              style={{
                padding: '8px 12px', cursor: 'pointer', fontSize: 13,
                color: c.texte,
                background: surbrillance === idx ? c.accentClair : c.blanc,
                borderBottom: idx < ingredientsFiltres.length - 1 ? `0.5px solid ${c.bordure}` : 'none',
              }}
            >
              <div style={{ fontWeight: 500 }}>{ing.nom}</div>
              {ing.prix_kg != null && (
                <div style={{ fontSize: 11, color: c.texteMuted }}>
                  {Number(ing.prix_kg).toFixed(2)} € / {ing.unite || 'kg'}
                </div>
              )}
            </div>
          ))}
        </div>,
        document.body
      )}
    </div>
  )
}
