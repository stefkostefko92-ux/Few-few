// Déjà — build: esbuild бъндъл + статични файлове + ONNX WASM в пакета.
// Изход: dist/ (Chrome) или dist-firefox/ (--firefox) — Load unpacked/Temporary Add-on.
// Firefox: няма offscreen — embedding двигателят влиза в background event page-а
// през firefox/embed-adapter.js (виж firefox/README.md).

import * as esbuild from 'esbuild';
import { copyFileSync, cpSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';

const FIREFOX = process.argv.includes('--firefox');
const dist = FIREFOX ? 'dist-firefox' : 'dist';
rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

const common = {
  bundle: true,
  minify: true,
  target: FIREFOX ? 'firefox128' : 'chrome116',
  logLevel: 'info',
};
// Firefox: chrome.* е callback-стил — сочим към promise-базирания browser.*
const ffBanner = FIREFOX
  ? { js: "if(typeof globalThis.browser!=='undefined'){globalThis.chrome=globalThis.browser;}" }
  : undefined;

// extension страници — ES модули (и в двата браузъра)
const pageEntries = {
  search: 'src/search/search.js',
  popup: 'src/popup/popup.js',
  options: 'src/options/options.js',
  welcome: 'src/welcome/welcome.js',
  memory: 'src/memory/memory.js',
};
if (!FIREFOX) {
  pageEntries.background = 'src/background.js';
  pageEntries.offscreen = 'src/offscreen/offscreen.js';
}
await esbuild.build({
  ...common,
  entryPoints: pageEntries,
  format: 'esm',
  banner: ffBanner,
  outdir: dist,
});

// Firefox background: адаптерът се оценява ПРЕДИ background.js (shim-ове +
// loopback Port); класически IIFE — type:module за event page не е гарантиран.
if (FIREFOX) {
  await esbuild.build({
    ...common,
    format: 'iife',
    banner: ffBanner,
    stdin: {
      contents: "import '../firefox/embed-adapter.js';\nimport '../src/background.js';",
      resolveDir: 'src',
      loader: 'js',
    },
    outfile: `${dist}/background.js`,
  });
}

// content script-овете НЕ са модули — класически IIFE
await esbuild.build({
  ...common,
  entryPoints: { content: 'src/content.js' },
  format: 'iife',
  banner: ffBanner,
  outdir: dist,
});

// статични файлове; package.json е единственият източник на версията —
// щампова се в манифеста на build, за да няма drift между Chrome/Firefox
const { readFileSync, writeFileSync } = await import('node:fs');
const version = JSON.parse(readFileSync('package.json', 'utf8')).version;
const manifest = JSON.parse(
  readFileSync(FIREFOX ? 'firefox/manifest.firefox.json' : 'manifest.json', 'utf8'),
);
manifest.version = version;
writeFileSync(`${dist}/manifest.json`, JSON.stringify(manifest, null, 2));
if (!FIREFOX) copyFileSync('src/offscreen/offscreen.html', `${dist}/offscreen.html`);
// един източник за набора от страници — entryPoints и статиката не дрейфват
for (const page of Object.keys(pageEntries).filter(
  (p) => p !== 'background' && p !== 'offscreen',
)) {
  copyFileSync(`src/${page}/${page}.html`, `${dist}/${page}.html`);
  copyFileSync(`src/${page}/${page}.css`, `${dist}/${page}.css`);
}
cpSync('icons', `${dist}/icons`, { recursive: true });
cpSync('_locales', `${dist}/_locales`, { recursive: true });

// ONNX Runtime WASM — доставя се В пакета; магазините забраняват отдалечен код
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
console.log(
  FIREFOX
    ? 'Готово → dist-firefox/ (about:debugging → Load Temporary Add-on)'
    : 'Готово → dist/ (chrome://extensions → Load unpacked)',
);
