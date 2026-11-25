import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Файловете, към които страниците сочат с `?v=`. Кешът на `/static` е 30 дни и `immutable`: браузърът
 * изобщо не пита сървъра, затова и нова снимка или лого (без промяна в CSS/JS) трябва да сменят адреса.
 */
const VERSIONED = /\.(css|js|svg|woff2|webp|png|ico|avif|jpg)$/;

/** Кратък отпечатък на статичните файлове в `dir` — сменя адреса им при всяка промяна. */
export function assetVersion(dir: string): string {
  const hash = createHash('sha256');
  const walk = (current: string): void => {
    for (const name of readdirSync(current).sort()) {
      const file = join(current, name);
      if (statSync(file).isDirectory()) walk(file);
      else if (VERSIONED.test(name)) hash.update(name).update(readFileSync(file));
    }
  };
  walk(dir);
  return hash.digest('hex').slice(0, 10);
}
