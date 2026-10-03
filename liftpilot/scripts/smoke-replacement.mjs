// The smoke test's machine replacement project (only the machine and the machine room), in an installation of its own:
// the main calculation has the machine below (no machine room to draw); the calculator starts from the machine over the
// shaft, whose room is surveyed and saved with a reproduced hash; its relazione tecnica, the drawing set as a draft
// (PDF), the plan and section in DXF and DWG; a drawing set issued from it, its PDF and a revision from the same survey;
// the whole project it becomes starts from the survey.
import assert from 'node:assert/strict';
import { step } from './smoke-kit.mjs';

export async function replacementRoom({ BASE, page, hydrated, calcUrl, stamp }) {
  step('replacement: a calculation with the machine above, the survey of its machine room, saved');
  await page.goto(calcUrl);
  assert.match(await page.textContent('section[aria-labelledby="calc-room"]'), /Argano in basso/, 'no machine room below');
  await page.goto(`${BASE}/it/app/projects/new?kind=replacement`);
  await page.fill('input[name="name"]', `Sostituzione ${stamp}`);
  await page.fill('input[name="city"]', 'Milano');
  await Promise.all([page.waitForURL(/\/projects\/[a-z0-9]+\/calc$/), page.click('main form button[type="submit"]')]);
  const roomProjectUrl = page.url().replace(/\/calc$/, '');
  await page.waitForSelector('.verdict .big');
  assert.equal(await page.inputValue('#layout'), 'top', 'a replacement starts with the machine above');
  await Promise.all([page.waitForURL(/\/calculations\/[a-z0-9]+$/, { timeout: 30000 }), page.click('.savebar button.primary')]);
  const roomCalcUrl = page.url();
  await Promise.all([page.waitForURL(/\/calculations\/[a-z0-9]+\/locale$/), page.click('section[aria-labelledby="calc-room"] a[href$="/locale"]')]);
  const save = 'section[aria-labelledby="room-save"] button.btn-primary';
  await hydrated(page, save);
  // the example room is replaced with the measures: a higher room, the existing drops as measured
  await page.locator('section[aria-labelledby="room-fields"] input[type="number"]').nth(4).fill('2700');
  await page.waitForSelector('figure.sheet-view .draw-stage svg');
  assert.equal(await page.locator('main .alert-bad').count(), 0, 'nothing stops the survey');
  assert.match(await page.textContent('section[aria-labelledby="room-checks"]'), /Calate della nuova macchina/, 'the drops checked');
  await page.fill('section[aria-labelledby="room-save"] input', 'Rilievo di prova');
  await Promise.all([page.waitForURL(/\/room-designs\/[a-z0-9]+$/, { timeout: 60000 }), page.click(save)]);
  const roomUrl = page.url(), roomId = roomUrl.split('/').pop();
  assert.equal(await page.locator('main > .alert-warn').count(), 0, 'the running engines reproduce the machine room');
  assert.equal(await page.locator('figure.sheet-view .draw-stage svg').count(), 2, 'plan and section of the machine room');

  step('replacement: relazione tecnica, drawing set draft, DXF and DWG');
  for (const [format, magic] of [['relazione', '%PDF-'], ['pdf', '%PDF-'], ['dxf', '  0\nSECTION'], ['dwg', 'AC1015']]) {
    const res = await page.request.get(`${BASE}/api/room-designs/${roomId}/${format}`);
    assert.equal(res.status(), 200, format);
    assert.equal((await res.body()).subarray(0, magic.length).toString('latin1'), magic, format);
  }

  step('replacement: drawing set issued from the machine room, its PDF and a revision');
  await page.fill('section[aria-labelledby="room-sets"] input[maxlength="12"]', 'S.T.');
  await Promise.all([page.waitForURL(/\/drawing-sets\/[a-z0-9]+$/, { timeout: 60000 }), page.click('section[aria-labelledby="room-sets"] button[type="submit"]')]);
  const roomSetUrl = page.url();
  await page.waitForSelector('.sheet-page svg.sheet-svg');
  assert.equal(await page.locator('nav.seg-row a').count(), 3, 'data, plan and section of the machine room');
  const pdf = await page.request.get(`${BASE}${await page.getAttribute('a[href$="/pdf"]', 'href')}`);
  assert.equal(pdf.status(), 200);
  assert.equal((await pdf.body()).subarray(0, 5).toString('latin1'), '%PDF-');
  await page.fill('main form input[maxlength="120"]', 'Seconda emissione di prova');
  await page.fill('main form:has(input[maxlength="120"]) input[maxlength="12"]', 'S.T.');
  const setPath = new URL(roomSetUrl).pathname;
  await Promise.all([page.waitForURL((u) => /\/drawing-sets\/[a-z0-9]+$/.test(u.pathname) && u.pathname !== setPath, { timeout: 60000 }),
    page.click('main form:has(input[maxlength="120"]) button[type="submit"]')]);
  assert.match(await page.textContent('h1'), / R1$/, 'revision R1');
  // the calculation lists its machine room and the sets
  await page.goto(roomCalcUrl);
  assert.equal(await page.locator('section[aria-labelledby="calc-room"] a[href*="/room-designs/"]').count(), 1, 'machine room on the calculation');

  step('replacement: the whole project it becomes starts from the survey');
  await page.goto(roomProjectUrl);
  await Promise.all([page.waitForURL(/\/progetto$/, { timeout: 30000 }), page.click('button:has-text("Passa a progetto completo")')]);
  await page.waitForSelector('.lift-facts .lift-verdict');
  await page.evaluate(() => { const d = globalThis.document.querySelector('.lift-form details.room-options'); if (d) d.open = true; });
  assert.equal(await page.locator('.lift-form details.room-options input[type="number"]').nth(4).inputValue(), '2700', 'the surveyed machine room carried over');
  return { roomUrl, roomId, roomSetUrl };
}
