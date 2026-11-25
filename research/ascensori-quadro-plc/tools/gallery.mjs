// Genera schemi/index.html (galleria). Uso: node tools/gallery.mjs
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const dir = join(here, '..', 'schemi');
const files = readdirSync(dir).filter((f) => f.endsWith('.svg')).sort();
const title = (f) => /<title>([^<]*)<\/title>/.exec(readFileSync(join(dir, f), 'utf8'))?.[1] ?? f;
const items = files
  .map((f) => `<section id="${f.slice(0, 3)}"><h2>${title(f)}</h2><a href="${f}"><img src="${f}" alt="${title(f)}" loading="lazy"></a></section>`)
  .join('\n');
const nav = files.map((f) => `<a href="#${f.slice(0, 3)}">${f.slice(0, 3)}</a>`).join(' ');
writeFileSync(
  join(dir, 'index.html'),
  `<!doctype html>
<html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Tavole del quadro di manovra a PLC</title>
<style>body{font:15px/1.5 system-ui,sans-serif;margin:0;background:#f3f4f6;color:#111827}
header{position:sticky;top:0;background:#fff;border-bottom:1px solid #d1d5db;padding:10px 16px;z-index:1}
header a{margin-right:8px;color:#1d4ed8;text-decoration:none;font-weight:600}
main{max-width:1600px;margin:0 auto;padding:16px}section{margin:0 0 32px}
h2{font-size:18px}img{width:100%;height:auto;background:#fff;border:1px solid #d1d5db}
@media (prefers-color-scheme:dark){body{background:#111827;color:#f3f4f6}header{background:#1f2937;border-color:#374151}h2{color:#f3f4f6}}</style></head>
<body><header><strong>Quadro di manovra a PLC — tavole</strong> · ${nav}</header><main>
${items}
</main></body></html>
`,
);
console.log('galleria', files.length, 'tavole');
