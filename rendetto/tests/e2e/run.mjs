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
// a page that is not ready in this time is a finding for that screen, not a five-minute stall of the run
const READY_MS = 30000;
// unique per run: cleanup finds the project by name even if the editor never opened
const PROJECT_NAME = `e2e — достъпност ${Date.now().toString(36)}`;

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
    try {
      await ready(page, path, locale);
    } catch (err) {
      return [`not ready in ${READY_MS / 1000} s: ${firstLine(err)}`, ...errors];
    }
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

const firstLine = (err) => (err instanceof Error ? err.message : String(err)).split('\n')[0];

// 'networkidle' never settles on a page that keeps a connection open; wait for the document and its
// <main> instead, and in the editor for the first computed model (the title line is filled from it)
async function ready(page, path, locale) {
  await page.goto(base + localized(path, locale), { waitUntil: 'load', timeout: READY_MS });
  await page.locator('main#main').waitFor({ state: 'visible', timeout: READY_MS });
  if (path.startsWith('/app/p/'))
    await page.waitForFunction(
      () => document.getElementById('title-spec')?.textContent?.trim(),
      undefined,
      { timeout: READY_MS },
    );
}

// fills the session in place: whatever fails after the project is created, main's finally still
// holds the context and deletes the project
async function signIn(session) {
  const { ctx, page } = session;
  page.setDefaultTimeout(READY_MS);
  await page.goto(`${base}/login`);
  await page.fill('#email', email);
  await page.fill('#password', password);
  await Promise.all([page.waitForURL(/\/app/), page.click('button[type=submit]')]);
  await page.selectOption('#type', 'chest');
  await page.fill('#pname', PROJECT_NAME);
  await Promise.all([
    page.waitForURL(/\/app\/p\//),
    page.click('.newproj-form button[type=submit]'),
  ]);
  session.editor = new URL(page.url()).pathname;
  session.state = await ctx.storageState();
}

// deletes every project of this run by its name, then closes the context; a failure here is reported
// (the test account would keep the project) but does not hide the error that ended the run
async function cleanUp({ ctx, page }) {
  try {
    page.on('dialog', (d) => void d.accept());
    await page.goto(`${base}/app`);
    for (let i = 0; i < 5; i++) {
      const row = page.locator('li.proj', { hasText: PROJECT_NAME }).first();
      if (!(await row.count())) return;
      await Promise.all([
        page.waitForURL(/\/app$/),
        row.locator('form[action$="/delete"] button').click(),
      ]);
    }
    throw new Error('the project is still listed after five deletions');
  } catch (err) {
    process.stderr.write(`the test project „${PROJECT_NAME}“ was not deleted: ${firstLine(err)}\n`);
    process.exitCode = 1;
  } finally {
    await ctx.close();
  }
}

async function main() {
  const browser = await chromium.launch();
  const failures = [];
  let screens = 0;
  let session = null;
  try {
    const groups = [[undefined, PUBLIC]];
    if (email && password) {
      const ctx = await browser.newContext();
      session = { ctx, page: await ctx.newPage(), state: undefined, editor: null };
      await signIn(session);
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
    if (session) await cleanUp(session);
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
