import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import {
  auditPage,
  byLabel,
  createCompany,
  DESKTOP,
  horizontalOverflow,
  MOBILE,
  PASSWORD,
  PROFILES,
  startApp,
  watch,
} from './support/app.js';
import type { E2eApp } from './support/app.js';

/**
 * Витрината, страницата за приложението (PWA) и основите на достъпността в истински Chromium: без грешки в
 * конзолата и без 4xx/5xx, без хоризонтален скрол, един H1, `lang`, имена на полетата, движение при
 * `prefers-reduced-motion`, клавиатура. Контрастът не се мери тук (няма axe без нова зависимост).
 */
let app: E2eApp;

before(async () => {
  app = await startApp();
});

after(async () => {
  await app.stop();
});

const PUBLIC_PAGES = [
  { path: '/', lang: 'bg' },
  { path: '/ceni', lang: 'bg' },
  { path: '/za-schetovoditeli', lang: 'bg' },
  { path: '/e-fakturi-2028', lang: 'bg' },
  { path: '/prilozhenie', lang: 'bg' },
  { path: '/vhod', lang: 'bg' },
  { path: '/registraciya', lang: 'bg' },
  { path: '/en/', lang: 'en' },
  { path: '/en/pricing', lang: 'en' },
] as const;

for (const profile of PROFILES) {
  test(`витрина и публични страници (${profile.name})`, async (t) => {
    const context = await app.context(profile);
    const page = await context.newPage();
    const watcher = watch(page);
    try {
      for (const { path, lang } of PUBLIC_PAGES) {
        await t.test(
          `${path}: без грешки, без скрол, един H1, lang=${lang}, имена на полетата`,
          async () => {
            const response = await page.goto(`${app.origin}${path}`);
            assert.equal(response?.status(), 200);
            await page.waitForLoadState('load');
            assert.ok((await horizontalOverflow(page)) <= 0, `хоризонтален скрол на ${path}`);
            const audit = await auditPage(page);
            assert.equal(audit.h1.length, 1, `един H1 на ${path}: ${JSON.stringify(audit.h1)}`);
            assert.ok(audit.h1[0], 'H1 не е празен');
            assert.equal(audit.lang, lang);
            assert.ok(audit.title.length > 0, 'заглавие на страницата');
            assert.deepEqual(audit.unnamedFields, [], 'полета без етикет');
            assert.deepEqual(audit.unnamedActions, [], 'връзки и бутони без име');
            assert.deepEqual(audit.imagesWithoutAlt, [], 'изображения без alt');
            assert.equal(audit.landmarks.main, 1, 'един main');
          },
        );
      }
      assert.deepEqual(watcher.problems(), [], 'конзола и мрежа на публичните страници');
    } finally {
      await context.close();
    }
  });
}

test('prefers-reduced-motion спира движението на витрината', async () => {
  const context = await app.context(DESKTOP);
  const page = await context.newPage();
  try {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    for (const path of ['/', '/ceni', '/prilozhenie', '/en/']) {
      await page.goto(`${app.origin}${path}`);
      await page.waitForLoadState('load');
      assert.equal((await auditPage(page)).runningAnimations, 0, `движение при reduce на ${path}`);
    }
  } finally {
    await context.close();
  }
});

