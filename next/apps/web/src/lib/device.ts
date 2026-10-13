/**
 * Just enough User-Agent parsing to label a signed-in device ("Chrome on Android"). Product and
 * OS names are proper nouns and stay untranslated; callers fall back to a translated
 * "Unknown device" when both are null.
 */
export interface DeviceInfo {
  browser: string | null;
  os: string | null;
  kind: 'mobile' | 'tablet' | 'desktop';
}

const BROWSERS: [RegExp, string][] = [
  // Order matters: most of these also say "Chrome" and "Safari".
  [/EdgA?\/|Edg\//, 'Edge'],
  [/OPR\/|Opera/, 'Opera'],
  [/SamsungBrowser\//, 'Samsung Internet'],
  [/YaBrowser\//, 'Yandex'],
  [/Firefox\/|FxiOS\//, 'Firefox'],
  [/CriOS\/|Chrome\//, 'Chrome'],
  [/Version\/[\d.]+.*Safari\//, 'Safari'],
];

const SYSTEMS: [RegExp, string][] = [
  [/iPhone|iPad|iPod/, 'iOS'],
  [/Android/, 'Android'],
  [/CrOS/, 'ChromeOS'],
  [/Windows/, 'Windows'],
  [/Mac OS X|Macintosh/, 'macOS'],
  [/Linux/, 'Linux'],
];

export function parseUserAgent(ua: string | null | undefined): DeviceInfo {
  if (!ua) return { browser: null, os: null, kind: 'desktop' };
  const browser = BROWSERS.find(([re]) => re.test(ua))?.[1] ?? null;
  const os = SYSTEMS.find(([re]) => re.test(ua))?.[1] ?? null;
  const kind =
    /iPad|Tablet/.test(ua) || (/Android/.test(ua) && !/Mobile/.test(ua))
      ? 'tablet'
      : /Mobi|iPhone|iPod/.test(ua)
        ? 'mobile'
        : 'desktop';
  return { browser, os, kind };
}

/** "JBSWY3DPEHPK3PXP" → "JBSW Y3DP EHPK 3PXP" for reading aloud / typing into an app. */
export function groupKey(key: string): string {
  return key.replace(/(.{4})(?=.)/g, '$1 ');
}

/** Pulls the base32 secret out of an otpauth:// URI for manual entry. */
export function secretFromOtpauth(uri: string): string {
  try {
    return new URL(uri).searchParams.get('secret') ?? '';
  } catch {
    return '';
  }
}
