// Batch stills through the page's photo mode in Chromium, written as PNG + WebP.
//   node scripts/render.mjs [--codes=A-65-170-7,SU-220-160] [--mode=assembly] [--adjust=<value>]
//     [--size=1600x1200] [--frames=32] [--out=dist/renders] [--png=<dir>] [--hand=DX] [--look=studio]
//     [--webgl]
// Parts are named by their id; assemblies "<first>+<second>" (A before B, support before SG), and
// without --codes every catalogue pairing is rendered once.
// WebGPU needs a display (xvfb-run -a); without one the WebGL 2 backend renders the same image.
import { chromium } from 'playwright';
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { serveDist, localOnly, CHROMIUM_ARGS, ROOT } from './serve.mjs';
import { CATALOG } from '../src/catalog.js';
import { partnerOf } from '../src/render/assembly.js';

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? true]));
const [W, H] = String(args.size || '1600x1200').split('x').map(Number);
const frames = Number(args.frames || 32);
const out = path.resolve(ROOT, args.out || 'dist/renders');
const pngOut = path.resolve(ROOT, args.png || args.out || 'dist/renders');
const assembly = args.mode === 'assembly';
const webgl = Boolean(args.webgl) || !process.env.DISPLAY;
mkdirSync(out, { recursive: true });
mkdirSync(pngOut, { recursive: true });

// Assembly name and the unique catalogue pairings.
const pairName = (item) => {
  const p = partnerOf(item);
  const [a, b] = item.family === 'SG' || item.code.startsWith('B') ? [p, item] : [item, p];
  return `${a.id}+${b.id}`;
};
function jobs() {
  if (args.codes) return String(args.codes).split(',');
  if (!assembly) return CATALOG.map((i) => i.id);
  const seen = new Set();
  return CATALOG.filter((i) => partnerOf(i) && !seen.has(pairName(i)) && seen.add(pairName(i))).map((i) => i.id);
}

const PORT = Number(process.env.RENDER_PORT || 8127);
const server = serveDist(PORT);
const browser = await chromium.launch({ headless: !process.env.DISPLAY, args: CHROMIUM_ARGS });
const problems = [];
try {
  // A small live view: the stills render at their own size and the idle view costs little.
  const page = await browser.newPage({ viewport: { width: 480, height: 360 } });
  page.on('pageerror', (e) => problems.push(`page error: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`console: ${m.text()}`);
  });
  await localOnly(page, (url) => problems.push(`third-party request: ${url}`));
  await page.goto(`http://localhost:${PORT}/staffe-3d.html?lang=it${webgl ? '&webgl' : ''}`);
  await page.waitForFunction(() => document.documentElement.dataset.ready, null, { timeout: 300000 });
  if (await page.evaluate(() => document.documentElement.dataset.ready !== '1')) throw new Error(await page.textContent('#fatal'));
  const backend = await page.evaluate(() => window.panev3d.backend);
  process.stdout.write(`backend ${backend}, ${W}x${H}, ${frames} frames\n`);
  if (args.look) await page.evaluate((l) => window.panev3d.setLook(l), String(args.look));
  for (const code of jobs()) {
    const t0 = Date.now();
    const item = CATALOG.find((i) => i.id === code || i.code === code);
    if (!item) throw new Error(`unknown code ${code}`);
    if (assembly && !partnerOf(item)) throw new Error(`${code} has no catalogue pairing`);
    const shot = await page.evaluate(
      async ([c, hand, mode, adjust, w, h, f]) => {
        const api = window.panev3d;
        api.show(c, { hand, mode });
        if (adjust !== null) api.adjust(adjust);
        const r = await api.photo({ width: w, height: h, frames: f });
        return { width: r.width, height: r.height, data: Array.from(r.pixels) };
      },
      [item.id, String(args.hand || 'DX'), assembly ? 'assembly' : 'part', args.adjust === undefined ? null : Number(args.adjust), W, H, frames],
    );
    let img = sharp(Buffer.from(shot.data), { raw: { width: shot.width, height: shot.height, channels: 4 } });
    if (backend !== 'WebGPU') img = img.flip();
    const hand = args.hand === 'SX' ? '-SX' : '';
    const name = `${assembly ? pairName(item) : item.id}${hand}`;
    await img.clone().removeAlpha().png({ compressionLevel: 9 }).toFile(path.join(pngOut, `${name}.png`));
    await img.clone().removeAlpha().webp({ quality: 88, effort: 6 }).toFile(path.join(out, `${name}.webp`));
    process.stdout.write(`${name} ${((Date.now() - t0) / 1000).toFixed(1)} s\n`);
  }
} finally {
  await browser.close();
  server.close();
}
if (problems.length) {
  process.stderr.write(`${problems.map((p) => `✘ ${p}`).join('\n')}\n`);
  process.exit(1);
}
