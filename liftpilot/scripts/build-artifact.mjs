// Builds the standalone page of the two tools (artifact/main.tsx) into one folder that a static host or a claude.ai
// Artifact serves as is: index.html, app.css with the site's fonts (Manrope, DM Mono, IBM Plex Mono for Cyrillic),
// app.js and its lazy chunks (3D, CAD reader).
// Usage, from liftpilot/: npm run artifact [-- outdir]   (default artifact/dist)
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const out = path.resolve(root, process.argv[2] ?? 'artifact/dist');
rmSync(out, { recursive: true, force: true });
mkdirSync(path.join(out, 'fonts'), { recursive: true });
mkdirSync(path.join(out, 'img'), { recursive: true });

// styles: the app's own (Tailwind over the app and this page), then the page's; fonts beside them
const css = path.join(out, 'app.css');
execFileSync(path.join(root, 'node_modules/.bin/tailwindcss'), ['-i', 'src/app/globals.css', '-o', css, '--minify',
  '--content', './src/**/*.{ts,tsx},./artifact/**/*.tsx'], { cwd: root, stdio: 'inherit' });
const styles = readFileSync(css, 'utf8').replaceAll('url(/fonts/', 'url(fonts/').replaceAll('url("/fonts/', 'url("fonts/')
  .replaceAll('url(/icons/', 'url(icons/').replaceAll('url("/icons/', 'url("icons/');
// the painted icons the styles use (the select's arrow) beside them
mkdirSync(path.join(out, 'icons'), { recursive: true });
for (const [, f] of styles.matchAll(/url\("?icons\/([a-z0-9-]+\.webp)/g)) copyFileSync(path.join(root, 'public/icons', f), path.join(out, 'icons', f));
// declared UTF-8: a static host that sends no charset would read the "−" of the open sections as Windows-1252
writeFileSync(css, `@charset "UTF-8";\n${styles.replace(/^@charset "UTF-8";\s*/i, '')}\n${readFileSync(path.join(root, 'artifact/artifact.css'), 'utf8')}`);
for (const f of readdirSync(path.join(root, 'public/fonts'))) if (f.endsWith('.woff2') || /^OFL.*\.txt$/.test(f)) copyFileSync(path.join(root, 'public/fonts', f), path.join(out, 'fonts', f));
// the logo's sizes (src/lib/brand.ts) beside the page
for (const f of readdirSync(path.join(root, 'public/img'))) if (/^liftpilot-(logo|lockup|emblem)-\d+\.webp$/.test(f)) copyFileSync(path.join(root, 'public/img', f), path.join(out, 'img', f));

// script: the app's components and engines; next-intl, the routing and the server actions replaced by page shims
const shim = (f) => path.join(root, 'artifact/shims', f);
await build({
  entryPoints: [path.join(root, 'artifact/main.tsx')], outdir: out, entryNames: 'app', chunkNames: 'chunks/[name]-[hash]',
  bundle: true, splitting: true, format: 'esm', platform: 'browser', target: 'es2022', minify: true, keepNames: true,
  jsx: 'automatic', legalComments: 'none', logLevel: 'warning', tsconfig: path.join(root, 'tsconfig.json'),
  define: { 'process.env.NODE_ENV': '"production"' },
  alias: {
    'next-intl': shim('next-intl.ts'), '@/i18n/routing': shim('routing.tsx'), 'server-only': shim('empty.ts'),
    '@/server/calc-actions': shim('actions.ts'), '@/server/lift-actions': shim('actions.ts'), '@/server/draft-actions': shim('actions.ts'),
  },
});

writeFileSync(path.join(out, 'index.html'), `<title>LiftPilot</title>
<meta name="description" content="Scelta e verifica dell’argano geared e progetto dell’ascensore con simulazione 3D e tavole, nel browser.">
<meta name="keywords" content="Carbon Stealth, LiftPilot, argano geared, sostituzione argano, verifica aderenza, simulazione 3D ascensore, UNI EN 81-20, UNI EN 81-50">
<link rel="stylesheet" href="app.css">
<div id="liftpilot"></div>
<noscript><p style="padding:16px">LiftPilot richiede JavaScript.</p></noscript>
<script type="module" src="app.js"></script>
`);
console.log(`artifact built in ${path.relative(root, out)}`);
