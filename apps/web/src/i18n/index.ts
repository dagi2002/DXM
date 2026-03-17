import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import en from './locales/en.json';
import am from './locales/am.json';

// Detect if browser language starts with 'am' (Amharic)
function getSmartFallback(): string {
  const stored = localStorage.getItem('dxm_lang');
  if (stored) return stored;
  const browserLang = navigator.language || (navigator as any).userLanguage || '';
  return browserLang.toLowerCase().startsWith('am') ? 'am' : 'en';
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      am: { translation: am },
    },
    fallbackLng: 'en',
    lng: getSmartFallback(),
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'dxm_lang',
    },
  });

export default i18n;
