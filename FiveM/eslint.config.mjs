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
    // `src/components/mascot/JellyMascot.tsx` е ГЕНЕРИРАН файл (1256 реда),
    // копиран в продукта. Не се редактира на ръка, затова не се и линтва —
    // иначе гейтът иска промяна, която е забранена.
    //
    // ВНИМАНИЕ: тук пишеше „копие от пакета `mascot/` в корена“, но такава
    // папка НЯМА — нито на диска, нито в `origin/main` (проверено с
    // `git ls-tree`). Изключването си остава оправдано заради генерирания
    // характер на файла; обосновката, която сочеше несъществуващ източник, не
    // беше. Върне ли се източникът в репото, върни и препратката.
    ignores: ['node_modules/**', '.next/**', 'next-env.d.ts', 'src/components/mascot/**'],
  },
];

export default eslintConfig;
