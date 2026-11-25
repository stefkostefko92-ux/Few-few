// Genera le tavole di collegamento SVG in ../. Uso: node collegamenti/tools/wbuild.mjs [E01 E04 …]
import { writeFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '..');
const only = process.argv.slice(2);
const mods = readdirSync(here).filter((f) => /^e\d\d-.*\.mjs$/.test(f)).sort();
for (const f of mods) {
  const id = f.slice(0, 3).toUpperCase();
  if (only.length && !only.includes(id)) continue;
  const sheet = (await import(pathToFileURL(join(here, f)).href)).default();
  const name = `${id}-${f.slice(4, -4)}.svg`;
  writeFileSync(join(out, name), sheet.render());
  console.log('scritto', name);
}
