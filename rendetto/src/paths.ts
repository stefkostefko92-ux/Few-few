import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Коренът на продукта (`rendetto/`). `src/` при разработка и `dist/` в продукция са едно ниво под него. */
export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Път от конфигурацията: абсолютен остава, относителен се чете спрямо корена на продукта. */
export function fromRoot(path: string): string {
  return isAbsolute(path) ? path : resolve(ROOT, path);
}
