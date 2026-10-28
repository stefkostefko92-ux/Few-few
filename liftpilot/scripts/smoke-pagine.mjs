// The smoke test's pages of an installation one job each (round 53): «Tavole e documenti» of the saved design (the report
// with the plan, the plan in DXF, the Panev bill with the support chosen by hand, the draft order, the export); the
// Simulazione of the saved design (the scenarios with their line, a check's run played from the design's page); the
// Progetto one step at a time in «Semplice» (the step shown, «Avanti», a step chosen in the bar, the checks tab).
import assert from 'node:assert/strict';
import { step } from './smoke-kit.mjs';
import { liftExports } from './smoke-svg.mjs';

/** «Tavole e documenti» of the design just saved: its blocks and documents; returns the links the isolation checks reuse. */
export async function documentiFlow({ BASE, page, projectUrl, reportBytes, orderFiles }) {
  step('«Tavole e documenti»: the blocks, the report with the plan, DXF, the bill, the order, the export');
  await page.goto(`${projectUrl}/documenti`);
  assert.equal(await page.locator('.imp-tabs > li[data-scheda="documenti"] a[aria-current="page"]').count(), 1, 'its tab marked in the bar');
  for (const id of ['doc-tavole', 'doc-calcolo', 'doc-materiali']) assert.equal(await page.locator(`section[aria-labelledby="${id}"]`).count(), 1, id);
  const liftRelHref = await page.getAttribute('.doc-links a[href^="/api/calculations/"][href$="/relazione"]', 'href');
  const liftRel = await page.request.get(`${BASE}${liftRelHref}`);
  assert.equal(liftRel.status(), 200);
  const liftRelBody = await liftRel.body();
  assert.equal(liftRelBody.subarray(0, 5).toString('latin1'), '%PDF-');
  assert.ok(liftRelBody.length > reportBytes, 'the report with the plan is larger');
  const dxfHref = await page.getAttribute('.doc-links a[href^="/api/shaft-designs/"][href$="/dxf"]', 'href');
  const dxfText = await (await page.request.get(`${BASE}${dxfHref}`)).text();
  assert.ok(dxfText.includes('CABINA') && dxfText.trimEnd().endsWith('EOF'), 'DXF with the layer of the car');
  const designUrl = `${BASE}${await page.getAttribute('.doc-links a[href*="/app/shaft-designs/"]', 'href')}`;
  // Panev's brackets: the landing doors' pair, and the counterweight rail support chosen by hand in the Progetto, saved
  await page.waitForSelector('section[aria-labelledby="doc-materiali"] .panev-bom tbody td.code');
  const bill = await page.textContent('section[aria-labelledby="doc-materiali"] .panev-bom');
  assert.match(bill ?? '', /A 65 170 7[\s\S]*B 65 320/, 'door pair in the bill');
  assert.match(bill ?? '', /SU 220 200[\s\S]*SG 80 190/, 'the support chosen by hand, saved');
  // the draft order of the machine the design verified
  assert.match(await page.textContent('main'), /l’argano verificato in questo progetto/, 'the order is for the machine the design verified');
  await orderFiles(page, '/api/lift-designs/');
  // the saved project exported: the drawing set as a draft PDF and its sheets in SVG, every view as DXF and DWG
  await liftExports({ BASE, page });
  return { liftRelHref, dxfHref, designUrl };
}

/** The Simulazione of the saved design: its own page, the scenarios each with its line; a check's «Simula» on the design's
 *  page plays that check's run there. */
export async function simulazioneFlow({ page, projectUrl, liftUrl }) {
  step('Simulazione: its own page on the saved design; a check of the design plays its run there');
  await page.goto(`${projectUrl}/simulazione`);
  assert.equal(await page.locator('.sim-fonte a[aria-current="true"]').count(), 1, 'the saved design, said');
  await page.waitForSelector('.lift-stage.live, .lift-stage.failed', { timeout: 120000 });
  assert.equal(await page.locator('.scenario-tabs button .sc-d').count(), 5, 'each scenario with its line');
  await page.click('.scenario-tabs button[data-scenario="brake"]');
  await page.waitForSelector('.sim-chart svg path.line');
  assert.ok(await page.locator('.lift-checks a, .lift-checks button:has-text("Simula")').count() > 0, 'the checks it replays');
  await page.goto(liftUrl);
  assert.equal(await page.locator('.lift-view .lift-sim').count(), 0, 'no 3D on the design\'s page');
  const sim = page.locator('.lift-checks a:has-text("Simula")').first();
  await Promise.all([page.waitForURL(/\/simulazione\?design=[a-z0-9]+&verifica=[a-z0-9_]+$/i, { timeout: 30000 }), sim.click()]);
  await page.waitForSelector('.scenario-tabs button[aria-selected="true"]');
  assert.notEqual(await page.locator('.scenario-tabs button[aria-selected="true"]').getAttribute('data-scenario'), null, 'the check\'s scenario chosen');
}

/** The Progetto in «Semplice»: one step at a time, «Avanti», a step chosen in the bar, the checks in their tab; then
 *  «Esperto» again for the rest of the run. */
export async function sempliceFlow({ page, hydrated, projectUrl }) {
  step('Progetto in «Semplice»: one step at a time, «Avanti», a step from the bar, the checks in their tab');
  const mode = async (m) => {
    await hydrated(page, '#ws-mode-esperto');
    await page.click(`label[for="ws-mode-${m}"]`);
    await page.waitForSelector(`[data-modalita="${m}"]`);
    await page.waitForTimeout(500);
  };
  await page.goto(`${projectUrl}/progetto`);
  await mode('semplice');
  await page.reload();
  await page.waitForSelector('.lift-form .passo-blocco');
  const shown = () => page.evaluate(() => [...globalThis.document.querySelectorAll('.lift-form .passo-blocco')].filter((b) => !b.hidden).map((b) => b.dataset.passo));
  assert.equal((await shown()).length, 1, 'one step shown');
  const first = (await shown())[0];
  await page.click('.passo-nav .btn-primary');
  await page.waitForFunction((was) => [...globalThis.document.querySelectorAll('.lift-form .passo-blocco')].some((b) => !b.hidden && b.dataset.passo !== was), first);
  assert.notEqual((await shown())[0], first, '«Avanti»: the next step');
  await page.click('.passi-nav a:has-text("Funi")');
  await page.waitForFunction(() => !globalThis.document.querySelector('.lift-form .passo-blocco[data-passo="passo-funi"]')?.hidden);
  assert.deepEqual(await shown(), ['passo-funi'], 'the step chosen in the bar');
  await page.click('.lato-tabs button:has-text("Verifiche")');
  await page.waitForSelector('#lato-verifiche-panel .lift-checks');
  assert.equal(await page.locator('#lato-disegno-panel').isVisible(), false, 'the drawing behind its tab');
  await mode('esperto');
  await page.reload();
  await page.waitForSelector('.lift-form .passo-blocco');
  assert.ok((await shown()).length >= 4, '«Esperto»: every step');
}
