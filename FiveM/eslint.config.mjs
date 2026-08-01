import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { FlatCompat } from '@eslint/eslintrc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    // `src/components/mascot/` е КОПИЕ на генериран файл от пакета `mascot/`.
    // Не се редактира тук (поправката е в източника + `node mascot/build.mjs`),
    // затова и не се линтва тук — иначе гейтът иска промяна, която е забранена.
    ignores: ['node_modules/**', '.next/**', 'next-env.d.ts', 'src/components/mascot/**'],
  },
];

export default eslintConfig;
