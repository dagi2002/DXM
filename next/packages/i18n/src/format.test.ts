import { TYPE, parse, type MessageFormatElement } from '@formatjs/icu-messageformat-parser';
import { IntlMessageFormat } from 'intl-messageformat';
import { describe, expect, it } from 'vitest';
import { compileMessage } from './format';
import am from './locales/am.json' with { type: 'json' };
import en from './locales/en.json' with { type: 'json' };

/** What the web app used before (i18next-icu): intl-messageformat with ignoreTag. */
const reference = (src: string, locale: string, values?: Record<string, unknown>) =>
  String(new IntlMessageFormat(src, locale, undefined, { ignoreTag: true }).format(values as never));

type ArgKind = 'text' | 'number' | { select: string[] };

function argsOf(src: string): Map<string, ArgKind> {
  const out = new Map<string, ArgKind>();
  const walk = (els: MessageFormatElement[]) => {
    for (const el of els) {
      if (el.type === TYPE.argument && !out.has(el.value)) out.set(el.value, 'text');
      if (el.type === TYPE.number) out.set(el.value, 'number');
      if (el.type === TYPE.plural) {
        out.set(el.value, 'number');
        for (const opt of Object.values(el.options)) walk(opt.value);
      }
      if (el.type === TYPE.select) {
        out.set(el.value, { select: [...Object.keys(el.options), 'something-else'] });
        for (const opt of Object.values(el.options)) walk(opt.value);
      }
    }
  };
  walk(parse(src, { ignoreTag: true }));
  return out;
}

const NUMBERS = [0, 1, 2, 3, 5, 11, 21, 100, 1234, 2.5, 1_250_000];
const TEXTS = ['Abebe', "Tigist's shop", '{braces}', 'ሰላም', 0, 42, ''];

/** A spread of value sets: every argument cycles through its interesting values. */
function valueSets(args: Map<string, ArgKind>): Record<string, unknown>[] {
  const rounds = Math.max(NUMBERS.length, TEXTS.length);
  return Array.from({ length: rounds }, (_, i) => {
    const values: Record<string, unknown> = {};
    let n = 0;
    for (const [name, kind] of args) {
      const at = i + n++;
      if (kind === 'number') values[name] = NUMBERS[at % NUMBERS.length];
      else if (kind === 'text') values[name] = TEXTS[at % TEXTS.length];
      else values[name] = kind.select[at % kind.select.length];
    }
    return values;
  });
}

describe('compileMessage matches intl-messageformat', () => {
  it.each([
    ['en', en as Record<string, string>],
    ['am', am as Record<string, string>],
  ])('for every %s UI message', (locale, file) => {
    let compared = 0;
    for (const [key, src] of Object.entries(file)) {
      const format = compileMessage(src, locale);
      for (const values of valueSets(argsOf(src))) {
        expect(format(values), `${key} ${JSON.stringify(values)}`).toBe(reference(src, locale, values));
        compared++;
      }
    }
    expect(compared).toBeGreaterThan(Object.keys(file).length);
  });

  it.each([
    ["It's fine", {}],
    ["Don''t", {}],
    ["Use '{braces}' and '}' literally", {}],
    ["'{name}' is literal but {name} is not", { name: 'x' }],
    ["a '{quoted ''inner'' text}' b", {}],
    ["unterminated '{quote", {}],
    ["tags stay text: <b>{name}</b> and '<' too", { name: 'x' }],
    ["{n, plural, one {# item '#'} other {# items '#' it''s}}", { n: 1 }],
    ['{n, plural, one {# item} other {# items}}', { n: 1234 }],
    ['# outside a plural is text, {n}', { n: 3 }],
    [
      '{n, plural, offset:1 =0 {nobody} =1 {{name}} one {{name} and # other} other {{name} and # others}}',
      { n: 0, name: 'A' },
    ],
    [
      '{n, plural, offset:1 =0 {nobody} =1 {{name}} one {{name} and # other} other {{name} and # others}}',
      { n: 1, name: 'A' },
    ],
    [
      '{n, plural, offset:1 =0 {nobody} =1 {{name}} one {{name} and # other} other {{name} and # others}}',
      { n: 2, name: 'A' },
    ],
    [
      '{n, plural, offset:1 =0 {nobody} =1 {{name}} one {{name} and # other} other {{name} and # others}}',
      { n: 9, name: 'A' },
    ],
    ['{n, plural, =0 {none} other {{kind, select, a {# of a} other {# of else}}}}', { n: 4, kind: 'a' }],
    ['{kind, select, a {A} b {B} other {{kind}}}', { kind: 'zzz' }],
    ['{kind, select, toString {no} other {yes}}', { kind: 'valueOf' }],
    ['{ n , number } visits', { n: 1234567.891 }],
    ['{n,plural,one{# visit}other{# visits}}', { n: 1 }],
    ['{a}{b}{c}', { a: null, b: false, c: 0 }],
    ['{a} {b}', { a: undefined, b: 'x' }],
    ['a } b', {}],
    ['a }} b {n}', { n: 1 }],
  ] as [string, Record<string, unknown>][])('%s %j', (src, values) => {
    for (const locale of ['en', 'am']) {
      expect(compileMessage(src, locale)(values)).toBe(reference(src, locale, values));
    }
  });

  it('throws on a missing value, like the reference (i18next then shows the raw message)', () => {
    expect(() => reference('Hi {name}', 'en', {})).toThrow();
    expect(() => compileMessage('Hi {name}', 'en')({})).toThrow();
    expect(() => compileMessage('Hi {name}', 'en')()).toThrow();
  });

  it.each([
    '{',
    '{n, plural, one {a } b} other {c}} } d',
    '{n, plural, one {x}}',
    '{x, select, a {x}}',
    '{n, plural, one {x} one {y} other {z}}',
  ])('rejects what the reference rejects: %s', (src) => {
    expect(() => reference(src, 'en', { n: 1, x: 'a' })).toThrow();
    expect(() => compileMessage(src, 'en')).toThrow();
  });

  it.each([
    '{d, date, short}',
    '{t, time}',
    '{n, selectordinal, one {#st} other {#th}}',
    '{n, number, percent}',
    '{n, number, ::currency/ETB}',
  ])('refuses ICU outside the supported subset instead of rendering it wrong: %s', (src) => {
    expect(() => compileMessage(src, 'en')).toThrow(SyntaxError);
  });
});
