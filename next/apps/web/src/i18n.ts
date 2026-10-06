import { isLocale, type Locale } from '@pulse/i18n';
import i18next, { type BackendModule } from 'i18next';
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

/** Only the active language is downloaded; switching fetches the other one (~4 KB gzip). */
const lazyLocales: BackendModule = {
  type: 'backend',
  init() {},
  read(language, _namespace, callback) {
    const load =
      language === 'am' ? import('@pulse/i18n/locales/am.json') : import('@pulse/i18n/locales/en.json');
    load.then((m) => callback(null, m.default)).catch((err: Error) => callback(err, false));
  },
};

export const i18n = i18next.createInstance();

export const i18nReady = i18n
  .use(lazyLocales)
  .use(ICU)
  .use(initReactI18next)
  .init({
    lng: initialLocale(),
    supportedLngs: ['en', 'am'],
    // Both files are key-parallel (enforced by @pulse/i18n tests), so no fallback download is needed.
    fallbackLng: false,
    keySeparator: false,
    nsSeparator: false,
    interpolation: { escapeValue: false },
    returnNull: false,
    react: { useSuspense: false },
  })
  .then(() => applyLocale(i18n.language as Locale));

i18n.on('languageChanged', (lng) => isLocale(lng) && applyLocale(lng));
