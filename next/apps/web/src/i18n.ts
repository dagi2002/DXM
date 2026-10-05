import { isLocale, messages, type Locale } from '@pulse/i18n';
import i18next from 'i18next';
import ICU from 'i18next-icu';
import { initReactI18next } from 'react-i18next';

const STORAGE_KEY = 'pulse.lang';

export function initialLocale(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (isLocale(saved)) return saved;
  } catch {
    /* storage unavailable */
  }
  // Follow the browser's first preference only (a secondary Amharic entry shouldn't override English).
  const primary = (navigator.languages?.[0] ?? navigator.language ?? 'en').toLowerCase();
  return primary.startsWith('am') ? 'am' : 'en';
}

/** Keeps <html lang> and storage in sync so screen readers and fonts follow the UI language. */
export function applyLocale(locale: Locale) {
  document.documentElement.lang = locale;
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    /* ignore */
  }
}

export const i18n = i18next.createInstance();

void i18n
  .use(ICU)
  .use(initReactI18next)
  .init({
    resources: { en: { translation: messages.en }, am: { translation: messages.am } },
    lng: initialLocale(),
    fallbackLng: 'en',
    keySeparator: false,
    nsSeparator: false,
    interpolation: { escapeValue: false },
    returnNull: false,
  });

applyLocale(i18n.language as Locale);
i18n.on('languageChanged', (lng) => isLocale(lng) && applyLocale(lng));
