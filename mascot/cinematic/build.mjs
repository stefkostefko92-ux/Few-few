// Bundles src/ into one self-contained page, dist/mascot-cinematic.html.
// three.js is not bundled: the page loads the exact pinned version through its import map.
import { build } from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const result = await build({
  entryPoints: ['src/main.js'],
  bundle: true,
  format: 'esm',
  write: false,
  external: ['three', 'three/addons/*'],
  target: 'es2020',
  legalComments: 'none',
});
const js = result.outputFiles[0].text;
if (js.includes('</script')) throw new Error('Bundle contains a closing script tag');
const html = readFileSync('template.html', 'utf8').replace('/*BUNDLE*/', () => js);
mkdirSync('dist', { recursive: true });
writeFileSync('dist/mascot-cinematic.html', html);
process.stdout.write(`dist/mascot-cinematic.html ${(html.length / 1024).toFixed(1)} KiB\n`);
