'use client'

/**
 * <Button> — bouton avec variants sémantiques.
 *
 * Props :
 *   variant   : 'primary' (défaut, utilise c.accent) | 'ghost' | 'danger' | 'danger-solid'
 *   size      : 'md' (défaut) | 'sm'
 *   c         : requis pour variant='primary' ou 'ghost' (couleurs dynamiques)
 *   className : classes additionnelles
 *   style     : style inline additionnel (échappatoire)
 *   disabled, onClick, type, … : passés au <button>
 */
export function Button({
  variant = 'primary',
  size = 'md',
  c,
  className = '',
  style,
  children,
  ...rest
}) {
  const variantClass =
    variant === 'ghost' ? 'sk-btn--ghost' :
    variant === 'danger' ? 'sk-btn--danger' :
    variant === 'danger-solid' ? 'sk-btn--danger-solid' :
    '' // primary = pas de classe, on passe le style dynamique
  const sizeClass = size === 'sm' ? 'sk-btn--sm' : ''

  // Couleurs dynamiques injectées inline selon variant
  const dynStyle = {}
  if (variant === 'primary' && c) {
    dynStyle.background = c.accent
    dynStyle.color = '#fff'
  }
  if (variant === 'ghost' && c) {
    dynStyle.color = c.texte
    dynStyle.borderColor = c.bordure
  }

  return (
    <button
      className={`sk-btn ${variantClass} ${sizeClass} ${className}`.replace(/\s+/g, ' ').trim()}
      style={{ ...dynStyle, ...style }}
      {...rest}
    >
      {children}
    </button>
  )
}
