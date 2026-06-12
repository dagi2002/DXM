/**
 * DXM Pulse SDK v2 — Interaction events
 *
 * Handles clicks, scrolls, dead clicks, and form lifecycle events.
 *
 * Dead-click heuristic:
 *   On click → attach a one-shot MutationObserver on document.body → race a 500ms timer.
 *   If the timer wins (no DOM mutation / nav / input change), emit a `dead_click`.
 *   This is the de-facto industry definition (Contentsquare, Hotjar, Clarity all use ~500ms).
 *
 * Form events:
 *   - form_start fires on first focusin inside an unseen <form> this session
 *   - form_submit fires on the form's submit event
 *   - form_error fires on native 'invalid' events bubbling up from fields
 *   Field *values* are never sent. Field names run through the privacy scrub denylist.
 */
import type { SdkConfig } from '../types.js';
import { push } from '../transport.js';
import { scrubUrl, scrubFieldName, isInputCaptureDisabled } from '../privacy.js';

const describeTarget = (el: Element | null): string => {
  if (!el) return '';
  const tag = (el.tagName || '').toUpperCase();
  const id = (el as HTMLElement).id ? `#${(el as HTMLElement).id}` : '';
  const className =
    typeof (el as HTMLElement).className === 'string'
      ? `.${((el as HTMLElement).className as string).trim().split(/\s+/).slice(0, 2).join('.')}`.replace(/\.$/, '')
      : '';
  return (tag + id + className).slice(0, 80);
};

const formScopeFor = (form: HTMLFormElement): string => {
  if (form.id) return `#${form.id}`;
  const name = form.getAttribute('name');
  if (name) return `[name="${name}"]`;
  const forms = Array.from(document.querySelectorAll('form'));
  const index = forms.indexOf(form);
  return `form:nth-of-type(${index + 1})`;
};

export const installInteractionEvents = (cfg: SdkConfig): void => {
  // ── Click + Dead click ─────────────────────────────────────────────────────
  document.addEventListener(
    'click',
    (e) => {
      const target = describeTarget(e.target as Element);
      const clickEvent = {
        type: 'click' as const,
        x: Math.round((e as MouseEvent).clientX),
        y: Math.round((e as MouseEvent).clientY),
        target,
        ts: Date.now(),
      };
      push(cfg, clickEvent);

      // Race: any DOM mutation / navigation / input change within 500ms defeats "dead"
      let alive = false;
      const observer = new MutationObserver(() => {
        alive = true;
        observer.disconnect();
      });
      try {
        observer.observe(document.body, {
          subtree: true,
          childList: true,
          attributes: true,
          characterData: false,
        });
      } catch {
        return;
      }
      const navCancel = (): void => { alive = true; };
      window.addEventListener('hashchange', navCancel, { once: true });
      window.addEventListener('beforeunload', navCancel, { once: true });

      setTimeout(() => {
        observer.disconnect();
        if (!alive) {
          push(cfg, {
            type: 'dead_click',
            x: clickEvent.x,
            y: clickEvent.y,
            target,
            ts: Date.now(),
          });
        }
      }, 500);
    },
    { passive: true },
  );

  // ── Scroll (new maxima only) ───────────────────────────────────────────────
  let maxScroll = 0;
  document.addEventListener(
    'scroll',
    () => {
      const depth = Math.round(window.scrollY + window.innerHeight);
      if (depth > maxScroll) {
        maxScroll = depth;
        const max = Math.max(1, document.body.scrollHeight - window.innerHeight);
        push(cfg, {
          type: 'scroll',
          depth,
          pct: Math.min(100, Math.round((window.scrollY / max) * 100)),
          ts: Date.now(),
        });
      }
    },
    { passive: true },
  );

  // ── Form lifecycle ─────────────────────────────────────────────────────────
  const startedForms = new WeakSet<HTMLFormElement>();

  document.addEventListener(
    'focusin',
    (e) => {
      if (isInputCaptureDisabled()) return;
      const target = e.target as Element | null;
      if (!target) return;
      const form = target.closest('form');
      if (!form || startedForms.has(form as HTMLFormElement)) return;
      startedForms.add(form as HTMLFormElement);
      push(cfg, {
        type: 'form_start',
        formId: formScopeFor(form as HTMLFormElement),
        url: scrubUrl(location.href),
        ts: Date.now(),
      });
    },
    { passive: true },
  );

  document.addEventListener(
    'submit',
    (e) => {
      if (isInputCaptureDisabled()) return;
      const form = e.target as HTMLFormElement | null;
      if (!form || !form.tagName || form.tagName.toUpperCase() !== 'FORM') return;
      push(cfg, {
        type: 'form_submit',
        formId: formScopeFor(form),
        url: scrubUrl(location.href),
        ts: Date.now(),
      });
    },
    { passive: true, capture: true },
  );

  // `invalid` events do not bubble by default, so we capture on the document.
  document.addEventListener(
    'invalid',
    (e) => {
      if (isInputCaptureDisabled()) return;
      const field = e.target as (HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement) | null;
      if (!field) return;
      const form = field.form;
      if (!form) return;
      const scrubbedName = scrubFieldName(field.name || field.id || null);
      push(cfg, {
        type: 'form_error',
        formId: formScopeFor(form),
        fieldName: scrubbedName ?? undefined,
        message: (field.validationMessage || '').slice(0, 120) || undefined,
        url: scrubUrl(location.href),
        ts: Date.now(),
      });
    },
    { capture: true },
  );
};
