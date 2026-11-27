// Билдът на браузърния код (CSP: script-src 'self', без CDN):
//   client/dashboard.ts (+ three.js) → public/js/dashboard.js — главната с 3D семената;
//   client/manage.ts                 → public/js/manage.js    — страницата „Партиди“ (без three.js);
// до тях — пълните лицензи на пакетите в бъндълите. Шрифтът Sofia Sans (OFL) → public/fonts/.
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const here = (f) => fileURLToPath(new URL(f, import.meta.url));
const outDir = here('../public/js/');
mkdirSync(outDir, { recursive: true });

const result = await build({
  entryPoints: {
    dashboard: here('../client/dashboard.ts'),
    manage: here('../client/manage.ts'),
  },
  outdir: outDir,
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

// Шрифтът: само кирилица и латиница от променливите файлове; лицензът (OFL) — до тях.
const fontDir = here('../public/fonts/');
mkdirSync(fontDir, { recursive: true });
for (const [pkg, name] of [
  ['sofia-sans', 'sofia-sans'],
  ['sofia-sans-extra-condensed', 'sofia-sans-extra-condensed'],
]) {
  const src = here(`../node_modules/@fontsource-variable/${pkg}/`);
  for (const subset of ['cyrillic', 'latin'])
    copyFileSync(
      join(src, `files/${name}-${subset}-wght-normal.woff2`),
      join(fontDir, `${name}-${subset}.woff2`),
    );
  copyFileSync(join(src, 'LICENSE'), join(fontDir, `${name}-OFL.txt`));
}

for (const [file, o] of Object.entries(result.metafile.outputs))
  process.stdout.write(
    `${file.replace(/^.*public\//, 'public/')} ${(o.bytes / 1024).toFixed(0)} KB\n`,
  );
