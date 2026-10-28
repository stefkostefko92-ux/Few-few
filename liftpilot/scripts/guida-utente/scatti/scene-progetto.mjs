// Scenes of the guide's screenshots: the Progetto of the first installation (the shaft measured on a DXF, the data step
// by step as «Semplice» shows them, the drawings with their dimensions, the checks in their tab), its Simulazione and the
// saved design; the second installation with the machine above (its machine room's survey, then the Progetto with the
// room).
import assert from 'node:assert/strict';
import { step } from '../../smoke-kit.mjs';
import { BASE, S, as, fresh, goto, hydrated, inVista, skip, want } from './ambiente.mjs';
import { shaftDxf, sketchPng } from './disegni.mjs';
import { saveCalc } from './scene-rilievi.mjs';
import { shot, wideClip } from './scatto.mjs';

/** The project data still to enter on /progetto, typed as in scripts/smoke-blank.mjs: the shaft (unless measured on the
 *  drawing), one entrance with a telescopic door, the walls, the floors with their rises, pit and headroom — each step
 *  shown first, as «Semplice» shows one at a time. */
async function projectData(page, { shaft = true, bottom = null, walls = true } = {}) {
  const choose = (id) => page.click(`label:has(> #${id})`);
  await hydrated(page, '#bk-entrances');
  await inVista(page, '#bk-entrances');
  if (shaft) { await page.fill('#bk-W', '1600'); await page.fill('#bk-D', '1750'); }
  await choose('bk-entrances');
  await choose('bk-door');
  await page.fill('#bk-doorWidth', '800');
  await page.fill('#bk-doorHeight', '2000');
  if (walls) { await choose('bk-cw'); await page.fill('#bk-wall', '200'); }
  await page.selectOption('#bk-access', 'dm236_existing');
  await inVista(page, '#bk-pit');
  await page.fill('#bk-pit', '1400');
  await page.fill('#bk-headroom', '3700');
  await page.fill('#bk-floors', '5');
  await page.press('#bk-floors', 'Enter');
  for (let i = 0; i < 4; i++) await page.fill(`#bk-rise-${i}`, '3000');
  await page.check('#bk-main');
  if (bottom) { await inVista(page, '#bottom-scheme'); await page.selectOption('#bottom-scheme', bottom); }
  await page.waitForSelector('.lift-facts .lift-verdict', { timeout: 60000 }).catch(async (e) => {
    throw new Error(`${e.message}\nstill to enter: ${(await page.locator('.panel.missing').allInnerTexts()).join(' | ')}`);
  });
}

/** From a saved calculation's page to the Progetto drawn on it. */
async function toProgetto(page, calc) {
  await goto(page, calc);
  await Promise.all([page.waitForURL(/\/progetto\?calc=[a-z0-9]+$/, { timeout: 30000 }), page.click('section[aria-labelledby="calc-progetto"] a[href*="/progetto?calc="]')]);
}

