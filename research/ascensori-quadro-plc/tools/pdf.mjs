// Unisce le tavole in un PDF A3 orizzontale. Uso: node tools/pdf.mjs
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const dir = join(here, '..', 'schemi');
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/usr/lib/node_modules/playwright')); }
const pages = readdirSync(dir)
  .filter((f) => f.endsWith('.svg'))
  .sort()
  .map((f) => `<div class="p">${readFileSync(join(dir, f), 'utf8').replace(/<\?xml[^>]*>/, '').replace(/width="1587" height="1122"/, 'width="100%" height="100%"')}</div>`)
  .join('');
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p = await b.newPage();
await p.setContent(`<style>@page{size:420mm 297mm;margin:0}html,body{margin:0}.p{width:420mm;height:297mm;page-break-after:always;overflow:hidden}</style>${pages}`);
await p.pdf({ path: join(here, '..', 'Tavole-quadro-PLC.pdf'), width: '420mm', height: '297mm', printBackground: true });
await b.close();
console.log('PDF scritto');
