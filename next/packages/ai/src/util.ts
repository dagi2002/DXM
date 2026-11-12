import { createHash } from 'node:crypto';

/** First day of the UTC month: budgets reset then. */
export const monthStart = (now: Date) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

/** Stable hash of a task's input: the cache key, so the same input never pays twice. */
export const hashInput = (input: unknown) => createHash('sha256').update(JSON.stringify(input)).digest('hex');

/** Wraps untrusted data so the model can tell it apart from instructions. */
export const fenceData = (input: unknown) =>
  `<data>\n${JSON.stringify(input, null, 2).replaceAll('</data>', '<\\/data>')}\n</data>`;

/** The first `{…}` in a reply, parsed; null when there is none or it isn't JSON. */
export function firstJsonObject(raw: string): Record<string, unknown> | null {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const v: unknown = JSON.parse(raw.slice(start, end + 1));
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