export async function p1progetto() {
  step('the Progetto of the first installation: empty, the shaft measured on a drawing, the data, the drawings, the checks');
  const { page, errors } = await as('chief');
  await toProgetto(page, S.calc1);
  await hydrated(page, '#bk-W');
  await shot('progetto-vuoto', page);

  // the shaft measured on the drawing (a DXF, read in the browser): a click inside the shaft, the landing doors below
  await page.click('details.survey > summary');
  await page.setInputFiles('.survey input[type="file"]', { name: 'vano-via-dei-mille.dxf', mimeType: 'application/dxf', buffer: shaftDxf() });
  await page.waitForSelector('.survey .cad-canvas canvas');
  const canvas = page.locator('.survey .cad-canvas');
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForSelector('.survey [role="status"]:has-text("1600")');
  await page.click('.survey label:has(input[value="down"])');
  await shot('progetto-cad', page, { tall: true, clipFn: () => wideClip(page, [page.locator('details.survey')]) });

  await projectData(page, { shaft: false, bottom: 'head' });
  await page.waitForSelector('.lift-main svg.sheet-svg');
  // «Piani, fossa e testata»: the section's title down to the stops' table (its step shown)
  await inVista(page, 'details.vertical-options');
  const vertical = page.locator('details.vertical-options');
  if (!(await vertical.evaluate((d) => d.open))) await vertical.locator('summary').first().click();
  await shot('progetto-piani-fermate', page, { tall: true, clipFn: () => wideClip(page, [page.locator('h2.sec-title:has-text("Piani, fossa e testata")'), page.locator('details.vertical-options table').first()], 16, 290, 520) });

  // the drawings: the plan with its dimensions, one fixed by hand, another opened for editing
  const drawings = page.locator('section.panel:has(#lift-plan-title)');
  await drawings.scrollIntoViewIfNeeded();
  await shot('quote-pianta', drawings, { pad: 8 });
  const hit = page.locator('.lift-main .ed-hits .hit[aria-label*="Piattaforma: distanza dalla parete sinistra"]').first();
  const was = Number(/^(\d+)/.exec((await hit.getAttribute('aria-label')) ?? '')?.[1]);
  await hit.click();
  await page.fill('.lift-main .ed-pop input', String(was + 20));
  await page.press('.lift-main .ed-pop input', 'Enter');
  await page.waitForSelector('.lift-main table.fixes tr.hand');
  await page.locator('.lift-main .ed-hits .hit[aria-label*="Porta di piano A: inizio della luce"]').first().click();
  await page.waitForSelector('.lift-main .ed-pop input');
  await shot('quote-campo', drawings, { pad: 8 });
  await shot('progetto-editor', drawings, { pad: 8 });
  await page.keyboard.press('Escape');

  // the checks in their tab beside the drawing: the problems first, each with its «Simula»
  await page.click('.lato-tabs button:has-text("Verifiche")');
  const checks = page.locator('#lato-verifiche-panel #checks');
  await checks.waitFor();
  await page.locator('.lato-tabs').scrollIntoViewIfNeeded();
  await shot('progetto-verifiche', page, { clipFn: async () => wideClip(page, [page.locator('.lato-tabs'), checks.locator('details.checks-others > summary')], 18, 740, 700) });
  await page.click('.lato-tabs button:has-text("Disegno")');

  // saved: the design and, from it, the shaft's design
  await page.fill('.lift-work .savebar input', 'Progetto Via dei Mille 12');
  await page.waitForSelector('.lift-work .savebar button.btn-primary:not([disabled])', { timeout: 60000 });
  await Promise.all([page.waitForURL(/\/lift-designs\/[a-z0-9]+$/, { timeout: 60000 }), page.click('.lift-work .savebar button.btn-primary')]);
  S.lift1 = page.url();
  await page.waitForSelector('.lift-view .lift-facts');
  await shot('lift-designs', page, { clip: { x: 0, y: 0, width: 1440, height: 1200 } });
  // its documents' page: the shaft's design from there
  await Promise.all([page.waitForURL(/\/documenti\?design=/), page.click('main .doc-links a[href*="/documenti?design="]')]);
  await goto(page, `${BASE}${await page.getAttribute('.doc-links a[href*="/app/shaft-designs/"]', 'href')}`);
  await page.waitForSelector('dl.cartiglio');
  await shot('shaft-designs', page, { clip: { x: 0, y: 0, width: 1440, height: 1200 } });

  // the Simulazione of the saved design (its own page, round 53), in a page of its own that draws WebGL as a graphics card
  // would (slow: nothing else runs in it); the stage starts once it is on screen
  if (want('progetto-3d') || want('simulazione-pagina')) {
    await goto(page, S.lift1);
    const sim = `${BASE}${await page.getAttribute('main .doc-links a[href*="/simulazione?design="]', 'href')}`;
    const g = await fresh(await page.context().storageState(), true);
    try {
      await goto(g.page, sim);
      await g.page.locator('.lift-stage').first().scrollIntoViewIfNeeded();
      const live = await g.page.waitForSelector('.lift-stage.live, .lift-stage.failed', { timeout: 150000 }).then((e) => e.evaluate((el) => el.classList.contains('live'))).catch(() => false);
      if (live) {
        await g.page.locator('.lift-sim button:has-text("Cabina")').first().click();
        await g.page.click('.scenario-tabs button[data-scenario="brake"]');
        await g.page.waitForSelector('.sim-chart svg path.line');
        // the page first: the element's shot taller than the window resizes the surface, and the software WebGL loses
        // its context there (the stage then says the 3D is not available)
        await g.page.evaluate(() => globalThis.scrollTo(0, 0));
        await g.page.waitForTimeout(600);
        await shot('simulazione-pagina', g.page, { clip: { x: 0, y: 0, width: 1440, height: 1100 } });
        await shot('progetto-3d', g.page.locator('section.lift-sim'), { pad: 8 });
      } else skip(['progetto-3d', 'simulazione-pagina'], 'the 3D view could not be drawn in this browser');
    } finally { await g.ctx.close(); }
  }
  assert.deepEqual(errors, [], 'browser errors');
}

