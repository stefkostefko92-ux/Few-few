import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../paths.js';

/** Кратък отпечатък на статичните файлове — сменя адреса на CSS/JS при всяка промяна (кешът е дълъг). */
export function assetVersion(): string {
  const hash = createHash('sha256');
  const walk = (dir: string): void => {
    if (!existsSync(dir)) return;
    for (const name of readdirSync(dir).sort()) {
      const file = join(dir, name);
      if (statSync(file).isDirectory()) walk(file);
      else if (/\.(css|js|svg|woff2|webp|avif|png)$/.test(name))
        hash.update(name).update(readFileSync(file));
    }
  };
  walk(join(ROOT, 'public'));
  return hash.digest('hex').slice(0, 10);
}
