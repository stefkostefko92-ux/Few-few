// The smoke test's machine replacement project (only the machine and the machine room), in an installation of its own:
// the main calculation has the machine below (no machine room to draw); the calculator starts from the machine over the
// shaft (its example asked for: a new calculation starts empty), a «Solo argano» with its ropes replaced, whose room is
// surveyed measure by measure and saved with a reproduced hash; its relazione tecnica, the drawing set as a draft
// (PDF), the plan and section in DXF and DWG; a drawing set issued from it, its PDF and a revision from the same survey;
// the whole drawing — still possible on a «Solo argano» (round 45: no more «Passa a progetto completo») — starts from the
// survey; a modernisation keeping the machine is verified as it is and draws the shaft.
import assert from 'node:assert/strict';
import { blankCalc, blankSurvey, projectData } from './smoke-blank.mjs';
import { keptProgetto } from './smoke-progetto.mjs';
import { step } from './smoke-kit.mjs';

export async function replacementRoom({ BASE, page, hydrated, calcUrl, stamp }) {
  step('replacement: a calculation with the machine above, the survey of its machine room, saved');
  await page.goto(calcUrl);
  assert.match(await page.textContent('section[aria-labelledby="calc-progetto"]'), /Argano in basso/, 'no machine room below');
  await page.goto(`${BASE}/it/app/projects/new`);
  await page.fill('input[name="name"]', `Sostituzione ${stamp}`);
  await page.fill('input[name="city"]', 'Milano');
  await Promise.all([page.waitForURL(/\/projects\/[a-z0-9]+\/calc$/), page.click('main form button[type="submit"]')]);
  const roomProjectUrl = page.url().replace(/\/calc$/, '');
  await blankCalc({ page, hydrated, example: 'C' });
  assert.equal(await page.inputValue('#layout'), 'top', 'the example has the machine above');
  // the example of a replacement is a «Solo argano»: the machine is the calculation's, the ropes answered «Sì» here
  assert.ok(await page.isChecked('input[name="intervento"][value="SOLO_ARGANO"]'), 'Solo argano');
  assert.equal(await page.locator('.parti-sino li.parte:not(.regola)').count(), 2, 'the machine and the ropes');
  await page.click('.parti-sino li[data-part="ropes"] label:has-text("Sì")');
  await page.waitForSelector('.parti-sino li[data-part="ropes"] label.on:has-text("Sì")');
  // round 46 (11.2.1): the existing controller with a frequency converter (the example's), two speeds refused, VVVF saves
  const reg = '.parti-sino li[data-part="regolazione"]';
  assert.ok(await page.isChecked(`${reg} input[value="vvvf"]`), 'the example: VVVF');
  await page.click(`${reg} label:has-text("2 velocità")`);
  await page.waitForSelector('[data-avviso="avviso_inverter"]');
  assert.ok(await page.locator('.savebar button.primary').isDisabled(), 'two speeds: refused');
  await page.click(`${reg} label:has-text("VVVF")`);
  await page.waitForSelector('[data-avviso="avviso_inverter"]', { state: 'detached' });
  await page.waitForSelector('.savebar button.primary:not([disabled])');
  await Promise.all([page.waitForURL(/\/calculations\/[a-z0-9]+$/, { timeout: 30000 }), page.click('.savebar button.primary')]);
  const roomCalcUrl = page.url();
  await Promise.all([page.waitForURL(/\/calculations\/[a-z0-9]+\/locale$/), page.click('section[aria-labelledby="calc-progetto"] a[href$="/locale"]')]);
  const save = 'section[aria-labelledby="room-save"] button.btn-primary';
  await hydrated(page, save);
  // a new survey starts empty: every measure typed (a higher room, the existing drops as measured)
  await blankSurvey({ page, hydrated });
  await page.waitForSelector('figure.sheet-view .draw-stage svg');
  assert.equal(await page.locator('main .alert-bad').count(), 0, 'nothing stops the survey');
  assert.match(await page.textContent('section[aria-labelledby="room-checks"]'), /Calate esistenti rilevate e calate del calcolo/, 'the drops checked');
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
  assert.equal(await page.locator('section[aria-labelledby="calc-progetto"] a[href*="/room-designs/"]').count(), 1, 'machine room on the calculation');

  step('replacement: the whole drawing on the same «Calcolo argano» starts from the survey');
  await page.goto(roomProjectUrl);
  assert.equal(await page.locator('button:has-text("Passa a progetto completo")').count(), 0, 'no upgrade any more');
  await page.goto(roomCalcUrl);
  await Promise.all([page.waitForURL(/\/progetto\?calc=[a-z0-9]+$/, { timeout: 30000 }), page.click('section[aria-labelledby="calc-progetto"] a[href*="/progetto?calc="]')]);
  assert.match(await page.textContent('main'), /Per la sola sostituzione dell’argano basta il rilievo del locale macchina/, 'the machine room is enough, said on top');
  // the shaft, the walls and the room of the survey carried over, the counterweight at its drop: the rest to enter
  await projectData({ page, hydrated, shaft: false });
  await page.evaluate(() => { const d = globalThis.document.querySelector('.lift-form details.room-options'); if (d) d.open = true; });
  assert.equal(await page.locator('.lift-form details.room-options input[type="number"]').nth(4).inputValue(), '2700', 'the surveyed machine room carried over');
  // a direct pull: the plan takes the car and the counterweight under the surveyed drops, so nothing is left to fix
  // before the save (no «Calata» against the existing sheave)
  assert.equal(await page.locator('.lift-work .savebar button.btn-primary').isDisabled(), false, 'the drawing saves without a calata to fix');
  await keptMachine({ BASE, page, hydrated, roomCalcUrl });
  return { roomUrl, roomId, roomSetUrl };
}

