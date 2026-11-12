/**
 * A small ICU MessageFormat formatter for the browser.
 *
 * The web app used to ship the full ICU parser (intl-messageformat + i18next-icu, about 12 KB
 * gzip) on every first load. Our messages only use a small part of ICU, so this formats that
 * part and nothing else:
 *
 *   {name}                          simple argument
 *   {n, number}                     locale number
 *   {n, plural, offset:1 =0 {…} one {…} other {…}}   with `#`
 *   {x, select, a {…} other {…}}
 *   apostrophe quoting ('{', '}', '' and '#' inside plural)
 *
 * It follows intl-messageformat's behaviour (with `ignoreTag: true`) exactly for that subset;
 * `format.test.ts` formats every message in every locale with both and compares the output.
 * Anything outside the subset (date, time, selectordinal, number skeletons) throws at compile
 * time, and the same test fails, so a new message can't silently render wrong. The server keeps
 * using intl-messageformat (`./messages`).
 */

export type MessageValues = Record<string, unknown>;

type Node =
  | string
  | { kind: 'arg'; name: string }
  | { kind: 'number'; name: string }
  | { kind: 'pound' }
  | { kind: 'plural'; name: string; offset: number; options: Record<string, Node[]> }
  | { kind: 'select'; name: string; options: Record<string, Node[]> };

const WS = /\s/;
const PLURAL_KEYWORD = /^(?:zero|one|two|few|many|other|=\d+)$/;

class Parser {
  private i = 0;
  constructor(private readonly src: string) {}

  parse(): Node[] {
    return this.message(0, false);
  }

  private message(depth: number, inPlural: boolean): Node[] {
    const out: Node[] = [];
    let text = '';
    const flush = () => {
      if (text) out.push(text);
      text = '';
    };
    while (this.i < this.src.length) {
      const ch = this.src[this.i]!;
      if (ch === '{') {
        flush();
        out.push(this.argument(depth));
      } else if (ch === '}') {
        // A stray "}" at the top level is plain text; inside an option it closes the option.
        if (depth > 0) break;
        text += ch;
        this.i++;
      } else if (ch === '#' && inPlural) {
        flush();
        out.push({ kind: 'pound' });
        this.i++;
      } else if (ch === "'") {
        text += this.quote(inPlural);
      } else {
        text += ch;
        this.i++;
      }
    }
    flush();
    return out;
  }

  /** ICU apostrophe rules: '' is a literal apostrophe; '{…' quotes syntax until the next lone apostrophe. */
  private quote(inPlural: boolean): string {
    const next = this.src[this.i + 1];
    if (next === "'") {
      this.i += 2;
      return "'";
    }
    const startsQuote =
      next === '{' || next === '}' || next === '<' || next === '>' || (next === '#' && inPlural);
    if (!startsQuote) {
      this.i++;
      return "'";
    }
    this.i++; // opening apostrophe
    let text = '';
    while (this.i < this.src.length) {
      const ch = this.src[this.i]!;
      if (ch === "'") {
        if (this.src[this.i + 1] === "'") {
          text += "'";
          this.i += 2;
          continue;
        }
        this.i++;
        break;
      }
      text += ch;
      this.i++;
    }
    return text;
  }

  private skipWs() {
    while (this.i < this.src.length && WS.test(this.src[this.i]!)) this.i++;
  }

  private word(stop: RegExp): string {
    const start = this.i;
    while (this.i < this.src.length && !stop.test(this.src[this.i]!)) this.i++;
    return this.src.slice(start, this.i);
  }

  private expect(ch: string) {
    if (this.src[this.i] !== ch)
      throw new SyntaxError(`Expected "${ch}" at ${this.i} in message: ${this.src}`);
    this.i++;
  }

