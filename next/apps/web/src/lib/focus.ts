import { useRouterState } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';

/**
 * Moves keyboard and screen-reader focus to the page's <h1> inside `container`, waiting (up to
 * `timeoutMs`) for lazy routes and loading skeletons to render a heading with real text.
 * Falls back to the container itself. Returns a cancel function.
 */
export function focusPageHeading(container: HTMLElement, timeoutMs = 2000): () => void {
  const started = performance.now();
  let frame = 0;
  const tick = () => {
    const h1 = container.querySelector<HTMLElement>('h1');
    if (h1 && h1.textContent?.trim()) {
      if (!h1.hasAttribute('tabindex')) h1.setAttribute('tabindex', '-1');
      h1.focus();
      return;
    }
    if (performance.now() - started > timeoutMs) {
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
 * screen-reader users start at the top of the new content (WCAG 2.4.3). The first render keeps
 * the browser's default focus; search-param changes (tabs, filters) never move focus.
 */
export function useRouteFocus(containerId = 'main') {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const previous = useRef(pathname);
  useEffect(() => {
    if (previous.current === pathname) return;
    previous.current = pathname;
    const container = document.getElementById(containerId);
    if (!container) return;
    return focusPageHeading(container);
  }, [pathname, containerId]);
}
