// Builds the editor: one ES module (engine + UI + three.js, served from our origin — no CDN under the CSP) and
// one stylesheet (editor/css/*.css + the drawing rules that standalone SVG files carry in their own <style>).
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { build } from 'esbuild';
import { STYLE as DRAWING_CSS } from '../engine/drawing-kit.js';

const here = (f) => new URL(f, import.meta.url).pathname;
const outDir = here('../public/editor/');
mkdirSync(outDir, { recursive: true });

const result = await build({
  entryPoints: [here('../editor/main.js')],
  bundle: true,
  format: 'esm',
  target: 'es2022',
  minify: true,
  sourcemap: false,
  write: false,
  outfile: outDir + 'editor.js',
  charset: 'utf8',
  legalComments: 'external',
  metafile: true,
});
for (const file of result.outputFiles) {
  const name = file.path.endsWith('.LEGAL.txt') ? 'editor.LEGAL.txt' : 'editor.js';
  writeFileSync(outDir + name, file.text);
}
// editor/css/*.css in name order (00-shell, 10-rail, …) — split by topic, served as one file
const parts = readdirSync(here('../editor/css/'))
  .filter((f) => f.endsWith('.css'))
  .sort()
  .map((f) => readFileSync(here(`../editor/css/${f}`), 'utf8'));
const css = `${parts.join('\n')}\n/* drawings (engine/drawing-kit.js STYLE) */\n${DRAWING_CSS}\n`;
writeFileSync(outDir + 'editor.css', css);
const js = result.outputFiles.find((f) => !f.path.endsWith('.LEGAL.txt'));
console.log(
  `editor.js ${(js.text.length / 1024).toFixed(0)} KB · editor.css ${(css.length / 1024).toFixed(0)} KB`,
);