/** A modernisation keeping the machine (round 45, «Argano: No»): verified as it is — no proposal, advice, machine priced
 *  or order, and its Progetto is the shaft (the machine room's survey places a new machine: refused). */
async function keptMachine({ BASE, page, hydrated, roomCalcUrl }) {
  step('a modernisation keeping the machine: no advice, machine cost or order; its Progetto is the shaft');
  await page.goto(roomCalcUrl);
  await Promise.all([page.waitForURL(/\/calc\?from=/), page.click('.page-head a[href*="/calc?from="]')]);
  await hydrated(page, '#Q');
  await page.click('label.intervento-tipo[data-tipo="AMMODERNAMENTO"]');
  await page.waitForSelector('.parti-sino li[data-part="machine"] label');
  for (const part of await page.$$eval('.parti-sino li.parte', (ls) => ls.map((l) => l.getAttribute('data-part')))) {
    const pick = page.locator(`.parti-sino li[data-part="${part}"] label:has-text("${part === 'controller' ? 'Sì' : 'No'}")`);
    if (await pick.count()) await pick.click();
  }
  // the arrow keys move along a part's pair (native radios): «Sì» → «No» and back
  await page.focus('.parti-sino li[data-part="car"] input[value="no"]');
  await page.keyboard.press('ArrowLeft');
  await page.waitForSelector('.parti-sino li[data-part="car"] label.on:has-text("Sì")');
  await page.keyboard.press('ArrowRight');
  await page.waitForSelector('.parti-sino li[data-part="car"] label.on:has-text("No")');
  assert.equal(await page.locator('.parti-sino li.parte.da').count(), 0, 'every part answered');
  await page.waitForSelector('.savebar button.primary:not([disabled])');
  await Promise.all([page.waitForURL(/\/calculations\/[a-z0-9]+$/, { timeout: 30000 }), page.click('.savebar button.primary')]);
  const keptUrl = page.url();
  await page.waitForSelector('.verdict');
  assert.match(await page.textContent('.verdict'), /Argano esistente \(resta\)/, 'the verdict under the kept machine');
  assert.equal(await page.locator('.verdict .propline').count(), 0, 'no proposal');
  assert.equal(await page.locator('section.advice').count(), 0, 'no advice');
  assert.match(await page.textContent('main'), /L’argano resta quello dell’impianto: non c’è un argano da ordinare/, 'no order');
  assert.ok(!(await page.textContent('main')).includes('L’argano con i dati per il costruttore'), 'no order lead for a machine kept');
  if (await page.locator('#project-cost-h').count()) assert.match(await page.textContent('section[aria-labelledby="project-cost-h"]'), /nessun argano né basamento da acquistare/);
  assert.equal(await page.locator('section[aria-labelledby="calc-progetto"] a[href$="/locale"]').count(), 0, 'no survey of the machine room');
  assert.equal(await page.locator('section[aria-labelledby="calc-progetto"] a[href*="/progetto?calc="]').count(), 1, 'the shaft to draw');
  assert.equal((await page.request.get(`${keptUrl}/locale`)).status(), 404, 'the survey page refused');
  const id = keptUrl.split('/').pop();
  assert.equal((await page.request.get(`${BASE}/api/calculations/${id}/relazione`)).status(), 200, 'its relazione');
  assert.equal((await page.request.get(`${BASE}/api/calculations/${id}/order/pdf`)).status(), 422, 'no order to draft');
  await keptProgetto({ page, hydrated, keptUrl });
}
