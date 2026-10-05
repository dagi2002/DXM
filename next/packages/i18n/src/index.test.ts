import { TYPE, parse } from '@formatjs/icu-messageformat-parser';
import { describe, expect, it } from 'vitest';
import {
  formatDate,
  formatEthiopianDate,
  formatEthiopianTime,
  gregorianToEthiopian,
  messages,
  t,
  toEthiopian,
} from './index';

describe('Ethiopian calendar', () => {
  it.each([
    [2026, 10, 4, { year: 2019, month: 1, day: 24 }], // Meskerem 24, 2019
    [2026, 9, 11, { year: 2019, month: 1, day: 1 }], // Enkutatash 2019
    [2023, 9, 12, { year: 2016, month: 1, day: 1 }], // Enkutatash before a Gregorian leap year
    [2026, 1, 7, { year: 2018, month: 4, day: 29 }], // Genna (Ethiopian Christmas)
    [2026, 9, 10, { year: 2018, month: 13, day: 5 }], // last day of Pagume
  ])('%i-%i-%i', (y, m, d, expected) => {
    expect(gregorianToEthiopian(y, m, d)).toEqual(expected);
  });

  it('uses the Addis Ababa date, not the UTC date', () => {
    // 22:30 UTC on Oct 3 is already 01:30 on Oct 4 in Addis Ababa (UTC+3).
    expect(toEthiopian(new Date('2026-10-03T22:30:00Z'))).toEqual({ year: 2019, month: 1, day: 24 });
  });

  it('formats Ethiopian dates in both languages', () => {
    const d = new Date('2026-10-04T09:00:00Z');
    expect(formatEthiopianDate(d, 'am')).toBe('መስከረም 24, 2019 ዓ.ም');
    expect(formatEthiopianDate(d, 'en')).toBe('Meskerem 24, 2019 E.C.');
  });

  it('formats the Ethiopian 12-hour clock', () => {
    expect(formatEthiopianTime(new Date('2026-10-04T06:30:00Z'))).toBe('ከጠዋቱ 3:30'); // 09:30 local
    expect(formatEthiopianTime(new Date('2026-10-04T03:00:00Z'))).toBe('ከጠዋቱ 12:00'); // 06:00 local
    expect(formatEthiopianTime(new Date('2026-10-04T11:15:00Z'))).toBe('ከሰዓት በኋላ 8:15'); // 14:15 local
    expect(formatEthiopianTime(new Date('2026-10-04T17:00:00Z'))).toBe('ከምሽቱ 2:00'); // 20:00 local
    expect(formatEthiopianTime(new Date('2026-10-03T23:00:00Z'))).toBe('ከሌሊቱ 8:00'); // 02:00 local
  });
});

describe('formatDate', () => {
  const d = new Date('2026-10-04T09:00:00Z');
  it('defaults to the Ethiopian calendar for Amharic and Gregorian for English', () => {
    expect(formatDate(d, { locale: 'am' })).toBe('መስከረም 24, 2019 ዓ.ም');
    expect(formatDate(d, { locale: 'en' })).toBe('4 Oct 2026');
  });
  it('respects an explicit calendar preference', () => {
    expect(formatDate(d, { locale: 'en', calendar: 'ethiopian' })).toBe('Meskerem 24, 2019 E.C.');
  });
});

describe('messages', () => {
  const placeholders = (src: string): string[] => {
    const out: string[] = [];
    const walk = (els: ReturnType<typeof parse>) => {
      for (const el of els) {
        if (el.type === TYPE.argument || el.type === TYPE.number || el.type === TYPE.date) out.push(el.value);
        if (el.type === TYPE.plural || el.type === TYPE.select) {
          out.push(el.value);
          for (const opt of Object.values(el.options)) walk(opt.value);
        }
      }
    };
    walk(parse(src));
    return [...new Set(out)].sort();
  };

  it('has identical keys in English and Amharic', () => {
    expect(Object.keys(messages.am).sort()).toEqual(Object.keys(messages.en).sort());
  });

  it('uses the same ICU placeholders in both languages', () => {
    for (const [key, en] of Object.entries(messages.en)) {
      const am = (messages.am as Record<string, string>)[key]!;
      expect(placeholders(am), key).toEqual(placeholders(en));
    }
  });

  it('has no empty or untranslated Amharic strings (brand and tech names excepted)', () => {
    const allowedSame = new Set([
      'app.name',
      'sites.domain.placeholder',
      'sites.platform.wordpress',
      'sites.platform.woocommerce',
      'sites.platform.shopify',
      'sites.platform.react',
      'sites.platform.nextjs',
    ]);
    for (const [key, en] of Object.entries(messages.en)) {
      const am = (messages.am as Record<string, string>)[key]!;
      expect(am.trim(), key).not.toBe('');
      if (!allowedSame.has(key)) expect(am, key).not.toBe(en);
    }
  });

  it('formats plurals', () => {
    expect(t('en', 'today.summary', { sites: 1, date: 'today' })).toBe('1 site · today');
    expect(t('en', 'today.summary', { sites: 0, date: 'today' })).toBe('No sites yet · today');
    expect(t('am', 'today.summary', { sites: 3, date: 'ዛሬ' })).toBe('3 ድረ-ገጾች · ዛሬ');
    expect(t('am', 'today.summary', { sites: 1, date: 'ዛሬ' })).toBe('1 ድረ-ገጽ · ዛሬ'); // Amharic: 1 is singular
  });
});
