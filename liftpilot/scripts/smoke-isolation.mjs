// The smoke test's second company: made by the platform's administrator, its owner changes the password, accepts the
// terms and downloads the company's data (no secrets in it), and opens nothing of the first company (404 everywhere),
// its replacement's machine room and documents and its relazione tecnica di modifica (page, PDF, workspace, draft's
// PDF) included. On the way, the workspace of the administrator (9 sections) and
// of the owner (8) fits the window from a phone to a laptop (smoke-topbar.mjs).
import assert from 'node:assert/strict';
import { step } from './smoke-kit.mjs';
import { headerFits } from './smoke-topbar.mjs';
import { firstSteps } from './smoke-help.mjs';

export async function secondCompany({ BASE, page, kit, ADMIN, stamp, urls }) {
  const { login, logout, hydrated } = kit;
  const { calcUrl, href, designUrl, dxfHref, setUrl, setPdfHref, liftUrl, liftRelHref, roomUrl, roomId, rilievoUrl, rilievoId, rilievoMovilift, rilievoMastech, rt } = urls;
  step('second company cannot see the first one');
  await login(page, ADMIN.email, ADMIN.password);
  await headerFits({ page, url: `${BASE}/it/app`, who: 'the platform’s administrator' });
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
  // the specific approval of the clauses is signed with the current password (round 48)
  await page.fill('main form:has(input[name="clauses"]) input[name="password"]', ownerNext);
  await page.click('main form:has(input[name="clauses"]) button');
  await page.waitForSelector('main form:has(input[name="clauses"])', { state: 'detached' });
  // a company with nothing yet: «Primi passi» on its Rilievi home (round 48)
  await firstSteps({ BASE, page });
  await headerFits({ page, url: `${BASE}/it/app`, who: 'an owner' });
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
  assert.equal((await page.request.get(`${BASE}${dxfHref.replace(/\/dxf$/, '/svg')}`)).status(), 404, 'plan SVG of another company');
  assert.equal((await page.goto(setUrl)).status(), 404, 'drawing set of another company');
  assert.equal((await page.request.get(`${BASE}${setPdfHref}`)).status(), 404, 'drawing set PDF of another company');
  for (const format of ['dxf', 'dwg', 'svg']) assert.equal((await page.request.get(`${BASE}${setPdfHref.replace(/\/pdf$/, `/${format}`)}`)).status(), 404, `drawing set ${format} of another company`);
  assert.equal((await page.goto(liftUrl)).status(), 404, 'lift design of another company');
  assert.equal((await page.request.get(`${BASE}${liftRelHref}`)).status(), 404, 'report of the lift design of another company');
  for (const format of ['pdf', 'dxf', 'dwg', 'svg']) assert.equal((await page.request.get(`${BASE}${new URL(liftUrl).pathname.replace(/^\/it\/app/, '/api')}/${format}`)).status(), 404, `${format} export of another company`);
  assert.equal((await page.goto(roomUrl)).status(), 404, 'machine room of another company');
  for (const format of ['relazione', 'pdf', 'dxf', 'dwg', 'svg']) assert.equal((await page.request.get(`${BASE}/api/room-designs/${roomId}/${format}`)).status(), 404, `machine room ${format} of another company`);
  // the relazione tecnica di modifica: its page, its PDF, the installation's workspace and the draft's PDF
  assert.equal((await page.goto(rt.rtUrl)).status(), 404, 'RT page of another company');
  assert.equal((await page.request.get(`${BASE}/api/relazioni/${rt.rtId}/pdf`)).status(), 404, 'RT PDF of another company');
  assert.equal((await page.goto(rt.wsUrl)).status(), 404, 'RT workspace of another company');
  assert.equal((await page.request.get(`${BASE}/api/projects/${rt.projectId}/relazione-tecnica/anteprima`)).status(), 404, 'RT draft of another company');
  // the survey sheet: its page, its edit and print pages, its PDF and its modules' PDFs (Rilievi)
  for (const sub of ['', '/modifica', '/stampa', '/elimina']) assert.equal((await page.goto(`${rilievoUrl}${sub}`)).status(), 404, `survey sheet${sub} of another company`);
  // each module's PDF on a sheet where that module is open (200 for its own company): Pelazza, argano, 2SG on the first,
  // MoviLift (and argano) on the sync's, Mastech NG120 on the hydraulic one
  for (const [id, pdfs] of [[rilievoId, ['pdf', 'ordine-quadro', 'dati-argano', 'sospensioni-2sg']], [rilievoMovilift, ['pdf', 'ordine-quadro-movilift', 'dati-argano']],
    [rilievoMastech, ['pdf', 'ordine-quadro-mastech-ng120']]]) {
    for (const pdf of pdfs) assert.equal((await page.request.get(`${BASE}/api/rilievi/${id}/${pdf}`)).status(), 404, `survey sheet ${pdf} of another company`);
  }
}
