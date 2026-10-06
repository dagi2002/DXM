import { IntlMessageFormat } from 'intl-messageformat';
import type { Locale } from './index';
import am from './locales/am.json' with { type: 'json' };
import emailAm from './locales/email.am.json' with { type: 'json' };
import emailEn from './locales/email.en.json' with { type: 'json' };
import en from './locales/en.json' with { type: 'json' };

/**
 * Every message (UI + email) for server-side formatting. Browsers never import this module:
 * the web app lazy-loads only the active language's UI file.
 */
export const messages = { en: { ...en, ...emailEn }, am: { ...am, ...emailAm } } as const;
export type MessageKey = keyof typeof messages.en;

const cache = new Map<string, IntlMessageFormat>();

/** Formats an ICU message outside React (API emails, Telegram, PDFs). */
export function t(locale: Locale, key: MessageKey, values?: Record<string, string | number>): string {
  const cacheKey = `${locale}:${key}`;
  let fmt = cache.get(cacheKey);
  if (!fmt) {
    const source =
      (messages[locale] as Record<string, string>)[key] ??
      (messages.en as Record<string, string>)[key] ??
      key;
    // ignoreTag: messages may contain literal HTML like </head> (install emails), never rich-text tags.
    fmt = new IntlMessageFormat(source, locale === 'am' ? 'am-ET' : 'en-US', undefined, { ignoreTag: true });
    cache.set(cacheKey, fmt);
  }
  return String(fmt.format(values));
}
