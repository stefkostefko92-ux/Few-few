// Снимките на семената за Discord: всеки вид × всяка степен на здраве → assets/seeds/<вид>-<степен>.jpg.
// Същият 3D код като дашборда (client/seeds3d.ts), нарисуван в Chromium през Playwright. Пуска се при
// промяна на вида на семената (`npm run render:seeds`); снимките се комитват — ботът само ги прикачва.
// Playwright не е зависимост на продукта: ползва се инсталираният в средата (NODE_PATH) или `npx`.
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { HEALTH_LEGEND } from '../src/domain/health.js';
import { SEED_KEYS } from '../src/domain/seeds.js';

const W = 640;
const H = 400;
// Три семена плътно едно до друго — кадърът е за вида, не за броя.
const CARD_LAYOUT = [
  { x: -0.62, z: -0.2, yaw: 0.5, tilt: 0.05 },
  { x: 0.6, z: -0.32, yaw: 2.4, tilt: -0.08 },
  { x: 0.02, z: 0.42, yaw: -0.3, tilt: 0.02 },
];
const root = fileURLToPath(new URL('..', import.meta.url));
const out = join(root, 'assets', 'seeds');
mkdirSync(out, { recursive: true });

const bundle = await build({
  entryPoints: [join(root, 'client', 'render-entry.ts')],
  bundle: true,
  format: 'iife',
  target: 'es2022',
  minify: true,
  write: false,
  logLevel: 'warning',
});
const code = bundle.outputFiles[0]?.text ?? '';

type Playwright = typeof import('playwright');
const { chromium } = createRequire(import.meta.url)('playwright') as Playwright;
const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => process.stderr.write(`грешка в страницата: ${String(e)}\n`));
await page.setContent(
  '<!doctype html><html><body style="margin:0;background:#0b0f0d"></body></html>',
);
await page.addScriptTag({ content: code });

let n = 0;
for (const type of SEED_KEYS) {
  for (const l of HEALTH_LEGEND) {
    const spec = { type, decay: l.decay, dead: l.dead, layout: CARD_LAYOUT, seed: 3 };
    const url = await page.evaluate(([s, w, h]) => window.semkiRender?.(s, w, h) ?? null, [
      spec,
      W,
      H,
    ] as const);
    if (!url) throw new Error(`не се нарисува ${type}-${l.stage} (няма WebGL?)`);
    writeFileSync(
      join(out, `${type}-${l.stage}.jpg`),
      Buffer.from(url.split(',')[1] ?? '', 'base64'),
    );
    n += 1;
  }
}
await browser.close();
process.stdout.write(`assets/seeds: ${n} снимки ${W}×${H}\n`);
