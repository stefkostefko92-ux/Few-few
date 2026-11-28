// Galleria HTML e PDF A3 delle tavole di collegamento. Uso: node collegamenti/tools/wpdf.mjs
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const dir = join(here, '..');
const files = readdirSync(dir).filter((f) => /^E\d\d-.*\.svg$/.test(f)).sort();
const title = (f) => /<title>([^<]*)<\/title>/.exec(readFileSync(join(dir, f), 'utf8'))?.[1] ?? f;
writeFileSync(
  join(dir, 'index.html'),
  `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Schemi di collegamento del quadro di manovra</title>
<style>body{font:15px/1.5 system-ui,sans-serif;margin:0;background:#f3f4f6;color:#111827}header{position:sticky;top:0;background:#fff;border-bottom:1px solid #d1d5db;padding:10px 16px;z-index:1}header a{margin-right:8px;color:#1d4ed8;text-decoration:none;font-weight:600}main{max-width:1600px;margin:0 auto;padding:16px}section{margin:0 0 32px}h2{font-size:18px}img{width:100%;height:auto;background:#fff;border:1px solid #d1d5db}@media (prefers-color-scheme:dark){body{background:#111827;color:#f3f4f6}header{background:#1f2937;border-color:#374151}}</style></head><body>
<header><strong>Schemi di collegamento</strong> · ${files.map((f) => `<a href="#${f.slice(0, 3)}">${f.slice(0, 3)}</a>`).join(' ')}</header><main>
${files.map((f) => `<section id="${f.slice(0, 3)}"><h2>${title(f)}</h2><a href="${f}"><img src="${f}" alt="${title(f)}" loading="lazy"></a></section>`).join('\n')}
</main></body></html>`,
);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/usr/lib/node_modules/playwright')); }
const pages = files
  .map((f) => `<div class="p">${readFileSync(join(dir, f), 'utf8').replace(/<\?xml[^>]*>/, '').replace(/width="1587" height="1122"/, 'width="100%" height="100%"')}</div>`)
  .join('');
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p = await b.newPage();
await p.setContent(`<style>@page{size:420mm 297mm;margin:0}html,body{margin:0}.p{width:420mm;height:297mm;page-break-after:always;overflow:hidden}</style>${pages}`);
await p.pdf({ path: join(dir, '..', 'Schemi-collegamento-quadro-PLC.pdf'), width: '420mm', height: '297mm', printBackground: true });
await b.close();
console.log('PDF e galleria:', files.length, 'fogli');
