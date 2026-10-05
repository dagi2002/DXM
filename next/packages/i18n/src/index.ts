import { IntlMessageFormat } from 'intl-messageformat';
import am from './locales/am.json' with { type: 'json' };
import en from './locales/en.json' with { type: 'json' };
import { formatEthiopianDate, formatEthiopianTime, zonedParts } from './ethiopian';

export * from './ethiopian';

export const LOCALES = ['en', 'am'] as const;
export type Locale = (typeof LOCALES)[number];
export type CalendarPref = 'gregorian' | 'ethiopian';

export const messages = { en, am } as const;
export type MessageKey = keyof typeof en;

export const DEFAULT_TIME_ZONE = 'Africa/Addis_Ababa';

export function isLocale(value: unknown): value is Locale {
  return value === 'en' || value === 'am';
}

/** The calendar a user sees when they haven't chosen one: Ethiopian for Amharic, Gregorian for English. */
export function defaultCalendar(locale: Locale): CalendarPref {
  return locale === 'am' ? 'ethiopian' : 'gregorian';
}

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
    fmt = new IntlMessageFormat(source, locale === 'am' ? 'am-ET' : 'en-US');
    cache.set(cacheKey, fmt);
  }
  return String(fmt.format(values));
}

/** Formats a date in the user's language and calendar, in the workspace time zone. */
export function formatDate(
  date: Date | string,
  opts: { locale: Locale; calendar?: CalendarPref; timeZone?: string; withTime?: boolean },
): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const timeZone = opts.timeZone ?? DEFAULT_TIME_ZONE;
  const calendar = opts.calendar ?? defaultCalendar(opts.locale);
  if (calendar === 'ethiopian') {
    const day = formatEthiopianDate(d, opts.locale, timeZone);
    if (!opts.withTime) return day;
    if (opts.locale === 'am') return `${day} · ${formatEthiopianTime(d, timeZone)}`;
    const { hour, minute } = zonedParts(d, timeZone);
    return `${day} · ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  }
  return new Intl.DateTimeFormat(opts.locale === 'am' ? 'am-ET' : 'en-GB', {
    timeZone,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...(opts.withTime ? { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' } : {}),
  }).format(d);
}

/** Preferred terms for Amharic copy (to be confirmed by a native reviewer — see docs/rebuild/02 §3). */
export const GLOSSARY = {
  visit: { en: 'visit', am: 'ጉብኝት' },
  visitor: { en: 'visitor', am: 'ጎብኚ' },
  bounce: { en: 'left immediately', am: 'ወዲያው የወጡ' },
  heatmap: { en: 'click map', am: 'የጠቅታ ካርታ' },
  fix: { en: 'fix', am: 'ማስተካከያ' },
  site: { en: 'site', am: 'ድረ-ገጽ' },
} as const;