/** The survey of the machine room typed measure by measure (smoke-blank.mjs blankSurvey). */
async function typeRoom(page) {
  await hydrated(page, '#bk-room-W');
  const typed = { 'room-W': 3000, 'room-D': 3000, 'room-shaftX': 500, 'room-shaftY': 500, 'room-H': 2700, 'room-slab': 250, 'room-doorAt': 300, 'room-doorW': 800,
    'room-doorH': 2000, 'room-panelAt': 1900, 'room-panelW': 800, 'room-panelD': 300, 'room-panelH': 1800, 'shaft-W': 1600, 'shaft-D': 1750, 'shaft-wall': 200,
    'car-x': 800, 'car-y': 575, 'cw-x': 800, 'cw-y': 1175 };
  for (const [k, v] of Object.entries(typed)) await page.fill(`#bk-${k}`, String(v));
  await page.selectOption('#bk-room-doorWall', 'front');
  await page.selectOption('#bk-room-panelWall', 'rear');
  await page.waitForSelector('main .missing', { state: 'detached' });
}

export async function p2() {
  step('second installation: «Residenza Le Querce», the machine above, its machine room, the Progetto with the room');
  const { page, errors } = await as('chief');
  await goto(page, '/it/app/projects/new');
  await hydrated(page, 'main form button[type="submit"]');
  for (const [k, v] of Object.entries({ name: 'Residenza Le Querce', plantNumber: '0398221', address: 'Via Zambianchi 8', city: 'Bergamo', province: 'BG', client: 'Condominio Le Querce' })) await page.fill(`input[name="${k}"]`, v);
  await Promise.all([page.waitForURL(/\/projects\/[a-z0-9]+\/calc$/), page.click('main form button[type="submit"]')]);
  const projectId = page.url().replace(/\/calc$/, '').split('/').pop();
  await hydrated(page, '#Q');
  await page.click('.controls button:has-text("Esempio C")');
  await page.waitForSelector('.verdict .big');
  await page.click('.parti-sino li[data-part="ropes"] label:has-text("Sì")');
  await page.waitForSelector('.parti-sino li[data-part="ropes"] label.on:has-text("Sì")');
  const calc = await saveCalc(page);
  // the sketches of the survey: drawn here, uploaded as the installation's sketches (shaft, machine room)
  for (const [component, title, w, h] of [['locale', 'Schizzo del locale macchina', 640, 480], ['vano', 'Schizzo del vano', 600, 450]]) {
    const r = await page.request.post(`${BASE}/api/projects/${projectId}/allegati`, { headers: { Origin: BASE },
      multipart: { kind: 'SCHIZZO', component, title, file: { name: `schizzo-${component}.png`, mimeType: 'image/png', buffer: sketchPng(w, h) } } });
    assert.ok([200, 201].includes(r.status()), `sketch ${component}`);
  }
  await goto(page, calc);
  await Promise.all([page.waitForURL(/\/calculations\/[a-z0-9]+\/locale$/), page.click('section[aria-labelledby="calc-progetto"] a[href$="/locale"]')]);
  await typeRoom(page);
  await page.waitForSelector('figure.sheet-view .draw-stage svg');
  await page.waitForSelector('.schizzo-panel[data-schizzi="locale"] .schizzo-view img');
  await shot('locale-form', page, { clip: { x: 0, y: 0, width: 1440, height: 1200 } });
  await page.fill('section[aria-labelledby="room-save"] input', 'Rilievo locale Le Querce');
  await Promise.all([page.waitForURL(/\/room-designs\/[a-z0-9]+$/, { timeout: 60000 }), page.click('section[aria-labelledby="room-save"] button.btn-primary')]);
  await page.waitForSelector('figure.sheet-view .draw-stage svg');
  await shot('locale-saved', page, { clip: { x: 0, y: 0, width: 1440, height: 1200 } });
  // the Progetto on it: the room of the survey carried over, the room's options opened
  await toProgetto(page, calc);
  await projectData(page, { shaft: false, walls: false });
  await page.waitForSelector('.lift-main svg.sheet-svg');
  if (await page.locator('.lift-form details.room-options').count()) await inVista(page, '.lift-form details.room-options');
  await page.evaluate(() => { const d = globalThis.document.querySelector('.lift-form details.room-options'); if (d) d.open = true; });
  const room = page.locator('.lift-form details.room-options');
  if (await room.count()) await shot('progetto-locale', page, { tall: true, clipFn: () => wideClip(page, [room], 16, 290, 520) });
  else skip('progetto-locale', 'no «Locale macchina sopra il vano» block on the Progetto of this installation');
  // the survey sheet of the same matricola now suggests this installation
  await goto(page, S.sheets[1]);
  await page.waitForSelector('#collegamento .lk-offer');
  await shot('rilievi-scheda-collegamento', page.locator('#collegamento'), { pad: 10 });
  assert.deepEqual(errors, [], 'browser errors');
}
