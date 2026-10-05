/**
 * Pulse design tokens — source of truth for web (CSS variables via scripts/build-css.ts),
 * charts and the future Expo app. See docs/rebuild/02-design-system.md.
 */

export const palette = {
  abay: {
    50: '#F0F3FE', 100: '#DCE3FC', 200: '#B9C6F9', 300: '#8FA3F4', 400: '#6680EC',
    500: '#4562E3', 600: '#2D4BD8', 700: '#2540BF', 800: '#1E3396', 900: '#172770',
  },
  basalt: {
    0: '#FAF9F6', 50: '#F3F1EC', 200: '#E4E1DA', 300: '#D3CFC6', 400: '#B3AFA6',
    500: '#8C8981', 600: '#5F5D57', 700: '#3F3E3A', 800: '#26272C', 900: '#1B1C21',
  },
} as const;

/** Semantic color roles. Components may only use these. */
export const semantic = {
  light: {
    bg: '#FAF9F6',
    surface: '#FFFFFF',
    'surface-sunken': '#F3F1EC',
    border: '#E4E1DA',
    'border-strong': '#D3CFC6',
    text: '#1B1C21',
    'text-muted': '#5F5D57',
    'text-faint': '#77746D',
    primary: '#2D4BD8',
    'primary-hover': '#2540BF',
    'primary-soft': '#E9EDFC',
    'on-primary': '#FFFFFF',
    good: '#0F7A5C',
    'good-bg': '#E3F4EE',
    warn: '#A15C00',
    'warn-bg': '#FDF0DC',
    bad: '#C2381E',
    'bad-bg': '#FCE7E2',
    ai: '#8A5A00',
    'ai-bg': '#FBF1DA',
    info: '#4A5568',
    'info-bg': '#EDF0F4',
  },
  dark: {
    bg: '#0F1014',
    surface: '#17181D',
    'surface-sunken': '#121317',
    border: '#2A2C33',
    'border-strong': '#3A3D46',
    text: '#EDEBE6',
    'text-muted': '#A3A09A',
    'text-faint': '#8E8B85',
    primary: '#7F95F5',
    'primary-hover': '#98A9F7',
    'primary-soft': '#1C2340',
    'on-primary': '#0F1014',
    good: '#4FD1A5',
    'good-bg': '#10261F',
    warn: '#F2B45A',
    'warn-bg': '#2A1E0C',
    bad: '#FF8A70',
    'bad-bg': '#2C1410',
    ai: '#F5C76B',
    'ai-bg': '#28200D',
    info: '#A9B4C4',
    'info-bg': '#1B1F27',
  },
} as const;

export type SemanticColor = keyof typeof semantic.light;

/** Categorical data-viz palette (max 6 series, always direct-labelled). */
export const dataViz = {
  light: ['#2D4BD8', '#0F8C7E', '#C98A0B', '#8B3FA8', '#4A5568', '#D9583B'],
  dark: ['#7F95F5', '#3CC2B1', '#E5B04A', '#C27BDB', '#9AA5B5', '#F08566'],
} as const;

export const radius = { sm: 6, md: 10, lg: 14, xl: 20 } as const;
export const spacingBase = 4;
export const motion = { fast: 120, base: 200, slow: 320, easing: 'cubic-bezier(.2,.8,.2,1)' } as const;
export const fonts = {
  sans: '"Inter", "Noto Sans Ethiopic", system-ui, sans-serif',
  display: '"Inter Tight", "Inter", "Noto Sans Ethiopic", system-ui, sans-serif',
  mono: '"JetBrains Mono", ui-monospace, monospace',
} as const;

/** WCAG relative luminance contrast ratio between two #RRGGBB colors. */
export function contrastRatio(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    }) as [number, number, number];
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}
