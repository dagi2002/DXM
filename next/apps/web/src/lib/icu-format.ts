import { compileMessage, type CompiledMessage } from '@pulse/i18n/format';

/**
 * ICU messages through the small formatter in @pulse/i18n/format instead of i18next-icu +
 * intl-messageformat (about 12 KB gzip less on first load, 03 §8). Same contract as
 * i18next-icu: each message is compiled once per language, and a message that can't be
 * formatted (bad syntax, missing value) is shown as written.
 */
const compiled = new Map<string, CompiledMessage>();
export const icuFormat = {
  type: 'i18nFormat' as const,
  init() {},
  parse(res: string, options: Record<string, unknown>, lng: string): string {
    try {
      const cacheKey = `${lng}\u0000${res}`;
      let format = compiled.get(cacheKey);
      if (!format) compiled.set(cacheKey, (format = compileMessage(res, lng)));
      return format(options);
    } catch {
      return res;
    }
  },
  addLookupKeys: (finalKeys: string[]) => finalKeys,
};
