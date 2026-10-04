/**
 * Снимка на 3D изгледа за брошурата: влиза в работещ Rendetto, прави кухня с размерите по подразбиране
 * (същата като в останалите примери), снима сцената и изтрива проекта. Пуска се ръчно, когато 3D изгледът
 * се промени; резултатът е в print/assets/kitchen-3d.jpg и брошурата го вгражда.
 *
 *   RENDETTO_URL=http://127.0.0.1:4320 BROCHURE_EMAIL=… BROCHURE_PASSWORD=… \
 *     node --import tsx print/capture-3d.ts
 *
 * Акаунтът трябва да е с активен план и без двуфакторна защита (тестов акаунт, не на човек).
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { ROOT } from '../src/paths.js';

const base = (process.env.RENDETTO_URL ?? 'http://127.0.0.1:4320').replace(/\/+$/, '');
const email = process.env.BROCHURE_EMAIL ?? '';
const password = process.env.BROCHURE_PASSWORD ?? '';
/** Колко стъпки с колелцето приближават сцената, за да запълни кухнята кадъра. */
const ZOOM_STEPS = 4;
/** Изгледът се доизчиства, докато камерата стои; снимката се прави, когато два поредни кадъра съвпаднат. */
const SETTLE_MS = 12000;
const SETTLE_LIMIT_MS = 15 * 60 * 1000;

async function main(): Promise<void> {
  if (!email || !password) {
    process.stderr.write(
      'Задай BROCHURE_EMAIL и BROCHURE_PASSWORD (тестов акаунт с активен план).\n',
    );
    process.exitCode = 1;
    return;
  }
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: 1400, height: 1000 },
      deviceScaleFactor: 2,
    });
    // the first frames bake the decors on the GPU; on a software renderer that holds the page for minutes
    page.setDefaultTimeout(5 * 60 * 1000);
    page.on('dialog', (dialog) => void dialog.accept());
    await page.goto(`${base}/login?lang=bg`);
    await page.fill('#email', email);
    await page.fill('#password', password);
    await Promise.all([page.waitForURL(/\/app/), page.click('button[type=submit]')]);
    await page.selectOption('#type', 'kitchen');
    await page.fill('#pname', 'Брошура — 3D');
    await Promise.all([
      page.waitForURL(/\/app\/p\//),
      page.click('.newproj-form button[type=submit]'),
    ]);
    const id = /\/app\/p\/([a-z0-9]+)/.exec(page.url())?.[1];
    if (!id) throw new Error('не се вижда номерът на новия проект');
    const file = join(ROOT, 'print', 'assets', 'kitchen-3d.jpg');
    try {
      await page.waitForTimeout(2500);
      const stage = page.locator('.stage');
      const box = await stage.boundingBox();
      if (!box) throw new Error('няма 3D сцена на страницата');
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      for (let i = 0; i < ZOOM_STEPS; i++) {
        await page.mouse.wheel(0, -240);
        await page.waitForTimeout(200);
      }
      const clip = { x: box.x + 2, y: box.y + 2, width: box.width - 4, height: box.height - 4 };
      const started = Date.now();
      let last = await page.screenshot({ clip });
      for (;;) {
        await page.waitForTimeout(SETTLE_MS);
        const next = await page.screenshot({ clip });
        if (next.equals(last) || Date.now() - started > SETTLE_LIMIT_MS) break;
        last = next;
      }
      mkdirSync(join(ROOT, 'print', 'assets'), { recursive: true });
      await page.screenshot({
        path: file,
        type: 'jpeg',
        quality: 88,
        clip,
      });
    } finally {
      // the project goes away even when the capture fails — the test account does not pile up copies
      await page.goto(`${base}/app`);
      await page.click(`form[action="/app/p/${id}/delete"] button[type=submit]`);
      await page.waitForLoadState('networkidle');
    }
    process.stdout.write(`${file}\n`);
  } finally {
    await browser.close();
  }
}

await main();
