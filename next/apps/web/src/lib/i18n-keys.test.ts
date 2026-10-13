// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import en from '@pulse/i18n/locales/en.json';
import { describe, expect, it } from 'vitest';

/**
 * Every `t('…')` call in the web app must point at a real English message. (English/Amharic key
 * parity is tested in packages/i18n, so a key that exists in en.json exists in am.json too.)
 *
 * Template-literal keys such as t(`fix.status.${s}`) are checked as patterns: at least one
 * message must match, with each `${…}` standing for one or more characters.
 */
const SRC = fileURLToPath(new URL('..', import.meta.url));
const keys = Object.keys(en as Record<string, string>);

type Use = { key: string; template: boolean; file: string; line: number };

/** Reads the string or template literal starting at `start`; returns its raw body or null. */
function readLiteral(src: string, start: number): { body: string; template: boolean } | null {
  const quote = src[start];
  if (quote === "'" || quote === '"') {
    const end = src.indexOf(quote, start + 1);
    return end < 0 ? null : { body: src.slice(start + 1, end), template: false };
  }
  if (quote !== '`') return null;
  let body = '';
  for (let i = start + 1; i < src.length; i++) {
    const ch = src[i];
    if (ch === '`') return { body, template: true };
    if (ch === '$' && src[i + 1] === '{') {
      // Skip the whole interpolation, allowing nested braces and quotes inside it.
      let depth = 0;
      for (i = i + 1; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}' && --depth === 0) break;
      }
      body += '\0';
      continue;
    }
    body += ch;
  }
  return null;
}

function collectUses(): Use[] {
  const files = (readdirSync(SRC, { recursive: true }) as string[]).filter(
    (f) => /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f),
  );
  const uses: Use[] = [];
  for (const rel of files) {
    const src = readFileSync(join(SRC, rel), 'utf8');
    for (const m of src.matchAll(/(?<![\w$])t\(\s*/g)) {
      const lit = readLiteral(src, m.index + m[0].length);
      if (!lit) continue; // t(variable) — not statically checkable
      uses.push({
        key: lit.body,
        template: lit.template,
        file: relative(SRC, join(SRC, rel)),
        line: src.slice(0, m.index).split('\n').length,
      });
    }
  }
  return uses;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

describe('i18n keys used in apps/web/src', () => {
  const uses = collectUses();

  it('finds the t() calls (sanity check for the scanner)', () => {
    expect(uses.length).toBeGreaterThan(100);
    expect(uses.some((u) => u.key === 'nav.today')).toBe(true);
    expect(uses.some((u) => u.template && u.key === 'fix.status.\0')).toBe(true);
  });

  it('every static key exists in en.json', () => {
    const known = new Set(keys);
    const missing = uses
      .filter((u) => !u.template || !u.key.includes('\0'))
      .filter((u) => !known.has(u.key))
      .map((u) => `${u.key}  (${u.file}:${u.line})`);
    expect(missing).toEqual([]);
  });

  it('every template key matches at least one message in en.json', () => {
    const unmatched = uses
      .filter((u) => u.template && u.key.includes('\0'))
      .filter((u) => {
        const re = new RegExp(`^${u.key.split('\0').map(escape).join('.+')}$`);
        return !keys.some((k) => re.test(k));
      })
      .map((u) => `${u.key.replaceAll('\0', '${…}')}  (${u.file}:${u.line})`);
    expect(unmatched).toEqual([]);
  });
});
