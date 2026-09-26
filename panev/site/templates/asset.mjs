// Адрес на файл от сайта с версия от съдържанието (`?v=<хеш>`), за файловете, които се подменят под
// същото име: 3D рендерите в /img/ (nginx ги кешира 30 дни без проверка) и PDF каталогът в /docs/
// (7 дни). HTML-ът се проверява при всяко зареждане, затова новата версия стига веднага.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const hashes = new Map();

// `path`: от корена на сайта, с или без водеща наклонена черта.
export function versioned(path) {
  const file = path.replace(/^\//, '');
  if (!hashes.has(file)) hashes.set(file, createHash('sha256').update(readFileSync(join(ROOT, file))).digest('hex').slice(0, 10));
  return `/${file}?v=${hashes.get(file)}`;
}
