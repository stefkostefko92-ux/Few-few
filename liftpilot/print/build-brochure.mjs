// The A5 brochure (print/brochure.html) as two PDFs, printed by Chromium: the print shop's with 3 mm bleed on every side
// (154 × 216 mm, TrimBox at 3 mm from each edge) and the e-mail one cut to A5 (148 × 210 mm). Fonts and drawings are
// embedded as vectors; boxes.py sets the exact page boxes. Playwright is not in package.json: a local or global install,
// found as the smoke finds it; PyMuPDF as for the landing's documents.
// Run from liftpilot/: node print/build-brochure.mjs
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadPlaywright } from '../scripts/smoke-kit.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = pathToFileURL(path.join(here, 'brochure.html')).href;
const A5 = { w: 148, h: 210 };
const OUTPUTS = [
  { file: 'LiftPilot-brochure-A5-stampa.pdf', bleed: 3 },
  { file: 'LiftPilot-brochure-A5.pdf', bleed: 0 },
];

async function main() {
  const browser = await loadPlaywright().chromium.launch();
  try {
    for (const { file, bleed } of OUTPUTS) {
      const page = await browser.newPage();
      await page.goto(source, { waitUntil: 'load' });
      const w = A5.w + 2 * bleed, h = A5.h + 2 * bleed, out = path.join(here, file);
      await page.addStyleTag({ content: `@page { margin: 0; } :root { --bleed: ${bleed}mm; }` });
      await page.evaluate(async () => {
        await globalThis.document.fonts.ready;
        await Promise.all([...globalThis.document.images].map((img) => img.decode()));
      });
      // content taller than its sheet would be cut off at the bottom: stop instead
      const overflow = await page.evaluate(() => [...globalThis.document.querySelectorAll('.safe')].some((s) => s.scrollHeight > s.clientHeight + 1));
      if (overflow) throw new Error(`${file}: the content does not fit the page`);
      // Chromium rounds the size up to a hundredth of an inch; boxes.py cuts it to the millimetre
      await page.pdf({ path: out, width: `${w}mm`, height: `${h}mm`, margin: { top: 0, right: 0, bottom: 0, left: 0 }, printBackground: true });
      await page.close();
      execFileSync('python3', ['-I', path.join(here, 'boxes.py'), out, String(w), String(h), String(bleed)], { stdio: 'inherit' });
      console.log(`${file} · ${w} × ${h} mm${bleed ? ` · TrimBox ${A5.w} × ${A5.h} mm` : ''}`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
