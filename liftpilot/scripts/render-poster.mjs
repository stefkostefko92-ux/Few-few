// Renders the still of the 3D machine stage into public/img/argano-machine-{800,1200,1800}.webp: the picture shown
// before (and instead of) the live stage, with reduced motion, without WebGL or while three.js loads. Run it after
// changing src/components/machine/, so the picture and the first live frame stay the same.
// Usage: BASE_URL=http://localhost:3100 node scripts/render-poster.mjs   (a running LiftPilot; Playwright; sharp comes with Next.js)
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
function load(name) {
  try {
    return require(name);
  } catch {
    return require(`${execSync('npm root -g').toString().trim()}/${name}`);
  }
}
const { chromium } = load('playwright');
const sharp = load('sharp');

const BASE = (process.env.BASE_URL ?? 'http://localhost:3100').replace(/\/+$/, '');
const OUT = fileURLToPath(new URL('../public/img/', import.meta.url));
const WIDTHS = [800, 1200, 1800];

const browser = await chromium.launch();
try {
  // 1440 px wide page: the stage is about 740 px; at 2.5x the drawing buffer is wider than the largest picture.
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2.5, reducedMotion: 'no-preference' });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => { globalThis.__arganoStill = true; }); // runs in the page: window
  await page.goto(`${BASE}/it`, { waitUntil: 'networkidle' });
  await page.waitForSelector('canvas[data-still="ready"]', { timeout: 15 * 60 * 1000 });
  await page.waitForTimeout(1500); // the poster fades out
  await page.addStyleTag({ content: '.stage-frame { border-radius: 0 !important; box-shadow: none !important; }' }); // square picture: the page rounds it
  if (errors.length) throw new Error(`page errors: ${errors.join('; ')}`);
  const png = await page.locator('.stage-frame').screenshot({ type: 'png', timeout: 120000 });
  const { width = 0, height = 0 } = await sharp(png).metadata();
  // the frame is 4:3; trim a possible pixel of rounding before scaling
  const h = Math.round((width * 3) / 4);
  const base = sharp(png).extract({ left: 0, top: Math.max(0, Math.floor((height - h) / 2)), width, height: Math.min(h, height) });
  for (const w of WIDTHS) {
    await base.clone().resize(w, Math.round((w * 3) / 4)).webp({ quality: 82, effort: 6 }).toFile(`${OUT}argano-machine-${w}.webp`);
    process.stdout.write(`▸ public/img/argano-machine-${w}.webp\n`);
  }
} finally {
  await browser.close();
}
