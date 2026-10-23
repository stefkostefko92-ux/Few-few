// Copies the self-hosted fonts (Fira Sans + Fira Sans Condensed, SIL OFL 1.1) from @fontsource into
// public/fonts/ and writes public/fonts/fonts.css with per-subset @font-face rules (unicode-range), so
// the browser downloads only the subsets a page uses. No CDN: CSP is font-src 'self'.
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'public', 'fonts');
const SUBSETS = ['latin', 'latin-ext', 'cyrillic'];
const FAMILIES = [
  { pkg: 'fira-sans', family: 'Fira Sans', weights: [400, 500, 600, 700] },
  { pkg: 'fira-sans-condensed', family: 'Fira Sans Condensed', weights: [500, 600] },
];

mkdirSync(out, { recursive: true });
const rules = [];
for (const { pkg, family, weights } of FAMILIES) {
  const base = join(root, 'node_modules', '@fontsource', pkg);
  // unicode.json is the package's source of truth for each subset's unicode-range.
  const ranges = JSON.parse(readFileSync(join(base, 'unicode.json'), 'utf8'));
  for (const weight of weights) {
    for (const subset of SUBSETS) {
      const range = ranges[subset];
      if (typeof range !== 'string') throw new Error(`no unicode-range for ${pkg}/${subset}`);
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
// The sketch pad in the PDF (src/schede/pdf-schizzi.ts): the same face as WOFF — pdfkit's fontkit
// breaks composite glyphs of WOFF2 ("i", ":", accented letters).
const PDF_FACE = 'fira-sans-latin-500-normal.woff';
copyFileSync(
  join(root, 'node_modules', '@fontsource', 'fira-sans', 'files', PDF_FACE),
  join(out, PDF_FACE),
);
writeFileSync(join(out, 'fonts.css'), `${rules.join('\n')}\n`);
console.log(`fonts: ${rules.length} faces → public/fonts/`);
