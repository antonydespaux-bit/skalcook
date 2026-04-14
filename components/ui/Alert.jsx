'use client'

/**
 * <Alert> — bandeau sémantique (erreur / warn / info / success).
 *
 * Couleurs entièrement pilotées par tokens CSS (sémantiques fixes,
 * indépendantes du branding client).
 *
 * Props :
 *   variant   : 'error' (défaut) | 'warn' | 'info' | 'success'
 *   title     : optionnel — libellé en tête (uppercased, petit)
 *   className : classes additionnelles
 *   style     : style inline additionnel (échappatoire)
 */
export function Alert({
  variant = 'error',
  title,
  className = '',
  style,
  children,
  ...rest
}) {
  return (
    <div
      className={`sk-alert sk-alert--${variant} ${className}`.trim()}
      style={style}
      role={variant === 'error' ? 'alert' : 'status'}
      {...rest}
    >
      {title && <div className="sk-alert__title">{title}</div>}
      {children}
    </div>
  )
}
