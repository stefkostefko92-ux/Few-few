// PNG di controllo (Chromium di Playwright). Uso: node tools/render.mjs <dir-uscita> [prefisso]
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const dir = join(here, '..', 'schemi');
const outDir = process.argv[2];
const pref = process.argv[3] ?? '';
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/usr/lib/node_modules/playwright')); }
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p = await b.newPage({ viewport: { width: 1587, height: 1122 } });
for (const f of readdirSync(dir).filter((x) => x.endsWith('.svg') && x.startsWith(pref))) {
  await p.setContent(`<body style="margin:0">${readFileSync(join(dir, f), 'utf8').replace(/<\?xml[^>]*>/, '')}</body>`);
  await p.screenshot({ path: join(outDir, f.replace('.svg', '.png')) });
  console.log('png', f);
}
await b.close();
