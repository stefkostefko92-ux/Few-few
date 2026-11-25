import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT } from './paths.js';

/**
 * „Build“ на листовете с изчисление: отпечатъкът на кода, който смята и пише (папката на работещия код —
 * `dist/` в образа, `src/` при разработка — и `locales/`). Същият код дава същия отпечатък, всяка промяна —
 * нов; на сървъра няма `.git`, затова не е номер на комит. Сметнат веднъж за процеса.
 */
let build: string | null = null;

export function buildCorrente(): string {
  if (build) return build;
  const hash = createHash('sha256');
  const walk = (dir: string) => {
    for (const name of readdirSync(dir).sort()) {
      const file = join(dir, name);
      if (statSync(file).isDirectory()) walk(file);
      else if (/\.(js|ts|json)$/.test(name))
        hash.update(relative(ROOT, file)).update(readFileSync(file));
    }
  };
  walk(dirname(fileURLToPath(import.meta.url)));
  walk(join(ROOT, 'locales'));
  build = hash.digest('hex').slice(0, 10);
  return build;
}

/** JSON с подредени ключове — един и същ вход дава един и същ низ. */
function canonico(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonico).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonico((value as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}

/**
 * „Rif.“ на листа: SHA-256 на вида изчисление, build-а и входа — резултатът следва от тях. Отпечатаният
 * лист се сверява със записаното изчисление: същият вход и същият софтуер дават същия Rif.
 */
export function improntaCalcolo(calcolo: string, build: string, dati: unknown): string {
  const hex = createHash('sha256')
    .update(canonico({ calcolo, build, dati }))
    .digest('hex')
    .slice(0, 12)
    .toUpperCase();
  return `${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}`;
}
