// An adjustment sequence of one catalogue assembly, for the site's "regola tu" view: the camera is
// framed once on the assembly at rest and kept, so only the adjustment moves between frames.
//   node scripts/frames.mjs --code=A-65-170-7 --from=-8 --to=8 --steps=9 [--size=1200x900]
//     [--frames=24] [--zoom=1] [--hand=DX] [--out=../img/regola] [--name=porta]
// Writes <name>-NN.webp (NN from 00) and <name>.json ({ values, width, height }) for the template.
// WebGPU needs a display (xvfb-run -a); without one the WebGL 2 backend renders the same image.
import { chromium } from 'playwright';
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { serveDist, localOnly, CHROMIUM_ARGS, ROOT } from './serve.mjs';
import { CATALOG } from '../src/catalog.js';

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? true]));
const item = CATALOG.find((i) => i.id === args.code || i.code === args.code);
if (!item) throw new Error(`unknown code ${args.code}`);
const [W, H] = String(args.size || '1200x900').split('x').map(Number);
const from = Number(args.from);
const to = Number(args.to);
const steps = Number(args.steps || 9);
if (!Number.isFinite(from) || !Number.isFinite(to) || steps < 2) throw new Error('--from, --to and --steps (≥ 2) are required');
const values = Array.from({ length: steps }, (_, k) => Math.round((from + ((to - from) * k) / (steps - 1)) * 10) / 10);
const out = path.resolve(ROOT, args.out || '../img/regola');
const name = String(args.name || item.id.toLowerCase());
const webgl = Boolean(args.webgl) || !process.env.DISPLAY;
mkdirSync(out, { recursive: true });

const PORT = Number(process.env.RENDER_PORT || 8128);
const server = serveDist(PORT);
const browser = await chromium.launch({ headless: !process.env.DISPLAY, args: CHROMIUM_ARGS, ...(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}) });
const problems = [];
try {
  // The live view has the stills' aspect, so keeping its camera keeps the composition.
  const page = await browser.newPage({ viewport: { width: 480, height: Math.round((480 * H) / W) } });
  page.on('pageerror', (e) => problems.push(`page error: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`console: ${m.text()}`);
  });
  await localOnly(page, (url) => problems.push(`third-party request: ${url}`));
  await page.goto(`http://localhost:${PORT}/staffe-3d.html?lang=it${webgl ? '&webgl' : ''}`);
  await page.waitForFunction(() => document.documentElement.dataset.ready, null, { timeout: 300000 });
  if (await page.evaluate(() => document.documentElement.dataset.ready !== '1')) throw new Error(await page.textContent('#fatal'));
  // --zoom < 1 brings the camera closer to the target than the live framing (the stills keep it).
  const range = await page.evaluate(([c, hand, zoom]) => {
    const api = window.panev3d;
    api.show(c, { hand, mode: 'assembly' });
    const { camera, controls } = api;
    camera.position.sub(controls.target).multiplyScalar(zoom).add(controls.target);
    controls.update();
    return api.state.asm ? api.state.asm.range : null;
  }, [item.id, String(args.hand || 'DX'), Number(args.zoom || 1)]);
  if (!range) throw new Error(`${item.id} has no adjustable assembly`);
  if (from < range[0] || to > range[1]) throw new Error(`${item.id}: range is ${range.join('…')}, asked ${from}…${to}`);
  for (const [k, v] of values.entries()) {
    const t0 = Date.now();
    const shot = await page.evaluate(
      async ([value, w, h, f]) => {
        const api = window.panev3d;
        api.adjust(value);
        const r = await api.photo({ width: w, height: h, frames: f, reframe: false });
        return { width: r.width, height: r.height, data: Array.from(r.pixels) };
      },
      [v, W, H, Number(args.frames || 24)],
    );
    let img = sharp(Buffer.from(shot.data), { raw: { width: shot.width, height: shot.height, channels: 4 } }).removeAlpha();
    if (!(await page.evaluate(() => window.panev3d.backend === 'WebGPU'))) img = img.flip();
    const file = `${name}-${String(k).padStart(2, '0')}.webp`;
    await img.webp({ quality: 84, effort: 6 }).toFile(path.join(out, file));
    process.stdout.write(`${file} ${v} ${((Date.now() - t0) / 1000).toFixed(1)} s\n`);
  }
  writeFileSync(path.join(out, `${name}.json`), `${JSON.stringify({ code: item.code, values, width: W, height: H }, null, 1)}\n`);
} finally {
  await browser.close();
  server.close();
}
if (problems.length) {
  process.stderr.write(`${problems.map((p) => `✘ ${p}`).join('\n')}\n`);
  process.exit(1);
}
