import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.strict,
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
