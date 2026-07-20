'use client'
import { useTranslation } from 'react-i18next'
import { SUPPORTED_LOCALES, LOCALE_LABELS, LOCALE_STORAGE_KEY } from '../lib/i18n'

/**
 * Sélecteur de langue compact. Variante 'nav' (sombre) ou 'light'.
 * Le choix est persisté manuellement en localStorage (LOCALE_STORAGE_KEY) :
 * i18next-browser-languagedetector n'est plus utilisé (cf. lib/i18n, fix #418).
 */
export default function LanguageSwitcher({ variant = 'nav', style }) {
  const { i18n } = useTranslation()
  const current = (i18n.resolvedLanguage || i18n.language || 'fr').slice(0, 2)

  const changeLang = (lng) => {
    i18n.changeLanguage(lng)
    try { localStorage.setItem(LOCALE_STORAGE_KEY, lng) } catch { /* ignore */ }
  }

  const dark = variant === 'nav'
  return (
    <select
      aria-label="Langue"
      value={SUPPORTED_LOCALES.includes(current) ? current : 'fr'}
      onChange={(e) => changeLang(e.target.value)}
      style={{
        background: dark ? 'rgba(255,255,255,0.06)' : 'transparent',
        color: dark ? 'rgba(255,255,255,0.7)' : 'inherit',
        border: dark ? '0.5px solid rgba(255,255,255,0.1)' : '1px solid currentColor',
        borderRadius: 8,
        padding: '6px 8px',
        fontSize: 13,
        cursor: 'pointer',
        ...style,
      }}
    >
      {SUPPORTED_LOCALES.map((lng) => (
        <option key={lng} value={lng} style={{ color: '#18181B' }}>
          {LOCALE_LABELS[lng]}
        </option>
      ))}
    </select>
  )
}
