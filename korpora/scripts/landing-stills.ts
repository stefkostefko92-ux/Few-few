// Renders the four stills of the landing page's story (public/img/story/step-<n>-<width>.webp): the live scene of
// landing/story.js at four moments, in a 4:5 frame (the stage's own shape: on a desktop it runs 0.79–0.87 from 1366 to
// 2560 px wide, on a phone about 0.8), once its image has settled. The page shows them before the live
// scene starts (the first is its largest paint) and instead of it when motion is reduced, WebGL is missing or the
// device is too slow. Run after changing the engine, the viewer or the story, with the server running:
//   npm run story:stills                       (KORPORA_URL, default http://127.0.0.1:4320)
//   npm run story:stills -- 3 4                only these steps (each moment is drawn on its own)
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Page } from 'playwright';
import { ROOT } from '../src/paths.js';

const base = (process.env.KORPORA_URL ?? 'http://127.0.0.1:4320').replace(/\/+$/, '');
// t of landing/timeline.js: the kitchen, exploded, all parts on their sheets, sheet 1 cut by the router
const MOMENTS = [-1, 1.4, 2.62, 3.5];
const ONLY = process.argv
  .slice(2)
  .map(Number)
  .filter((n) => n >= 1 && n <= MOMENTS.length);
const FRAME = { width: 1120, height: 1400 };
const WIDTHS = [1120, 640];
const OUT = join(ROOT, 'public', 'img', 'story');

// PNG from the screenshot → WebP in the browser (no image library on the server side). The page code is a string, as
// in og-image.ts: the scripts are typed for Node, without the DOM.
async function webp(page: Page, png: Buffer, width: number): Promise<Buffer> {
  const b64 = await page.evaluate(`(async () => {
    const img = new Image();
    img.src = 'data:image/png;base64,${png.toString('base64')}';
    await img.decode();
    const c = document.createElement('canvas');
    c.width = ${width};
    c.height = Math.round((img.height * ${width}) / img.width);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/webp', 0.84).split(',')[1];
  })()`);
  return Buffer.from(String(b64), 'base64');
}

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
try {
  const page = await browser.newPage({
    viewport: FRAME,
    deviceScaleFactor: 1,
    reducedMotion: 'no-preference',
    bypassCSP: true,
  });
  await page.addInitScript('window.__korporaStills = true;');
  await page.goto(`${base}/`, { waitUntil: 'networkidle' });
  // the stage alone, filling the frame, without the read-out and the old stills
  await page.addStyleTag({
    content:
      '.stage-frame{position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;margin:0!important;border-radius:0!important;z-index:99}.stage-hud,.still{display:none!important}',
  });
  await page.evaluate('window.korporaStory.start()');
  await page.waitForFunction("'still' in (window.korporaStory ?? {})", null, { timeout: 180_000 });
  for (const [i, t] of MOMENTS.entries()) {
    if (ONLY.length && !ONLY.includes(i + 1)) continue;
    await page.evaluate(`window.korporaStory.set(${t})`);
    await page.evaluate('window.korporaStory.still()');
    // the stage fills the viewport; an element screenshot would wait for a still frame the software GL rarely gives
    const png = await page.screenshot({ timeout: 120_000 });
    for (const width of WIDTHS) {
      const file = join(OUT, `step-${i + 1}-${width}.webp`);
      writeFileSync(file, await webp(page, png, width));
      process.stdout.write(`${file}\n`);
    }
  }
} finally {
  await browser.close();
}
