// Builds the editor: an ES module (engine + UI + three.js, served from our origin — no CDN under the CSP) with the
// photorealistic view split into chunks loaded on demand (chunks/, content-hashed names), and one stylesheet
// (editor/css/*.css + the drawing rules that standalone SVG files carry in their own <style>).
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { build } from 'esbuild';
import { STYLE as DRAWING_CSS } from '../engine/drawing-kit.js';

const here = (f) => new URL(f, import.meta.url).pathname;
const outDir = here('../public/editor/');
mkdirSync(outDir, { recursive: true });

rmSync(join(outDir, 'chunks'), { recursive: true, force: true });
const result = await build({
  entryPoints: { editor: here('../editor/main.js') },
  bundle: true,
  format: 'esm',
  target: 'es2022',
  minify: true,
  sourcemap: false,
  splitting: true,
  chunkNames: 'chunks/[name]-[hash]',
  write: false,
  outdir: outDir,
  charset: 'utf8',
  legalComments: 'none',
  // the packages' own licence headers are stripped: every output file points to the full texts instead
  banner: { js: '/*! Open-source licences: /static/editor/THIRD-PARTY-LICENSES.txt */' },
  metafile: true,
});
for (const file of result.outputFiles) {
  const name = relative(outDir, file.path);
  mkdirSync(dirname(join(outDir, name)), { recursive: true });
  writeFileSync(join(outDir, name), file.text);
}
// the chunks editor.js imports up front (three.js): the page preloads them next to it instead of after it
const entry = Object.entries(result.metafile.outputs).find(([, o]) => o.entryPoint);
const preload = (entry?.[1].imports ?? [])
  .filter((i) => i.kind === 'import-statement')
  .map((i) => relative(outDir, join(process.cwd(), i.path))); // metafile paths are relative to the cwd
writeFileSync(join(outDir, 'preload.json'), `${JSON.stringify(preload)}\n`);
// the licences of every package that ends up in the bundle, in full (MIT asks for the notice with the code)
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
// editor/css/*.css in name order (00-shell, 10-rail, …) — split by topic, served as one file
const parts = readdirSync(here('../editor/css/'))
  .filter((f) => f.endsWith('.css'))
  .sort()
  .map((f) => readFileSync(here(`../editor/css/${f}`), 'utf8'));
const css = `${parts.join('\n')}\n/* drawings (engine/drawing-kit.js STYLE) */\n${DRAWING_CSS}\n`;
writeFileSync(outDir + 'editor.css', css);
const kb = (n) => `${(n / 1024).toFixed(0)} KB`;
console.log(
  result.outputFiles
    .filter((f) => f.path.endsWith('.js'))
    .map((f) => `${relative(outDir, f.path)} ${kb(f.text.length)}`)
    .concat(`editor.css ${kb(css.length)}`)
    .join(' · '),
);
