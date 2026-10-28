// The smoke test's «Trasformazione completa» (round 45, phase 3 step 6), in an installation of its own: created (it opens
// on «Calcolo argano»), its Progetto has nothing to draw on yet and leads back to «Calcolo argano»; the calculation as a
// transformation (UNI EN 81-20/50 fixed, the example of a new lift), saved; its page leads to the Progetto, which shows
// what it draws on and asks only the drawing; saved, the lift design names its base and its calculation the type; a
// drawing set issued from it says the type in sheet 1's note. Round 46: a «Solo argano» with its logbook — the Progetto
// with another travel held (tipoDaRivedere), the speed +6 % refused and saved as a modernisation (smoke-intervento.mjs).
import assert from 'node:assert/strict';
import { blankCalc, projectData } from './smoke-blank.mjs';
import { soloLibretto, soloQuadro } from './smoke-intervento.mjs';
import { step } from './smoke-kit.mjs';

export async function progettoFlow({ BASE, page, hydrated, stamp }) {
  step('trasformazione completa: the Progetto starts from «Calcolo argano»');
  await page.goto(`${BASE}/it/app/projects/new`);
  await page.fill('input[name="name"]', `Trasformazione ${stamp}`);
  await page.fill('input[name="city"]', 'Bergamo');
  await Promise.all([page.waitForURL(/\/projects\/[a-z0-9]+\/calc$/), page.click('main form button[type="submit"]')]);
  const projectUrl = page.url().replace(/\/calc$/, '');
  // the installation: «Intervento da definire», its next step the calculation
  await page.goto(projectUrl);
  assert.match(await page.textContent('.page-head .titles .tipo-badge'), /Intervento da definire/);
  assert.equal(await page.getAttribute('.imp-next a.btn-primary', 'href'), `${new URL(projectUrl).pathname}/calc`, 'the next step: the calculation');
  await page.goto(`${projectUrl}/progetto`);
  assert.match(await page.textContent('main .progetto-vuoto'), /Il progetto parte dal calcolo argano/, 'nothing to draw on yet');
  await Promise.all([page.waitForURL(/\/projects\/[a-z0-9]+\/calc$/), page.click('main .progetto-vuoto a[href$="/calc"]')]);

  step('trasformazione completa: the calculation of a new lift, UNI EN 81-20/50 fixed, saved');
  await blankCalc({ page, hydrated, example: 'A' });
  await page.click('label.intervento-tipo[data-tipo="TRASFORMAZIONE_COMPLETA"]');
  await page.waitForSelector('.collaudo .norma-fissa');
  assert.match(await page.textContent('.collaudo .norma-fissa'), /EN 81-20/, 'the base of the test fixed');
  await page.waitForSelector('.savebar button.primary:not([disabled])');
  await Promise.all([page.waitForURL(/\/calculations\/[a-z0-9]+$/, { timeout: 30000 }), page.click('.savebar button.primary')]);
  const baseUrl = page.url(), baseId = baseUrl.split('/').pop();
  assert.match(await page.textContent('.calc-ruolo'), /Trasformazione completa/, 'the type on the record');
  assert.equal(await page.locator('section[aria-labelledby="calc-progetto"] a[href$="/locale"]').count(), 0, 'no machine room survey for a new lift');

  step('trasformazione completa: the Progetto draws on it, saved');
  await Promise.all([page.waitForURL(/\/progetto\?calc=[a-z0-9]+$/, { timeout: 30000 }), page.click('section[aria-labelledby="calc-progetto"] a[href*="/progetto?calc="]')]);
  // the machine above in the calculation: a new lift's machine room is drawn too (the panel placed by the software)
  await hydrated(page, '#bk-room-W');
  const room = { W: 3000, D: 3000, shaftX: 500, shaftY: 500, H: 2700, slab: 250, doorAt: 300, doorW: 800, doorH: 2000, panelW: 800, panelD: 300, panelH: 1800 };
  for (const [k, v] of Object.entries(room)) await page.fill(`#bk-room-${k}`, String(v));
  await page.selectOption('#bk-room-doorWall', 'front');
  await projectData({ page, hydrated });
  assert.match(await page.textContent('.lift-form .dal-calcolo'), /Trasformazione completa[\s\S]*UNI EN 81-20/, 'what it draws on');
  assert.match(await page.textContent('.lift-work .lift-verdict .badge'), /EN 81-20/, 'tested as new');
  // a diverting pulley's distance the plan cannot give with the calculation's machine: the calculation's, as it was saved
  if (await page.locator('.lift-work .savebar button.btn-primary[disabled]').count()) {
    await page.uncheck('#auto-dx');
    await page.waitForSelector('.lift-work .savebar button.btn-primary:not([disabled])', { timeout: 30000 });
  }
  await page.fill('.lift-work .savebar input', 'Trasformazione di prova');
  await Promise.all([page.waitForURL(/\/lift-designs\/[a-z0-9]+$/, { timeout: 60000 }), page.click('.lift-work .savebar button.btn-primary')]);
  const liftUrl = page.url();
  await page.waitForSelector('.lift-view .lift-facts');
  assert.equal(await page.locator('main > .alert-warn, main > .alert-bad').count(), 0, 'the running engines reproduce the saved design');

  step('trasformazione completa: its calculation names the base, its set says the type');
  await page.goto(baseUrl);
  assert.equal(await page.locator(`section[aria-labelledby="calc-progetto"] a[href*="/lift-designs/"]`).count(), 1, 'the design on its base');
  await documentiOf(page, liftUrl);
  const relHref = await page.getAttribute(REL, 'href');
  const calcId = /\/api\/calculations\/([a-z0-9]+)\/relazione/.exec(relHref ?? '')?.[1];
  assert.ok(calcId && calcId !== baseId, 'the design’s own calculation');
  await page.goto(`${BASE}/it/app/calculations/${calcId}`);
  assert.match(await page.textContent('.calc-ruolo'), /Trasformazione completa[\s\S]*disegnato sul calcolo argano del/, 'drawn on the base');
  const rel = await page.request.get(`${BASE}${relHref}`);
  assert.equal(rel.status(), 200);
  assert.equal((await rel.body()).subarray(0, 5).toString('latin1'), '%PDF-');
  await documentiOf(page, liftUrl);
  await page.fill('main form input[maxlength="12"]', 'S.T.');
  await Promise.all([page.waitForURL(/\/drawing-sets\/[a-z0-9]+$/, { timeout: 60000 }), page.click('main form:has(input[maxlength="12"]) button[type="submit"]')]);
  await page.waitForSelector('.sheet-page svg.sheet-svg');
  // (the note wraps on its lines, whose texts join without the space: compared without spaces)
  const sheet1 = ((await page.textContent('.sheet-page svg.sheet-svg')) ?? '').replace(/\s+/g, '');
  assert.ok(sheet1.includes('Intervento:Trasformazionecompleta'), 'the type in sheet 1’s note');
  const loop = await progettoLoop({ BASE, page, hydrated, liftUrl });
  const soloUrl = await soloLibretto({ BASE, page, hydrated, stamp, projectData });
  await soloQuadro({ page, hydrated, soloUrl });
  return { projectUrl, baseUrl, liftUrl: loop.liftUrl };
}