test('приложението на началния екран (PWA): манифест, иконите, работник, без връзка', async (t) => {
  const context = await app.context(MOBILE);
  const page = await context.newPage();
  const watcher = watch(page);
  try {
    await t.test('/prilozhenie води потребителя по стъпки и към входа', async () => {
      await page.goto(`${app.origin}/prilozhenie`);
      await page.getByRole('heading', { level: 1, name: app.t('install.title') }).waitFor();
      await page.getByRole('link', { name: app.t('install.back'), exact: true }).click();
      await page.waitForURL(/\/vhod$/);
    });

    await t.test('манифестът е „standalone“ с икони, които се зареждат', async () => {
      const response = await page.goto(`${app.origin}/manifest.webmanifest`);
      assert.equal(response?.status(), 200);
      assert.match(response?.headers()['content-type'] ?? '', /manifest\+json/);
      const manifest = JSON.parse((await response?.text()) ?? '') as {
        display: string;
        lang: string;
        start_url: string;
        icons: Array<{ src: string; sizes: string; type?: string }>;
      };
      assert.equal(manifest.display, 'standalone');
      assert.match(manifest.lang, /^bg/);
      assert.ok(manifest.start_url.startsWith('/'));
      const sizes = manifest.icons.map((icon) => icon.sizes);
      assert.ok(
        sizes.includes('192x192') && sizes.includes('512x512'),
        `икони: ${sizes.join(', ')}`,
      );
      for (const icon of manifest.icons) {
        // С fetch, не с навигация: образът като документ получава вградени стилове, които CSP на сайта
        // (style-src-attr 'none') блокира — шум на Chromium, не дефект на иконата.
        const loaded = await page.evaluate<{ status: number; type: string }>(
          `fetch(${JSON.stringify(new URL(icon.src, app.origin).href)}).then((r) => ({ status: r.status, type: r.headers.get('content-type') || '' }))`,
        );
        assert.equal(loaded.status, 200, icon.src);
        assert.match(loaded.type, /^image\//, icon.src);
      }
    });

    await t.test('работникът се регистрира; без мрежа страницата казва „Няма връзка“', async () => {
      await page.goto(`${app.origin}/prilozhenie`);
      const scope = await page.evaluate<string>(
        'navigator.serviceWorker.ready.then((registration) => registration.scope)',
      );
      assert.equal(scope, `${app.origin}/`);
      // След регистрацията страницата още не е под контрола на работника — презарежда се веднъж.
      await page.reload();
      assert.equal(
        await page.evaluate<boolean>('navigator.serviceWorker.controller !== null'),
        true,
        'страницата е под контрола на работника',
      );
      await context.setOffline(true);
      try {
        await page.goto(`${app.origin}/ceni`);
        await page.getByRole('heading', { level: 1, name: 'Няма връзка' }).waitFor();
        await page.getByRole('link', { name: 'Опитай отново', exact: true }).waitFor();
      } finally {
        await context.setOffline(false);
      }
    });

    // Единственият очакван 503 е страницата „Няма връзка“ на работника, докато връзката е нарочно спряна.
    assert.deepEqual(
      watcher.problems().filter((problem) => !/^503 \S+\/ceni$/.test(problem)),
      [],
      'конзола и мрежа',
    );
  } finally {
    await context.close();
  }
});

test('достъпност в приложението: имена на полетата, един H1, без скрол, клавиатура', async (t) => {
  const company = await createCompany(app, 'Достъп');
  for (const profile of PROFILES) {
    const context = await app.context(profile);
    const page = await context.newPage();
    const watcher = watch(page);
    try {
      await t.test(`вход само с клавиатура (${profile.name})`, async () => {
        await page.goto(`${app.origin}/vhod`);
        await byLabel(page, app.t('auth.email')).focus();
        await page.keyboard.press('Tab');
        assert.equal(
          await page.evaluate<string>("document.activeElement.getAttribute('name')"),
          'password',
          'Tab от имейла води към паролата',
        );
        await byLabel(page, app.t('auth.email')).fill(company.email);
        await byLabel(page, app.t('auth.password')).fill(PASSWORD);
        await page.keyboard.press('Tab');
        assert.equal(
          (await page.evaluate<string>('document.activeElement.textContent')).trim(),
          app.t('auth.login'),
          'Tab от паролата води към „Вход“',
        );
        await page.keyboard.press('Enter');
        await page.waitForURL(`${app.origin}/app`);
      });

      await t.test(`екраните на фирмата (${profile.name})`, async () => {
        const base = `${app.origin}/app/o/${company.organizationId}`;
        for (const path of [
          '/app',
          '/app/sigurnost',
          '/prilozhenie',
          `${base.slice(app.origin.length)}`,
          `${base.slice(app.origin.length)}/nov`,
          `${base.slice(app.origin.length)}/kontragenti/nov`,
          `${base.slice(app.origin.length)}/artikuli/nov`,
          `${base.slice(app.origin.length)}/vhodyashti`,
          `${base.slice(app.origin.length)}/banka`,
          `${base.slice(app.origin.length)}/povtaryashti`,
          `${base.slice(app.origin.length)}/proformi`,
          `${base.slice(app.origin.length)}/nov?vid=proforma`,
          `${base.slice(app.origin.length)}/plan`,
          `${base.slice(app.origin.length)}/nastroyki`,
          `${base.slice(app.origin.length)}/serii`,
        ]) {
          const response = await page.goto(`${app.origin}${path}`);
          assert.equal(response?.status(), 200, path);
          await page.waitForLoadState('load');
          assert.ok((await horizontalOverflow(page)) <= 0, `хоризонтален скрол на ${path}`);
          const audit = await auditPage(page);
          assert.equal(audit.h1.length, 1, `един H1 на ${path}: ${JSON.stringify(audit.h1)}`);
          assert.equal(audit.lang, 'bg');
          assert.deepEqual(audit.unnamedFields, [], `полета без етикет на ${path}`);
          assert.deepEqual(audit.unnamedActions, [], `връзки/бутони без име на ${path}`);
          assert.equal(audit.landmarks.main, 1, `един main на ${path}`);
        }
      });

      assert.deepEqual(watcher.problems(), [], `конзола и мрежа (${profile.name})`);
    } finally {
      await context.close();
    }
  }
});