  private argument(depth: number): Node {
    this.expect('{');
    this.skipWs();
    const name = this.word(/[\s,{}]/);
    if (!name) throw new SyntaxError(`Empty argument in message: ${this.src}`);
    this.skipWs();
    if (this.src[this.i] === '}') {
      this.i++;
      return { kind: 'arg', name };
    }
    this.expect(',');
    this.skipWs();
    const type = this.word(/[\s,{}]/);
    this.skipWs();
    if (type === 'number') {
      // Styles and skeletons ({n, number, percent}) are not part of the subset.
      this.expect('}');
      return { kind: 'number', name };
    }
    if (type !== 'plural' && type !== 'select') {
      throw new SyntaxError(`Unsupported argument type "${type}" in message: ${this.src}`);
    }
    this.expect(',');
    this.skipWs();
    let offset = 0;
    if (type === 'plural' && this.src.startsWith('offset:', this.i)) {
      this.i += 7;
      this.skipWs();
      const raw = this.word(/[\s{}]/);
      if (!/^-?\d+$/.test(raw)) throw new SyntaxError(`Bad plural offset in message: ${this.src}`);
      offset = Number(raw);
      this.skipWs();
    }
    const options: Record<string, Node[]> = {};
    while (this.i < this.src.length && this.src[this.i] !== '}') {
      const selector = this.word(/[\s{}]/);
      if (!selector || (type === 'plural' && !PLURAL_KEYWORD.test(selector))) {
        throw new SyntaxError(`Bad ${type} selector "${selector}" in message: ${this.src}`);
      }
      if (Object.hasOwn(options, selector))
        throw new SyntaxError(`Duplicate selector "${selector}" in message: ${this.src}`);
      this.skipWs();
      this.expect('{');
      // `#` is the plural number only directly inside a plural option, not inside a nested select.
      options[selector] = this.message(depth + 1, type === 'plural');
      this.expect('}');
      this.skipWs();
    }
    this.expect('}');
    if (!Object.hasOwn(options, 'other')) {
      throw new SyntaxError(`Missing "other" in ${type} in message: ${this.src}`);
    }
    return type === 'plural' ? { kind: 'plural', name, offset, options } : { kind: 'select', name, options };
  }
}

const numberFormats = new Map<string, Intl.NumberFormat>();
const pluralRules = new Map<string, Intl.PluralRules>();

function numberFormat(locale: string) {
  let f = numberFormats.get(locale);
  if (!f) numberFormats.set(locale, (f = new Intl.NumberFormat(locale)));
  return f;
}

function pluralRule(locale: string) {
  let r = pluralRules.get(locale);
  if (!r) pluralRules.set(locale, (r = new Intl.PluralRules(locale)));
  return r;
}

function valueOf(values: MessageValues | undefined, name: string, source: string): unknown {
  if (!values || !(name in values)) {
    throw new Error(`The message "${source}" needs a value for "${name}"`);
  }
  return values[name];
}

function render(
  nodes: Node[],
  values: MessageValues | undefined,
  locale: string,
  source: string,
  pound: number | undefined,
): string {
  let out = '';
  for (const node of nodes) {
    if (typeof node === 'string') {
      out += node;
      continue;
    }
    if (node.kind === 'pound') {
      out += pound === undefined ? '#' : numberFormat(locale).format(pound);
      continue;
    }
    const value = valueOf(values, node.name, source);
    switch (node.kind) {
      case 'arg':
        // Same as intl-messageformat: falsy non-numbers print nothing, 0 prints "0".
        out += !value && typeof value !== 'number' && typeof value !== 'bigint' ? '' : String(value);
        break;
      case 'number':
        out += numberFormat(locale).format(value as number);
        break;
      case 'select': {
        const option = Object.hasOwn(node.options, value as string)
          ? node.options[value as string]!
          : node.options.other!;
        out += render(option, values, locale, source, pound);
        break;
      }
      case 'plural': {
        const n = (value as number) - node.offset;
        const option =
          node.options[`=${value as number}`] ??
          node.options[pluralRule(locale).select(n)] ??
          node.options.other!;
        out += render(option, values, locale, source, n);
        break;
      }
    }
  }
  return out;
}

export type CompiledMessage = (values?: MessageValues) => string;

/** Parses a message once; the returned function formats it. Throws on syntax outside the subset. */
export function compileMessage(source: string, locale: string): CompiledMessage {
  const nodes = new Parser(source).parse();
  return (values) => render(nodes, values, locale, source, undefined);
}
