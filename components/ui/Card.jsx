'use client'

/**
 * <Card> — conteneur surface (background blanc, radius, border fine).
 *
 * Structurel (radius/padding) piloté par CSS tokens.
 * Couleurs dynamiques (fond + bordure) injectées via `c` car dépendantes du
 * branding client et du dark mode.
 *
 * Props :
 *   c         : objet couleurs de useTheme() — REQUIS
 *   padding   : 'sm' | 'md' | 'lg' | 'responsive' (défaut) | 'none'
 *   tone      : 'surface' (défaut, c.blanc) | 'muted' (c.fond)
 *   as        : tag HTML (défaut 'div')
 *   className : classes additionnelles
 *   style     : style inline additionnel (échappatoire)
 */
export function Card({
  c,
  padding = 'responsive',
  tone = 'surface',
  as: Tag = 'div',
  className = '',
  style,
  children,
  ...rest
}) {
  const background = tone === 'muted' ? c.fond : c.blanc
  const padClass = padding === 'none' ? '' : `sk-card--pad-${padding}`
  return (
    <Tag
      className={`sk-card ${padClass} ${className}`.trim()}
      style={{
        background,
        border: `0.5px solid ${c.bordure}`,
        ...style,
      }}
      {...rest}
    >
      {children}
    </Tag>
  )
}
