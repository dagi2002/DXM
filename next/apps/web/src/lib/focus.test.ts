import { afterEach, describe, expect, it, vi } from 'vitest';
import { focusPageHeading } from './focus';

const flush = () => vi.advanceTimersByTimeAsync(20);

describe('focusPageHeading (route-change focus)', () => {
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('waits for a heading with text, then focuses it without making it tabbable', async () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
    document.body.innerHTML = '<main id="main" tabindex="-1"><h1> </h1></main>';
    const main = document.getElementById('main')!;
    focusPageHeading(main);
    await flush();
    expect(document.activeElement).toBe(document.body); // skeleton title is blank
    main.querySelector('h1')!.textContent = 'Today';
    await flush();
    expect(document.activeElement).toBe(main.querySelector('h1'));
    expect(main.querySelector('h1')!.getAttribute('tabindex')).toBe('-1');
  });

  it('skips the previous page heading while the new page renders', async () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
    document.body.innerHTML = '<main id="main" tabindex="-1"><h1>Reports</h1></main>';
    const main = document.getElementById('main')!;
    const stale = main.querySelector('h1');
    focusPageHeading(main, { stale });
    await flush();
    expect(document.activeElement).not.toBe(stale);
    main.innerHTML = '<h1>Today</h1>';
    await flush();
    expect(document.activeElement?.textContent).toBe('Today');
  });

  it('falls back to the container when no heading appears', async () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
    document.body.innerHTML = '<main id="main" tabindex="-1"></main>';
    const main = document.getElementById('main')!;
    focusPageHeading(main, { timeoutMs: 100 });
    await vi.advanceTimersByTimeAsync(200);
    expect(document.activeElement).toBe(main);
  });
});
