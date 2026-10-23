// Bundles src/ together with three.js (the exact version pinned in package.json) into
// dist/staffe-3d.js and writes dist/staffe-3d.html around it; the baked textures live in
// dist/tex/. Everything is self-hosted: the page makes no third-party requests, like the rest of
// the cookie- and tracker-free Panev site. three.js licence notices are kept at the end of the file.
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

// Bare 'three' (imported by the addons) is the WebGPU build, as in three.js's own import maps, so
// the page carries a single copy of the core.
const threeIsWebGPU = {
  name: 'three-is-webgpu',
  setup(b) {
    b.onResolve({ filter: /^three$/ }, () => ({ path: path.resolve('node_modules/three/build/three.webgpu.js') }));
  },
};

const result = await build({
  entryPoints: ['src/app.js'],
  bundle: true,
  format: 'esm',
  minify: true,
  write: false,
  target: 'es2022',
  legalComments: 'eof',
  plugins: [threeIsWebGPU],
  outfile: 'dist/staffe-3d.js',
});
const js = result.outputFiles[0].contents;
const version = createHash('sha256').update(js).digest('hex').slice(0, 10);
const tpl = readFileSync('template.html', 'utf8');
if (!tpl.includes('%BUNDLE%')) throw new Error('template.html: the %BUNDLE% script source is missing');
mkdirSync('dist', { recursive: true });
writeFileSync('dist/staffe-3d.js', js);
writeFileSync('dist/staffe-3d.html', tpl.replace('%BUNDLE%', `staffe-3d.js?v=${version}`));
process.stdout.write(`dist/staffe-3d.html + staffe-3d.js ${(js.length / 1024).toFixed(0)} KiB\n`);
