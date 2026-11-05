import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Коренът на продукта (`rilievi/`). `src/` при разработка и `dist/` в продукция са едно ниво под него. */
export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
