// Accessibility smoke over a running Rendetto: every public page in BG/EN/IT, light and dark, desktop and phone,
// checked with axe-core against WCAG 2.1 A and AA. With E2E_EMAIL/E2E_PASSWORD (a test account with an active
// plan or trial and no 2FA, never a person's) also the projects, the account pages and the editor, on a project
// made for the run and deleted after it. Fails on any violation, console error or blocked script (CSP).
//
//   RENDETTO_URL=http://127.0.0.1:4320 E2E_EMAIL=… E2E_PASSWORD=… npm run test:e2e
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';

const base = (process.env.RENDETTO_URL ?? 'http://127.0.0.1:4320').replace(/\/+$/, '');
const email = process.env.E2E_EMAIL ?? '';
const password = process.env.E2E_PASSWORD ?? '';
const AXE = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
const LOCALES = ['bg', 'en', 'it'];
const SCHEMES = ['light', 'dark'];
const VIEWPORTS = {
  desktop: { width: 1366, height: 900 },
  phone: { width: 390, height: 844 },
};
const PUBLIC = ['/', '/privacy', '/terms', '/login', '/register', '/forgot', '/no-such-page'];
const CUSTOMER = ['/app', '/account', '/account/plan', '/account/security', '/account/data'];

// the landing and the legal pages have a path per language, the rest take ?lang=
function localized(path, locale) {
  if (path === '/') return locale === 'bg' ? '/' : `/${locale}/`;
  if (path === '/privacy' || path === '/terms') return locale === 'bg' ? path : `/${locale}${path}`;
  return `${path}?lang=${locale}`;
}

async function check(browser, storageState, path, locale, scheme, viewport) {
  const ctx = await browser.newContext({ storageState, viewport, colorScheme: scheme });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    // the missing page answers 404 on purpose
    if (m.type() === 'error' && !/status of 404/.test(m.text())) errors.push(m.text());
  });
  try {
    await page.goto(base + localized(path, locale), { waitUntil: 'networkidle', timeout: 300000 });
    // sections below the fold are skipped (content-visibility: auto) and laid out at a placeholder height
    // until they are seen: scroll through once, as a reader would, so axe measures the real layout
    await page.evaluate(async () => {
      const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      for (let y = 0; y < document.documentElement.scrollHeight; y += innerHeight / 2) {
        scrollTo(0, y);
        await frame();
      }
      scrollTo(0, 0);
      await frame();
    });
    await page.evaluate(AXE);
    const violations = await page.evaluate(
      async (tags) =>
        (await window.axe.run(document, { runOnly: { type: 'tag', values: tags } })).violations.map(
          (v) => `${v.impact} ${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
        ),
      TAGS,
    );
    return [...violations, ...errors.map((e) => `error: ${e.slice(0, 300)}`)];
  } finally {
    await ctx.close();
  }
}

async function signIn(browser) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${base}/login`);
  await page.fill('#email', email);
  await page.fill('#password', password);
  await Promise.all([page.waitForURL(/\/app/), page.click('button[type=submit]')]);
  await page.selectOption('#type', 'chest');
  await page.fill('#pname', 'e2e — достъпност');
  await Promise.all([
    page.waitForURL(/\/app\/p\//),
    page.click('.newproj-form button[type=submit]'),
  ]);
  const editor = new URL(page.url()).pathname;
  return { ctx, page, state: await ctx.storageState(), editor };
}

async function main() {
  const browser = await chromium.launch();
  const failures = [];
  let screens = 0;
  let session = null;
  try {
    const groups = [[undefined, PUBLIC]];
    if (email && password) {
      session = await signIn(browser);
      groups.push([session.state, [...CUSTOMER, session.editor]]);
    } else {
      process.stdout.write('E2E_EMAIL/E2E_PASSWORD не са зададени — само публичните страници.\n');
    }
    for (const [state, paths] of groups)
      for (const path of paths)
        for (const locale of LOCALES)
          for (const scheme of SCHEMES)
            for (const [name, viewport] of Object.entries(VIEWPORTS)) {
              const found = await check(browser, state, path, locale, scheme, viewport);
              screens += 1;
              for (const f of found) failures.push(`${path} ${locale} ${scheme} ${name} — ${f}`);
            }
  } finally {
    if (session) {
      const { page, editor } = session;
      page.on('dialog', (d) => void d.accept());
      await page.goto(`${base}/app`);
      await Promise.all([
        page.waitForURL(/\/app$/),
        page.click(`form[action="${editor}/delete"] button`),
      ]);
      await session.ctx.close();
    }
    await browser.close();
  }
  process.stdout.write(`${screens} екрана, ${failures.length} нарушения\n`);
  for (const f of failures) process.stdout.write(`  ${f}\n`);
  if (failures.length) process.exitCode = 1;
}

main().catch((err) => {
  process.stderr.write(`${err instanceof Error ? err.stack : String(err)}\n`);
  process.exitCode = 1;
});
