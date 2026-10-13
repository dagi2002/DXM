/**
 * Client-side password strength estimate, for guidance only. The server stays the source of
 * truth (min 10 / max 128 characters, enforced by Better Auth); this never blocks a password the
 * server would accept except for the length rule both sides share.
 *
 * Deliberately tiny (no zxcvbn: ~400 KB) — it rewards length most, then variety, and penalizes
 * the patterns people actually reuse: common passwords, repeats, keyboard/number runs, and
 * passwords built from the user's own name or email.
 */
export const MIN_PASSWORD_LENGTH = 10;

export type StrengthLevel = 'tooShort' | 'weak' | 'fair' | 'good' | 'strong';

export interface StrengthResult {
  level: StrengthLevel;
  /** 0 (too short) … 4 (strong). */
  score: 0 | 1 | 2 | 3 | 4;
}

// Lowercased; the most reused passwords that are still ≥10 characters, plus local favourites.
const COMMON = new Set([
  '1234567890',
  '0123456789',
  '12345678910',
  '1111111111',
  '0000000000',
  'qwertyuiop',
  'password123',
  'password1234',
  'iloveyou123',
  'abcdefghij',
  'abc1234567',
  'qwerty12345',
  '1q2w3e4r5t',
  'asdfghjkl1',
  'princess123',
  'football123',
  'ethiopia123',
  'ethiopia2024',
  'ethiopia2025',
  'ethiopia2026',
  'addisababa',
  'addisababa1',
  'welcome123',
  'letmein123',
  'changeme123',
]);

const SEQUENCES = ['abcdefghijklmnopqrstuvwxyz', 'qwertyuiopasdfghjklzxcvbnm', '01234567890'];

/** Length of the longest alphabet / keyboard-row / digit run ("abcd", "qwer", "4321"). */
function longestRun(pw: string): number {
  const lower = pw.toLowerCase();
  let best = 0;
  for (const seq of SEQUENCES) {
    const rev = [...seq].reverse().join('');
    for (let i = 0; i < lower.length; i++) {
      for (let len = best + 1; i + len <= lower.length; len++) {
        const chunk = lower.slice(i, i + len);
        if (!seq.includes(chunk) && !rev.includes(chunk)) break;
        if (len >= 3) best = len;
      }
    }
  }
  return best;
}

export function passwordStrength(password: string, personal: string[] = []): StrengthResult {
  // Count characters, not UTF-16 units. Ge'ez is in the BMP, so Amharic passwords count the same
  // as on the server; astral characters (emoji) can only make us stricter, never looser.
  const length = [...password].length;
  if (length < MIN_PASSWORD_LENGTH) return { level: 'tooShort', score: 0 };

  const lower = password.toLowerCase();
  if (COMMON.has(lower)) return { level: 'weak', score: 1 };

  const unique = new Set(lower).size;
  if (unique <= 3) return { level: 'weak', score: 1 };

  // Personal info: name parts and the email's local part (≥3 chars to avoid false hits).
  const parts = personal.flatMap((p) => p.toLowerCase().split(/[\s@._+-]+/)).filter((p) => p.length >= 3);
  const personalHit = parts.some((p) => lower.includes(p));

  let points = 0;
  points += length >= 16 ? 3 : length >= 13 ? 2 : 1;
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((re) => re.test(password)).length;
  points += classes >= 3 ? 2 : classes === 2 ? 1 : 0;
  if (unique >= 8) points += 1;
  const run = longestRun(password);
  if (run >= 6) points -= 2;
  else if (run >= 4) points -= 1;
  if (/(.)\1\1/.test(password)) points -= 1;
  if (personalHit) points -= 2;

  // A long passphrase ("four random words") is strong even in one character class.
  if (length >= 20 && !personalHit && unique >= 10) points = Math.max(points, 5);

  if (points <= 1) return { level: 'weak', score: 1 };
  if (points <= 3) return { level: 'fair', score: 2 };
  if (points <= 4) return { level: 'good', score: 3 };
  return { level: 'strong', score: 4 };
}
