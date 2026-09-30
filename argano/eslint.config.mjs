import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import nextPlugin from '@next/eslint-plugin-next';

export default tseslint.config(
  { ignores: ['node_modules/**', '.next/**', 'next-env.d.ts'] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks, '@next/next': nextPlugin },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
      // App Router with next-intl: pages use the localized Link; plain <a> is right for API downloads and the root 404
      '@next/next/no-html-link-for-pages': 'off',
    },
  },
  {
    // Node scripts (smoke test)
    files: ['scripts/**/*.mjs'],
    languageOptions: { globals: { process: 'readonly', fetch: 'readonly', console: 'readonly', URL: 'readonly' } },
  },
  {
    // the calculation engine runs in the browser and on the server: no runtime, framework or I/O imports
    files: ['src/calc/**/*.ts'],
    ignores: ['src/calc/__tests__/**'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['node:*', 'fs', 'path', 'http', 'https', 'net', 'child_process'], message: 'calc/ must stay free of I/O.' },
          { group: ['next', 'next/*', 'react', 'react-dom', '@prisma/client'], message: 'calc/ must stay free of UI and database code.' },
        ],
      }],
    },
  },
);
