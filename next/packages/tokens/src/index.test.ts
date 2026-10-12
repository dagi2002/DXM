import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { contrastRatio, semantic } from './index';
import { renderTokensCss } from './render-css';

describe('tokens.css', () => {
  it('is in sync with the TypeScript tokens (run `pnpm --filter @pulse/tokens build:css`)', () => {
    const onDisk = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8');
    expect(onDisk).toBe(renderTokensCss());
  });
});

describe('contrast (WCAG 2.2 AA)', () => {
  const textPairs = [
    ['text', 'bg'],
    ['text', 'surface'],
    ['text-muted', 'bg'],
    ['text-muted', 'surface'],
    ['text-faint', 'surface'],
    ['text-faint', 'bg'],
    ['text-faint', 'surface-sunken'],
    ['text-muted', 'surface-sunken'],
    ['text', 'surface-sunken'],
    ['on-primary', 'primary'],
    ['primary', 'surface'],
    ['good', 'good-bg'],
    ['warn', 'warn-bg'],
    ['bad', 'bad-bg'],
    ['ai', 'ai-bg'],
    ['info', 'info-bg'],
    // Pairings introduced by the platform screens (AI box, replay list, sample/status pills,
    // verified rows, fix outcomes, inverse plan card, active nav).
    ['ai', 'surface'],
    ['text', 'ai-bg'],
    ['text-muted', 'ai-bg'],
    ['primary', 'primary-soft'],
    ['primary', 'bg'],
    ['good', 'surface'],
    ['bad', 'surface'],
    ['warn', 'surface'],
    ['text', 'good-bg'],
    ['text', 'bad-bg'],
    ['text', 'warn-bg'],
    ['bg', 'text'],
  ] as const;

  for (const mode of ['light', 'dark'] as const) {
    it.each(textPairs)(`${mode}: %s on %s ≥ 4.5:1`, (fg, bg) => {
      expect(contrastRatio(semantic[mode][fg], semantic[mode][bg])).toBeGreaterThanOrEqual(4.5);
    });
  }

  // Funnel/speed bars, chart lines and dots, health ring: graphics need 3:1 against their track.
  const graphicPairs = [
    ['primary', 'surface-sunken'],
    ['bad', 'surface-sunken'],
    ['good', 'surface-sunken'],
    ['warn', 'surface-sunken'],
    ['primary', 'surface'],
    ['good', 'surface'],
  ] as const;
  for (const mode of ['light', 'dark'] as const) {
    it.each(graphicPairs)(`${mode}: graphic %s on %s ≥ 3:1`, (fg, bg) => {
      expect(contrastRatio(semantic[mode][fg], semantic[mode][bg])).toBeGreaterThanOrEqual(3);
    });
  }
});
