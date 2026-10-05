// Shared flat config for every workspace. Custom guard rails from ADR-001 / ADR-010:
// - no hard-coded hex colors or "* 100" percentage math in UI code (use @pulse/tokens / @pulse/metrics)
import tseslint from 'typescript-eslint';

const uiGuards = {
  files: ['apps/web/src/**/*.{ts,tsx}', 'packages/ui/src/**/*.{ts,tsx}'],
  rules: {
    'no-restricted-syntax': [
      'error',
      {
        selector: "BinaryExpression[operator='*'][right.value=100]",
        message: 'Format percentages with @pulse/metrics, never with "* 100" in UI code.',
      },
      {
        selector: 'Literal[value=/#[0-9a-fA-F]{6}\\b/]',
        message: 'Use design tokens (CSS variables) instead of hard-coded hex colors.',
      },
    ],
  },
};

export default tseslint.config(
  { ignores: ['**/dist/**', '**/coverage/**', '**/routeTree.gen.ts', '**/drizzle/**', '**/*.config.*'] },
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  uiGuards,
);
