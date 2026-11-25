// Билдът на браузърния код: client/dashboard.ts (+ three.js) → public/js/dashboard.js, един ES модул
// от нашия произход (CSP: script-src 'self', без CDN). До него — пълните лицензи на пакетите в него.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const here = (f) => fileURLToPath(new URL(f, import.meta.url));
const outDir = here('../public/js/');
mkdirSync(outDir, { recursive: true });

const result = await build({
  entryPoints: [here('../client/dashboard.ts')],
  outfile: join(outDir, 'dashboard.js'),
  bundle: true,
  format: 'esm',
  target: 'es2022',
  minify: true,
  sourcemap: false,
  charset: 'utf8',
  legalComments: 'none',
  banner: { js: '/*! Open-source licences: /js/THIRD-PARTY-LICENSES.txt */' },
  metafile: true,
  logLevel: 'warning',
});

// MIT иска бележката до кода: пълният текст на лиценза на всеки пакет в бъндъла.
const packages = new Set(
  Object.keys(result.metafile.inputs)
    .map((f) => /node_modules\/((?:@[^/]+\/)?[^/]+)\//.exec(f)?.[1])
    .filter(Boolean),
);
const notices = [...packages].sort().map((name) => {
  const dir = here(`../node_modules/${name}/`);
  const file = ['LICENSE', 'LICENSE.md', 'LICENSE.txt'].find((f) => existsSync(join(dir, f)));
  const { version, license } = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  const text = file ? readFileSync(join(dir, file), 'utf8').trim() : `License: ${license}`;
  return `${name} ${version}\n${'='.repeat(name.length + version.length + 1)}\n${text}\n`;
});
writeFileSync(join(outDir, 'THIRD-PARTY-LICENSES.txt'), notices.join('\n'));
const size = Object.values(result.metafile.outputs).reduce((s, o) => s + o.bytes, 0);
process.stdout.write(`public/js/dashboard.js ${(size / 1024).toFixed(0)} KB\n`);
