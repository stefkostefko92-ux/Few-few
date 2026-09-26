// Smoke test in Chromium: serves dist/, boots the page on WebGPU (with a display: xvfb-run -a npm run
// smoke) and on the WebGL 2 fallback (?webgl), fails on any page error or third-party request,
// checks the interface, builds every catalogue part and takes stills of a part and of both kinds of
// assembly, which must show a lit part on the backdrop.
// Everything renders in software (SwiftShader); timings here say nothing about real frame rates.
import { chromium } from 'playwright';
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { serveDist, localOnly, CHROMIUM_ARGS, ROOT } from './serve.mjs';
import { CATALOG } from '../src/catalog.js';

const PORT = Number(process.env.SMOKE_PORT || 8126);
const out = path.join(ROOT, 'dist', 'smoke');
mkdirSync(out, { recursive: true });
const headed = Boolean(process.env.DISPLAY);
const backends = headed ? [['webgpu', ''], ['webgl2', '&webgl']] : [['webgl2', '&webgl']];
if (!headed) process.stdout.write('No display: WebGPU cannot present headless, testing the WebGL 2 fallback only (xvfb-run -a for both)\n');

// A still must hold a part: pixels in the middle that clearly differ from the backdrop corners.
async function checkStill(shot, flip, file) {
  let img = sharp(Buffer.from(shot.pixels), { raw: { width: shot.width, height: shot.height, channels: 4 } });
  if (flip) img = img.flip();
  await img.clone().removeAlpha().png().toFile(file);
  const { data, info } = await img.removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const at = (x, y) => {
    const i = (y * info.width + x) * 3;
    return [data[i], data[i + 1], data[i + 2]];
  };
  const bg = at(2, 2);
  let differ = 0;
  let total = 0;
  for (let y = Math.floor(info.height * 0.3); y < info.height * 0.7; y += 2) {
    for (let x = Math.floor(info.width * 0.3); x < info.width * 0.7; x += 2) {
      const c = at(x, y);
      total++;
      if (Math.abs(c[0] - bg[0]) + Math.abs(c[1] - bg[1]) + Math.abs(c[2] - bg[2]) > 30) differ++;
    }
  }
  return differ / total;
}

const server = serveDist(PORT);
const browser = await chromium.launch({ headless: !headed, args: CHROMIUM_ARGS });
const problems = [];
try {
  for (const [name, query] of backends) {
    const page = await browser.newPage({ viewport: { width: 960, height: 640 } });
    page.on('pageerror', (e) => problems.push(`${name}: page error: ${e.message}`));
    page.on('console', (m) => {
      if (m.type() === 'error') problems.push(`${name}: console error: ${m.text()}`);
    });
    await localOnly(page, (url) => problems.push(`${name}: third-party request: ${url}`));
    const res = await page.goto(`http://localhost:${PORT}/staffe-3d.html?lang=it${query}`);
    if (!res || res.status() !== 200) problems.push(`${name}: page responded ${res && res.status()}`);
    await page.waitForFunction(() => document.documentElement.dataset.ready, null, { timeout: 420000 });
    if (await page.evaluate(() => document.documentElement.dataset.ready !== '1')) {
      problems.push(`${name}: boot failed: ${await page.textContent('#fatal')}`);
      await page.close();
      continue;
    }
    const ui = await page.evaluate(() => ({
      backend: window.panev3d.backend,
      codes: document.querySelectorAll('#list button').length,
      title: document.getElementById('title').textContent,
      credit: Boolean(document.querySelector('footer a[href="https://carbonstealth.eu"][target="_blank"][rel="noopener"]')),
    }));
    if (ui.codes !== CATALOG.length) problems.push(`${name}: the list shows ${ui.codes} codes, the catalogue has ${CATALOG.length}`);
    if (!ui.credit) problems.push(`${name}: the Carbon Stealth VCC credit link is missing`);
    const built = await page.evaluate((ids) => ids.filter((id) => window.panev3d.show(id).item.id !== id), CATALOG.map((i) => i.id));
    if (built.length) problems.push(`${name}: could not show ${built.join(', ')}`);
    process.stdout.write(`${name}: ${ui.backend}, "${ui.title}", ${ui.codes} codes in the list, all parts built\n`);

    for (const [id, opts, adjust] of [['A-65-170-7', { mode: 'part' }], ['B-65-320', { mode: 'assembly', hand: 'SX' }, 6], ['SU-220-160', { mode: 'assembly' }, 90]]) {
      const shot = await page.evaluate(
        async ([i, o, a]) => {
          const api = window.panev3d;
          api.show(i, o);
          if (a !== undefined) api.adjust(a);
          const r = await api.photo({ width: 320, height: 240, frames: 16 });
          return { width: r.width, height: r.height, pixels: Array.from(r.pixels), asm: Boolean(api.state.asm) };
        },
        [id, opts, adjust],
      );
      if (opts.mode === 'assembly' && !shot.asm) problems.push(`${name}: ${id} has no assembly`);
      const cover = await checkStill(shot, ui.backend !== 'WebGPU', path.join(out, `${name}-${id}-${opts.mode}.png`));
      if (cover < 0.04) problems.push(`${name}: ${id} ${opts.mode} still looks empty (${(cover * 100).toFixed(1)} % of the middle differs from the backdrop)`);
      process.stdout.write(`${name}: ${id} ${opts.mode} still, ${(cover * 100).toFixed(0)} % of the middle is part\n`);
    }
    await page.close();
  }
} finally {
  await browser.close();
  server.close();
}
if (problems.length) {
  process.stderr.write(`${problems.map((p) => `✘ ${p}`).join('\n')}\n`);
  process.exit(1);
}
process.stdout.write(`✓ smoke: ${backends.map(([n]) => n).join(' + ')} boot, interface, ${CATALOG.length} parts, stills — stills in dist/smoke/\n`);
