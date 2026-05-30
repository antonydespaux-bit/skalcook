'use client'
import { useEffect } from 'react'
import { I18nextProvider } from 'react-i18next'
import i18n from '../lib/i18n'

export default function I18nProvider({ children }) {
  useEffect(() => {
    const sync = (lng) => {
      if (typeof document !== 'undefined') document.documentElement.lang = lng
    }
    sync(i18n.resolvedLanguage || i18n.language)
    i18n.on('languageChanged', sync)
    return () => i18n.off('languageChanged', sync)
  }, [])

  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
}