/** Round 46 (B8): the Progetto of a modernisation keeping the machine (`keptUrl`, smoke-replacement.mjs) draws it on its
 *  existing base — its base's kind only, L0 and dx·h locked «dal calcolo»; section B-B with «BASAMENTO ESISTENTE» and no
 *  «antivibranti»; saved and issued, sheet 1 names the existing machine and the base «da rilevare», never «(STIMA)». */
export async function keptProgetto({ page, hydrated, keptUrl }) {
  step('a modernisation keeping the machine: its Progetto draws it on its existing base (round 46)');
  await page.goto(keptUrl);
  await Promise.all([page.waitForURL(/\/progetto\?calc=[a-z0-9]+$/, { timeout: 30000 }), page.click('section[aria-labelledby="calc-progetto"] a[href*="/progetto?calc="]')]);
  await hydrated(page, '#bk-room-W');
  // (the same installation's survey of its machine room starts the drawing: complete; else its data typed)
  await page.waitForSelector('.lift-facts .lift-verdict, .lift-main .missing', { timeout: 60000 });
  const roomBox = page.locator('.lift-form details:has(#bk-room-W)');
  if (!(await roomBox.evaluate((d) => d.open))) await roomBox.locator('summary').first().click();
  if (await page.locator('.lift-main .missing').count()) {
    const room = { W: 3000, D: 3000, shaftX: 500, shaftY: 500, H: 2700, slab: 250, doorAt: 300, doorW: 800, doorH: 2000, panelW: 800, panelD: 300, panelH: 1800 };
    for (const [k, v] of Object.entries(room)) await page.fill(`#bk-room-${k}`, String(v));
    await page.selectOption('#bk-room-doorWall', 'front');
    await projectData({ page, hydrated });
  }
  await page.waitForSelector('#kept-base-note', { timeout: 60000 });
  assert.match(await page.textContent('#kept-base-note'), /Argano esistente \(resta\) sul suo basamento — da rilevare/, 'the existing base said');
  assert.equal(await page.locator('.lift-form .heb-fields, #heb-on').count(), 0, 'no HEB beams to choose');
  await page.selectOption('#bk-room-kept-of', 'frame');
  assert.ok(await page.isDisabled('#auto-L0') && !(await page.isChecked('#auto-L0')), 'L0 locked to the calculation’s');
  assert.match(await page.textContent('#progetto-kept'), /quelle del calcolo/, 'the reason');
  assert.match(await page.textContent('output#L0'), /dal calcolo/, 'L0 «dal calcolo»');
  // a direct pull on the existing falls: the plan's drop set to them
  if (await page.locator('.calata-esistente').count()) await page.click('.calata-esistente');
  await page.click('.lift-main [role="tab"]:has-text("Sezione B-B")');
  await page.waitForFunction(() => /BASAMENTO\s*ESISTENTE/.test(globalThis.document.querySelector('.lift-main .draw-stage svg')?.textContent ?? ''), null, { timeout: 30000 });
  const bb = ((await page.textContent('.lift-main .draw-stage svg')) ?? '').replace(/\s+/g, '');
  assert.ok(bb.includes('BASAMENTOESISTENTE—DARILEVARE') && !/antivibranti/i.test(bb), 'B-B: the existing base, no anti-vibration mounts');
  await page.waitForSelector('.lift-work .savebar button.btn-primary:not([disabled])', { timeout: 60000 });
  await page.fill('.lift-work .savebar input', 'Argano esistente');
  await Promise.all([page.waitForURL(/\/lift-designs\/[a-z0-9]+$/, { timeout: 60000 }), page.click('.lift-work .savebar button.btn-primary')]);
  await documentiOf(page, page.url());
  await page.fill('main form input[maxlength="12"]', 'S.T.');
  await Promise.all([page.waitForURL(/\/drawing-sets\/[a-z0-9]+$/, { timeout: 60000 }), page.click('main form:has(input[maxlength="12"]) button[type="submit"]')]);
  await page.waitForSelector('.sheet-page svg.sheet-svg');
  const sheet1 = ((await page.locator('.sheet-page svg.sheet-svg').first().textContent()) ?? '').replace(/\s+/g, '');
  assert.ok(sheet1.includes('ARGANOESISTENTE') && sheet1.includes('BASAMENTOESISTENTE(DARILEVARE)'), 'sheet 1: the existing machine and its base');
  assert.ok(!/BASAMENTOESISTENTE\(DARILEVARE\)\(STIMA/.test(sheet1) && sheet1.includes('RISULTANTESULBASAMENTOESISTENTE'), 'no estimate on the base, one resultant');
}

/** A calculation as its page shows it: its verdict, its machine and its checks. */
async function shownOf(page, url) {
  await page.goto(url);
  const dd = page.locator('.cartiglio dd');
  return { verdict: await dd.nth(0).textContent(), machine: await dd.nth(3).textContent(), checks: await page.textContent('#checks') };
}

/** The calculation's report among the documents. */
const REL = '.doc-links a[href^="/api/calculations/"][href$="/relazione"]';

/** «Tavole e documenti» of a saved design (round 53: out of the design's page), from the design's page. */
async function documentiOf(page, liftUrl) {
  await page.goto(liftUrl);
  await Promise.all([page.waitForURL(/\/documenti\?design=[a-z0-9]+$/, { timeout: 30000 }), page.click('main .doc-links a[href*="/documenti?design="]')]);
}

async function progettoLoop({ BASE, page, hydrated, liftUrl }) {
  step('calcolo ↔ progetto: what the drawing completes of the calculation, beside it');
  await page.goto(liftUrl);
  await Promise.all([page.waitForURL(/\/progetto\?from=[a-z0-9]+&calc=[a-z0-9]+$/, { timeout: 30000 }), page.click('main .page-head .actions a[href*="/progetto?from="]')]);
  await page.waitForSelector('.lift-work .differenze', { timeout: 60000 });
  assert.match(await page.textContent('.lift-work .differenze'), /Il progetto completa il calcolo[\s\S]*Corsa H/, 'the drawing beside its calculation');

  step('calcolo ↔ progetto: «Modifica nel calcolo argano» brings the drawing’s values, the machine changed and saved');
  await Promise.all([page.waitForURL(/\/calc\?from=[a-z0-9]+&dal=progetto$/, { timeout: 30000 }), page.click('.lift-form .dal-calcolo a[href*="dal=progetto"]')]);
  await hydrated(page, '#Q');
  assert.match(await page.textContent('main .porta-avviso'), /Valori portati dal progetto del[\s\S]*Corsa H/, 'the values brought, listed');
  assert.ok(await page.locator('.calc .badge.progetto').count() > 0, 'marked «dal progetto»');
  const Pn = Number(await page.inputValue('#n_Pn'));
  await page.fill('#n_Pn', String(Pn + 1));
  await page.waitForSelector('.savebar button.primary:not([disabled])');
  await Promise.all([page.waitForURL(/\/calculations\/[a-z0-9]+$/, { timeout: 30000 }), page.click('.savebar button.primary')]);
  const latestUrl = page.url(), latestId = latestUrl.split('/').pop();

  step('calcolo ↔ progetto: the design drawn on the older calculation, drawn again on the latest — the same calculation');
  await page.goto(liftUrl);
  await page.waitForSelector('main .ridisegna');
  await Promise.all([page.waitForURL((u) => /\/lift-designs\/[a-z0-9]+$/.test(u.pathname) && !u.href.startsWith(liftUrl), { timeout: 60000 }),
    page.click('main .ridisegna button[type="submit"]')]);
  const again = page.url();
  assert.notEqual(again, liftUrl, 'a new design');
  assert.equal(await page.locator('main .ridisegna').count(), 0, 'on the latest calculation');
  assert.equal(await page.getAttribute('main .progetto-base a', 'href'), `/it/app/calculations/${latestId}`, 'it names its base');
  await documentiOf(page, again);
  const relHref = await page.getAttribute(REL, 'href');
  const calcId = /\/api\/calculations\/([a-z0-9]+)\/relazione/.exec(relHref ?? '')?.[1];
  // every input the form shows the same, the same results (round 46: the values the form does not show are saved at the
  // engine's own, the drawing's calculation holds the drawing's — their hashes differ, nothing else; calc-saved.ts)
  assert.deepEqual(await shownOf(page, `${BASE}/it/app/calculations/${calcId}`), await shownOf(page, latestUrl), 'the same calculation');
  return { liftUrl: again };
}
