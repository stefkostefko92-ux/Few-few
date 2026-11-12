// Копира самохостваните шрифтове (IBM Plex Sans и IBM Plex Mono, SIL OFL 1.1) от @fontsource в
// public/fonts/ и пише public/fonts/fonts.css с @font-face по подмножество (unicode-range) — браузърът
// тегли само подмножествата, които страницата ползва. Без CDN: CSP е font-src 'self'.
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'public', 'fonts');
const SUBSETS = ['latin', 'latin-ext', 'cyrillic'];
const FAMILIES = [
  { pkg: 'ibm-plex-sans', family: 'IBM Plex Sans', weights: [400, 500, 600] },
  { pkg: 'ibm-plex-mono', family: 'IBM Plex Mono', weights: [400, 500] },
];

mkdirSync(out, { recursive: true });
const rules = [];
for (const { pkg, family, weights } of FAMILIES) {
  const base = join(root, 'node_modules', '@fontsource', pkg);
  // unicode.json е източникът на unicode-range за всяко подмножество.
  const ranges = JSON.parse(readFileSync(join(base, 'unicode.json'), 'utf8'));
  for (const weight of weights) {
    for (const subset of SUBSETS) {
      const range = ranges[subset];
      if (typeof range !== 'string') throw new Error(`няма unicode-range за ${pkg}/${subset}`);
      const file = `${pkg}-${subset}-${weight}-normal.woff2`;
      copyFileSync(join(base, 'files', file), join(out, file));
      rules.push(
        `@font-face{font-family:'${family}';font-style:normal;font-weight:${weight};font-display:swap;` +
          `src:url(./${file}) format('woff2');unicode-range:${range.trim()}}`,
      );
    }
  }
  copyFileSync(join(base, 'LICENSE'), join(out, `${pkg}-OFL.txt`));
}
writeFileSync(join(out, 'fonts.css'), `${rules.join('\n')}\n`);
console.log(`fonts: ${rules.length} лица → public/fonts/`);
