'use client'
import { useEffect } from 'react'
import { I18nextProvider } from 'react-i18next'
import i18n, { SUPPORTED_LOCALES, LOCALE_STORAGE_KEY } from '../lib/i18n'

export default function I18nProvider({ children }) {
  useEffect(() => {
    // i18n est initialisé en 'fr' (cf. lib/i18n) pour que SSR === 1er rendu
    // client (pas de mismatch #418). Une fois hydraté, on applique la vraie
    // langue de l'utilisateur : localStorage ('skalcook_locale') puis navigateur.
    try {
      const stored = localStorage.getItem(LOCALE_STORAGE_KEY)
      const nav = (navigator.language || '').slice(0, 2)
      const target = SUPPORTED_LOCALES.includes(stored)
        ? stored
        : SUPPORTED_LOCALES.includes(nav)
          ? nav
          : null
      if (target && target !== i18n.resolvedLanguage) {
        i18n.changeLanguage(target)
      }
    } catch {
      /* détection best-effort : on reste en 'fr' si quoi que ce soit échoue */
    }

    const sync = (lng) => {
      if (typeof document !== 'undefined') document.documentElement.lang = lng
    }
    sync(i18n.resolvedLanguage || i18n.language)
    i18n.on('languageChanged', sync)
    return () => i18n.off('languageChanged', sync)
  }, [])

  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
}
