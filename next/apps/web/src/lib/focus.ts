import { useRouter } from '@tanstack/react-router';
import { useEffect } from 'react';

/**
 * Moves keyboard and screen-reader focus to the page's <h1> inside `container`, waiting for lazy
 * routes and loading skeletons to render a heading with real text. `stale` is the previous page's
 * heading: it is skipped for a short while, since the old page can still be on screen when the
 * navigation resolves (a same-component route may reuse the node, so it is accepted after that).
 * Falls back to the container itself. Returns a cancel function.
 */
export function focusPageHeading(
  container: HTMLElement,
  {
    stale = null,
    timeoutMs = 2000,
    staleMs = 400,
  }: { stale?: Element | null; timeoutMs?: number; staleMs?: number } = {},
): () => void {
  const started = performance.now();
  let frame = 0;
  const tick = () => {
    const elapsed = performance.now() - started;
    const h1 = container.querySelector<HTMLElement>('h1');
    if (h1 && h1.textContent?.trim() && (h1 !== stale || elapsed > staleMs)) {
      if (!h1.hasAttribute('tabindex')) h1.setAttribute('tabindex', '-1');
      h1.focus();
      return;
    }
    if (elapsed > timeoutMs) {
      container.focus();
      return;
    }
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(frame);
}

/**
 * After client-side navigation to a new path, focus the new page's heading so keyboard and
 * screen-reader users start at the top of the new content (WCAG 2.4.3). The first load keeps
 * the browser's default focus; search-param changes (tabs, filters) never move focus.
 */
export function useRouteFocus(containerId = 'main') {
  const router = useRouter();
  useEffect(() => {
    let stale: Element | null = null;
    let cancel = () => {};
    const offBefore = router.subscribe('onBeforeNavigate', (e) => {
      if (e.pathChanged) stale = document.getElementById(containerId)?.querySelector('h1') ?? null;
    });
    const offResolved = router.subscribe('onResolved', (e) => {
      if (!e.pathChanged || !e.fromLocation) return;
      const container = document.getElementById(containerId);
      if (!container) return;
      cancel();
      cancel = focusPageHeading(container, { stale });
    });
    return () => {
      offBefore();
      offResolved();
      cancel();
    };
  }, [router, containerId]);
}
