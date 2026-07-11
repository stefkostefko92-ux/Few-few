// Déjà — build: esbuild бъндъл + статични файлове + ONNX WASM в пакета.
// Изход: dist/ — зарежда се директно като unpacked extension.

import * as esbuild from 'esbuild';
import { copyFileSync, cpSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';

const dist = 'dist';
rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

const common = { bundle: true, minify: true, target: 'chrome116', logLevel: 'info' };

// extension страници + service worker — ES модули
await esbuild.build({
  ...common,
  entryPoints: {
    background: 'src/background.js',
    offscreen: 'src/offscreen/offscreen.js',
    search: 'src/search/search.js',
    popup: 'src/popup/popup.js',
  },
  format: 'esm',
  outdir: dist,
});

// content script-овете НЕ са модули — класически IIFE
await esbuild.build({
  ...common,
  entryPoints: { content: 'src/content.js' },
  format: 'iife',
  outdir: dist,
});

// статични файлове
copyFileSync('manifest.json', `${dist}/manifest.json`);
copyFileSync('src/offscreen/offscreen.html', `${dist}/offscreen.html`);
copyFileSync('src/search/search.html', `${dist}/search.html`);
copyFileSync('src/search/search.css', `${dist}/search.css`);
copyFileSync('src/popup/popup.html', `${dist}/popup.html`);
copyFileSync('src/popup/popup.css', `${dist}/popup.css`);
cpSync('icons', `${dist}/icons`, { recursive: true });

// ONNX Runtime WASM — доставя се В пакета; Chrome Web Store забранява отдалечен код
const ortDir = 'node_modules/@huggingface/transformers/dist';
mkdirSync(`${dist}/wasm`, { recursive: true });
let copied = 0;
for (const file of readdirSync(ortDir)) {
  if (/^ort-.*\.(wasm|mjs)$/.test(file)) {
    copyFileSync(path.join(ortDir, file), path.join(dist, 'wasm', file));
    copied++;
  }
}
if (copied === 0) {
  throw new Error(
    `Не намерих ort-*.wasm в ${ortDir} — провери версията на @huggingface/transformers`,
  );
}
console.log(`WASM файлове в пакета: ${copied}`);
console.log('Готово → dist/ (chrome://extensions → Load unpacked)');
