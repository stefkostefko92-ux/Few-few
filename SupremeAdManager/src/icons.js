// Inline SVG икони (Lucide, ISC лиценз — public/icons/LICENSE). Четат се веднъж при старт;
// инжектират се inline, за да наследяват currentColor. Само наши файлове — доверено съдържание.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');
const cache = new Map();

for (const file of fs.readdirSync(dir)) {
  if (!file.endsWith('.svg')) continue;
  const svg = fs
    .readFileSync(path.join(dir, file), 'utf8')
    // license коментарът остава във файла (public/icons/), не в HTML изхода
    .replace(/<!--[\s\S]*?-->\s*/g, '')
    // фиксираните размери се управляват от CSS (.icon { width/height: 1em })
    .replace(/\s(width|height)="24"/g, '')
    // сливаме нашия клас със съществуващия lucide клас
    .replace(/class="/, 'aria-hidden="true" focusable="false" class="icon ')
    .trim();
  cache.set(file.replace(/\.svg$/, ''), svg);
}

export function icon(name) {
  return cache.get(name) || '';
}
