'use client'
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

import fr from './locales/fr.json'
import en from './locales/en.json'
import es from './locales/es.json'
import it from './locales/it.json'

export const SUPPORTED_LOCALES = ['fr', 'en', 'es', 'it']
export const LOCALE_LABELS = { fr: 'Français', en: 'English', es: 'Español', it: 'Italiano' }

if (!i18n.isInitialized) {
  i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
      resources: { fr: { common: fr }, en: { common: en }, es: { common: es }, it: { common: it } },
      fallbackLng: 'fr',
      supportedLngs: SUPPORTED_LOCALES,
      defaultNS: 'common',
      ns: ['common'],
      interpolation: { escapeValue: false },
      detection: {
        order: ['localStorage', 'navigator'],
        lookupLocalStorage: 'skalcook_locale',
        caches: ['localStorage'],
      },
      react: { useSuspense: false },
    })
}

export default i18n
