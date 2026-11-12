import am from '@pulse/i18n/locales/am.json';
import en from '@pulse/i18n/locales/en.json';
import i18next from 'i18next';
import type { ReactNode } from 'react';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { icuFormat } from '../lib/icu-format';

/** Synchronous i18n for component tests (the app lazy-loads locales instead). */
export async function createTestI18n(lng: 'en' | 'am' = 'en') {
  const instance = i18next.createInstance();
  await instance
    .use(icuFormat)
    .use(initReactI18next)
    .init({
      lng,
      resources: { en: { translation: en }, am: { translation: am } },
      keySeparator: false,
      nsSeparator: false,
      interpolation: { escapeValue: false },
    });
  return instance;
}

export function withI18n(i18n: Awaited<ReturnType<typeof createTestI18n>>) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
  };
}
