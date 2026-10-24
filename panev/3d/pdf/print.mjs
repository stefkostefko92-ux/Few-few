// Prints dist/pdf/sheets.html to dist/pdf/gen.pdf in Chromium. The page background is transparent,
// so each sheet can be laid over a catalogue page; the renders stay JPEG inside the PDF.
import { chromium } from 'playwright';
import path from 'node:path';

const OUT = path.resolve(import.meta.dirname, '..', 'dist', 'pdf');
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const cdp = await page.context().newCDPSession(page);
  await page.goto(`file://${OUT}/sheets.html`);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0));
  const inter = await page.evaluate(() => document.fonts.check('700 10pt Inter') && [...document.fonts].some((f) => f.status === 'loaded'));
  if (!inter) throw new Error('Inter did not load (panev/fonts/Inter-var-*.woff2)');
  await cdp.send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
  await page.pdf({ path: path.join(OUT, 'gen.pdf'), printBackground: true, preferCSSPageSize: true });
} finally {
  await browser.close();
}
