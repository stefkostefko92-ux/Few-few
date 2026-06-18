// E2E тест за passkeys (WebAuthn) с виртуален authenticator през Chromium CDP.
// Изисква Playwright (dev). Стартирайте: npm run test:webauthn
import assert from 'node:assert';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import crypto from 'node:crypto';
import { chromium } from 'playwright';

process.env.ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
process.env.DB_PATH = join(mkdtempSync(join(tmpdir(), 'medqr-wa-')), 'db.sqlite');
process.env.NODE_ENV = 'test';

const { default: app } = await import('../src/server.js');
const { db } = await import('../src/db.js');
const server = app.listen(0);
const port = server.address().port;
process.env.PUBLIC_BASE_URL = `http://localhost:${port}`; // rpID=localhost, origin съвпада
const BASE = `http://localhost:${port}`;

const EMAIL = 'wa@test.bg';
const PASS = 'silnaParola2026';
let passed = 0;
const ok = (m) => {
  console.log(`  ✓ ${m}`);
  passed++;
};

const browser = await chromium.launch();
const context = await browser.newContext({ baseURL: BASE });
const page = await context.newPage();
page.on('console', (m) => {
  if (m.type() === 'error') console.log('  [console.error]', m.text());
});
page.on('pageerror', (e) => console.log('  [pageerror]', e.message));

// Виртуален authenticator (internal, с resident key и user verification).
const cdp = await context.newCDPSession(page);
await cdp.send('WebAuthn.enable');
await cdp.send('WebAuthn.addVirtualAuthenticator', {
  options: {
    protocol: 'ctap2',
    transport: 'internal',
    hasResidentKey: true,
    hasUserVerification: true,
    isUserVerified: true,
    automaticPresenceSimulation: true,
  },
});

try {
  // Регистрация на акаунт
  await page.goto('/register', { waitUntil: 'networkidle' });
  await page.fill('input[name="full_name"]', 'Паскей Тест');
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASS);
  await page.check('input[name="consent"]');
  await Promise.all([
    page.waitForURL('**/dashboard'),
    page.click('form[action="/register"] button[type="submit"]'),
  ]);
  ok('акаунтът е създаден');

  // Добавяне на passkey — изчакваме мрежовия отговор на verify
  await page.goto('/profile/passkeys', { waitUntil: 'networkidle' });
  await page.fill('input[name="label"]', 'Виртуален ключ');
  const [regResp] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith('/webauthn/register/verify')),
    page.click('form[data-webauthn="register"] button[type="submit"]'),
  ]);
  assert.equal(regResp.status(), 200, `register/verify status ${regResp.status()}`);
  const user = db.prepare('SELECT id FROM users WHERE email = ?').get(EMAIL);
  const credCount = db
    .prepare('SELECT COUNT(*) c FROM webauthn_credentials WHERE user_id = ?')
    .get(user.id).c;
  assert.equal(credCount, 1);
  ok('passkey е регистриран и записан');

  // Изход
  await page.click('header form[action="/logout"] button');
  await page.waitForURL('**/login');

  // Вход с passkey (discoverable)
  await page.goto('/login', { waitUntil: 'networkidle' });
  const [loginResp] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith('/webauthn/login/verify')),
    page.click('[data-webauthn="login"]'),
  ]);
  assert.equal(loginResp.status(), 200, `login/verify status ${loginResp.status()}`);
  await page.waitForURL('**/dashboard');
  ok('входът с passkey работи');

  console.log(`\n${passed} проверки минаха успешно.`);
  await browser.close();
  server.close();
  process.exit(0);
} catch (err) {
  console.error('\n✗ WebAuthn тестът се провали:', err);
  await browser.close();
  server.close();
  process.exit(1);
}
