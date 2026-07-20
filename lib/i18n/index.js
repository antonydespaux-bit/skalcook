'use client'
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import fr from './locales/fr.json'
import en from './locales/en.json'
import es from './locales/es.json'
import it from './locales/it.json'

export const SUPPORTED_LOCALES = ['fr', 'en', 'es', 'it']
export const LOCALE_LABELS = { fr: 'Français', en: 'English', es: 'Español', it: 'Italiano' }
export const LOCALE_STORAGE_KEY = 'skalcook_locale'

if (!i18n.isInitialized) {
  i18n
    .use(initReactI18next)
    .init({
      resources: { fr: { common: fr }, en: { common: en }, es: { common: es }, it: { common: it } },
      // Langue initiale FIXE ('fr') : le rendu serveur (pas de localStorage/
      // navigator → fallback) et le 1er rendu client DOIVENT être identiques,
      // sinon les libellés traduits (ex. Navbar) diffèrent → erreur d'hydratation
      // React #418. On n'utilise donc PAS i18next-browser-languagedetector au
      // démarrage (il lisait localStorage/navigator côté client uniquement, d'où
      // le mismatch, et son cache réécrivait localStorage à l'init). La vraie
      // langue est détectée + appliquée APRÈS hydratation par I18nProvider, et
      // persistée manuellement par LanguageSwitcher (clé LOCALE_STORAGE_KEY).
      lng: 'fr',
      fallbackLng: 'fr',
      supportedLngs: SUPPORTED_LOCALES,
      defaultNS: 'common',
      ns: ['common'],
      interpolation: { escapeValue: false },
      react: { useSuspense: false },
    })
}

export default i18n
