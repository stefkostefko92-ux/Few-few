// The smoke test's second company: made by the platform's administrator, its owner changes the password, accepts the
// terms and downloads the company's data (no secrets in it), and opens nothing of the first company (404 everywhere).
import assert from 'node:assert/strict';
import { step } from './smoke-kit.mjs';

export async function secondCompany({ BASE, page, kit, ADMIN, stamp, urls }) {
  const { login, logout, hydrated } = kit;
  const { calcUrl, href, designUrl, dxfHref, setUrl, setPdfHref, liftUrl, liftRelHref } = urls;
  step('second company cannot see the first one');
  await login(page, ADMIN.email, ADMIN.password);
  await page.goto(`${BASE}/it/app/admin`);
  const ownerEmail = `titolare.${stamp}@example.com`;
  await page.fill('input[name="name"]', `Ditta ${stamp}`);
  await page.fill('input[name="ownerName"]', 'Titolare di prova');
  await page.fill('input[name="ownerEmail"]', ownerEmail);
  await page.click('main form:has(input[name="ownerEmail"]) button[type="submit"]');
  const ownerTemp = (await page.locator('.secret').first().textContent())?.trim() ?? '';
  await logout(page);
  await login(page, ownerEmail, ownerTemp);
  const ownerNext = `Titolare${stamp}Password9`;
  await page.fill('input[name="current"]', ownerTemp);
  await page.fill('input[name="next"]', ownerNext);
  await page.fill('input[name="confirm"]', ownerNext);
  await page.click('main form button[type="submit"]');
  await page.waitForSelector('.alert-ok');
  // the owner of a company the platform made accepts the terms before working
  await page.goto(`${BASE}/it/app`);
  await hydrated(page, 'main form:has(input[name="clauses"]) button');
  for (const k of ['accept', 'business', 'drafts', 'clauses']) await page.check(`main input[name="${k}"]`);
  await page.click('main form:has(input[name="clauses"]) button');
  await page.waitForSelector('main form:has(input[name="clauses"])', { state: 'detached' });
  // the company's data, all of it, without secrets (terms of use, «exit»)
  const exported = await page.request.get(`${BASE}/api/company/export`);
  assert.equal(exported.status(), 200, 'company export');
  const dump = await exported.text();
  assert.equal(JSON.parse(dump).format, 'liftpilot-company-export');
  for (const secret of ['passwordHash', 'tokenVersion', 'stripeCustomerId']) assert.ok(!dump.includes(secret), `export without ${secret}`);
  const other = await page.goto(calcUrl);
  assert.equal(other.status(), 404, 'calculation of another company');
  const otherPdf = await page.request.get(`${BASE}${href}`);
  assert.equal(otherPdf.status(), 404, 'report of another company');
  assert.equal((await page.goto(designUrl)).status(), 404, 'shaft design of another company');
  assert.equal((await page.request.get(`${BASE}${dxfHref}`)).status(), 404, 'DXF of another company');
  assert.equal((await page.goto(setUrl)).status(), 404, 'drawing set of another company');
  assert.equal((await page.request.get(`${BASE}${setPdfHref}`)).status(), 404, 'drawing set PDF of another company');
  assert.equal((await page.goto(liftUrl)).status(), 404, 'lift design of another company');
  assert.equal((await page.request.get(`${BASE}${liftRelHref}`)).status(), 404, 'report of the lift design of another company');
  for (const format of ['pdf', 'dxf', 'dwg']) assert.equal((await page.request.get(`${BASE}${new URL(liftUrl).pathname.replace(/^\/it\/app/, '/api')}/${format}`)).status(), 404, `${format} export of another company`);
}
