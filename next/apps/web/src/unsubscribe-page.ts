/**
 * `/unsubscribe.html#<token>` — the link in the Monday email (task 15). A separate tiny page, not
 * a route of the app, so it adds nothing to the app's first-load JS and needs no sign-in. The
 * token rides in the fragment, so it never reaches server logs. Opening the page changes nothing
 * (mail scanners open links); the person confirms with the button, which POSTs the one-click
 * unsubscribe endpoint.
 */
import am from '@pulse/i18n/locales/am.json';
import en from '@pulse/i18n/locales/en.json';

type Messages = Record<string, string>;

function locale(): 'en' | 'am' {
  try {
    const saved = localStorage.getItem('pulse.lang');
    if (saved === 'en' || saved === 'am') return saved;
  } catch {
    /* storage unavailable */
  }
  const primary = (navigator.languages?.[0] ?? navigator.language ?? 'en').toLowerCase();
  return primary.startsWith('am') ? 'am' : 'en';
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string) {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const BUTTON =
  'inline-flex min-h-11 w-fit items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-on-primary disabled:opacity-60';
const LINK = 'w-fit text-sm font-medium text-primary underline-offset-4 hover:underline';

export function mount(root: HTMLElement, token: string, lang: 'en' | 'am', fetchImpl = fetch) {
  const m: Messages = lang === 'am' ? am : en;
  document.documentElement.lang = lang;
  const title = el('h1', 'text-xl font-semibold', m['unsubscribe.title']);
  const status = el('div', 'text-sm');
  status.setAttribute('role', 'status');
  const body = el('p', 'text-sm text-text-muted', m['unsubscribe.body']);
  const button = el('button', BUTTON, m['unsubscribe.confirm']);
  button.type = 'button';
  const settings = el('a', LINK, m['unsubscribe.toSettings']);
  settings.href = '/settings';
  root.replaceChildren(title, body, status, button, settings);

  const valid = /^[A-Za-z0-9]{32,64}$/.test(token);
  const finish = (key: string) => {
    body.remove();
    button.remove();
    status.textContent = m[key] ?? '';
  };
  if (!valid) {
    finish('unsubscribe.invalid');
    return;
  }
  button.addEventListener('click', async () => {
    button.disabled = true;
    try {
      const res = await fetchImpl(`/api/v1/public/digest/unsubscribe/${token}`, {
        method: 'POST',
        credentials: 'omit',
      });
      if (res.ok) finish('unsubscribe.done');
      else if (res.status === 404) finish('unsubscribe.invalid');
      else {
        status.textContent = m['unsubscribe.error'] ?? '';
        button.disabled = false;
      }
    } catch {
      status.textContent = m['unsubscribe.error'] ?? '';
      button.disabled = false;
    }
  });
}

const root = document.getElementById('unsubscribe');
if (root) void mount(root, decodeURIComponent(location.hash.slice(1)), locale());
