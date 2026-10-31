// Two-step sign-in in a real browser, on the technician the flow has just invited: the account page
// leads to it, the password opens the set-up (QR and key), the app's code switches it on and shows ten
// recovery codes; signed out, the password alone leads to the code page (axe), a wrong code is refused,
// the right one opens the portal; then a recovery code switches it off again. The codes are computed
// here like an authenticator app does (RFC 6238).
import { createHmac } from 'node:crypto';
import { join } from 'node:path';
import { aligned, audit, fail } from './helpers.mjs';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32(secret) {
  let bits = 0;
  let value = 0;
  const out = [];
  for (const char of secret.replace(/[^A-Z2-7]/g, '')) {
    value = (value << 5) | ALPHABET.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

function codeAt(secret, step) {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(step));
  const digest = createHmac('sha1', base32(secret)).update(message).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = (digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return String(binary).padStart(6, '0');
}

const nowStep = () => Math.floor(Date.now() / 30_000);

/** A form posted and its answer loaded (a POST answered with a page, not a redirect). */
const submit = (page, selector) => Promise.all([page.waitForNavigation(), page.click(selector)]);

export async function checkTwoFactor({ base, shots, techPage, techEmail, password }) {
  const page = techPage;
  await page.goto(`${base}/account`);
  await page.click('a[href="/account/2fa"]');
  await page.waitForURL(/\/account\/2fa$/);
  await audit(page, '2fa off');
  await page.fill('#password', password);
  await submit(page, 'form[action="/account/2fa/avvia"] button[type=submit]');
  if (!(await page.locator('.due-fattori__qr svg').count())) return fail('2fa: no QR code');
  const secret = (await page.textContent('.due-fattori__chiave strong')).replace(/\s+/g, '');
  if (!/^[A-Z2-7]{32}$/.test(secret)) return fail(`2fa: odd key "${secret}"`);
  await audit(page, '2fa set-up');
  await aligned(page, '2fa set-up');
  await page.screenshot({ path: join(shots, '2fa-configura.png'), fullPage: true });
  let used = nowStep();
  await page.fill('#codice', codeAt(secret, used));
  await submit(page, 'form[action="/account/2fa/conferma"] button[type=submit]');
  const codes = await page.locator('.due-fattori__codici li').allTextContents();
  if (codes.length !== 10) return fail(`2fa: ${codes.length} recovery codes instead of 10`);
  await page.screenshot({ path: join(shots, '2fa-codici.png'), fullPage: true });

  // Signed out: the password alone is not enough.
  await page.goto(`${base}/account`);
  await submit(page, 'form[action="/esci"] button[type=submit]');
  await page.waitForURL(/\/accesso/);
  await page.fill('#email', techEmail);
  await page.fill('#password', password);
  await page.click('form button[type=submit]');
  await page.waitForURL(/\/accesso\/codice$/);
  if ((await page.goto(`${base}/schede`))?.url().includes('/schede'))
    fail('2fa: the portal opens without the code');
  await page.goto(`${base}/accesso/codice`);
  await audit(page, '2fa code page');
  await page.screenshot({ path: join(shots, '2fa-accesso-codice.png'), fullPage: true });
  await page.fill('#codice', '000000');
  await submit(page, 'form button[type=submit]');
  if (!(await page.locator('#form-error').count())) fail('2fa: a wrong code is not refused');
  used = Math.max(used + 1, nowStep());
  await page.fill('#codice', codeAt(secret, used));
  await page.click('form button[type=submit]');
  await page.waitForURL(/\/schede/);

  // Off again — the password and a recovery code.
  await page.goto(`${base}/account/2fa`);
  await page.locator('details.danger-zone summary').click();
  await page.fill('#password-disattiva', password);
  await page.fill('#codice-disattiva', codes[0]);
  await submit(page, 'form[action="/account/2fa/disattiva"] button[type=submit]');
  await page.waitForURL(/\/account\/2fa$/);
  if (!(await page.locator('form[action="/account/2fa/avvia"]').count()))
    fail('2fa: still on after switching it off');
}
