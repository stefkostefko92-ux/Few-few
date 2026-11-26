// Genera tutte le tavole SVG in ../schemi/ . Uso: node tools/build.mjs [T01 T05 ...]
import { writeFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '..', 'schemi');
const only = process.argv.slice(2);
const mods = readdirSync(here).filter((f) => /^t\d\d-.*\.mjs$/.test(f)).sort();
for (const f of mods) {
  const id = f.slice(0, 3).toUpperCase();
  if (only.length && !only.includes(id)) continue;
  const sheet = (await import(pathToFileURL(join(here, f)).href)).default();
  const name = `${id}-${f.slice(4, -4)}.svg`;
  writeFileSync(join(out, name), sheet.render());
  console.log('scritto', name);
}
