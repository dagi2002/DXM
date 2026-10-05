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
  ] as const;

  for (const mode of ['light', 'dark'] as const) {
    it.each(textPairs)(`${mode}: %s on %s ≥ 4.5:1`, (fg, bg) => {
      expect(contrastRatio(semantic[mode][fg], semantic[mode][bg])).toBeGreaterThanOrEqual(4.5);
    });
  }
});
