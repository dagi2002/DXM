/**
 * Ethiopian (Amete Mihret) calendar and clock helpers.
 * Dates are always stored in UTC; these convert for display in a given time zone
 * (default Africa/Addis_Ababa).
 */

export interface EthiopianDate {
  year: number;
  month: number; // 1–13 (13 = Pagume)
  day: number; // 1–30 (Pagume: 1–5, or 6 in a leap year)
}

export const ETHIOPIAN_MONTHS = {
  am: ['መስከረም', 'ጥቅምት', 'ኅዳር', 'ታኅሣሥ', 'ጥር', 'የካቲት', 'መጋቢት', 'ሚያዝያ', 'ግንቦት', 'ሰኔ', 'ሐምሌ', 'ነሐሴ', 'ጳጉሜን'],
  en: ['Meskerem', 'Tikimt', 'Hidar', 'Tahsas', 'Tir', 'Yekatit', 'Megabit', 'Miyazya', 'Ginbot', 'Sene', 'Hamle', 'Nehase', 'Pagume'],
} as const;

const ETHIOPIAN_EPOCH_JDN = 1723856;

function gregorianToJdn(year: number, month: number, day: number): number {
  const a = Math.floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  return day + Math.floor((153 * m + 2) / 5) + 365 * y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) - 32045;
}

/** Converts a Gregorian calendar date (y, m 1–12, d) to the Ethiopian calendar. */
export function gregorianToEthiopian(year: number, month: number, day: number): EthiopianDate {
  const jdn = gregorianToJdn(year, month, day);
  const r = (jdn - ETHIOPIAN_EPOCH_JDN) % 1461;
  const n = (r % 365) + 365 * Math.floor(r / 1460);
  const ethYear = 4 * Math.floor((jdn - ETHIOPIAN_EPOCH_JDN) / 1461) + Math.floor(r / 365) - Math.floor(r / 1460);
  return { year: ethYear, month: Math.floor(n / 30) + 1, day: (n % 30) + 1 };
}

/** Local calendar parts of an instant in a time zone. */
export function zonedParts(date: Date, timeZone = 'Africa/Addis_Ababa') {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute') };
}

export function toEthiopian(date: Date, timeZone = 'Africa/Addis_Ababa'): EthiopianDate {
  const p = zonedParts(date, timeZone);
  return gregorianToEthiopian(p.year, p.month, p.day);
}

/** "መስከረም 24, 2019 ዓ.ም" / "Meskerem 24, 2019 E.C." */
export function formatEthiopianDate(date: Date, locale: 'en' | 'am', timeZone = 'Africa/Addis_Ababa'): string {
  const e = toEthiopian(date, timeZone);
  const month = ETHIOPIAN_MONTHS[locale][e.month - 1];
  return locale === 'am' ? `${month} ${e.day}, ${e.year} ዓ.ም` : `${month} ${e.day}, ${e.year} E.C.`;
}

/**
 * Ethiopian 12-hour clock: the day starts at sunrise (06:00 = 12 o'clock).
 * 09:30 → "ከጠዋቱ 3:30".
 */
export function formatEthiopianTime(date: Date, timeZone = 'Africa/Addis_Ababa'): string {
  const { hour, minute } = zonedParts(date, timeZone);
  const ethHour = (hour + 6) % 12 || 12;
  const period = hour < 6 ? 'ከሌሊቱ' : hour < 12 ? 'ከጠዋቱ' : hour < 18 ? 'ከሰዓት በኋላ' : 'ከምሽቱ';
  return `${period} ${ethHour}:${String(minute).padStart(2, '0')}`;
}
