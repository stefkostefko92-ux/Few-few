// The sketch pad in a real browser (public/js/schizzi.js, schizzo-*.js): the MASTER turns it on for the
// company, a new sheet opens the full-screen editor, every tool draws (schizzi-strumenti.mjs); "Done"
// gives the sheet back to the form (preview, unsaved changes) with the text still being typed, the sheet
// is drawn again (schizzi-tastiera.mjs), saved, shown, printed; the editor (with a menu open) and the
// block pass the accessibility audit; the layouts of a tablet and of a phone on its side.
import { join } from 'node:path';
import { audit, fail } from './helpers.mjs';
import { drawEverything } from './schizzi-strumenti.mjs';
import { checkKeyboard, checkLayouts, checkReopened, selectCircle } from './schizzi-tastiera.mjs';

export async function checkSketches(page, { base, aziendaPath, sheetUrl, shots, scheme }) {
  await page.goto(base + aziendaPath);
  const toggle = page.locator('form[action$="/schizzi"] button');
  if (!(await toggle.textContent()).includes('Disattiva')) {
    await toggle.click();
    await page.waitForURL(base + aziendaPath);
  }
  if (!(await page.locator('form[action$="/schizzi"] button').textContent()).includes('Disattiva'))
    fail('sketches: the company did not turn them on');

  await page.goto(`${sheetUrl}/modifica`);
  const block = page.locator('#s-schizzi');
  if (!(await block.isVisible())) return fail('sketches: no block in the form');
  const before = await block.locator('[data-foglio]').count();
  await block.locator('[data-schizzi-nuovo]').click();
  const dialog = page.locator('[data-schizzo-editor]');
  await dialog.waitFor({ state: 'visible' });
  await audit(page, `${scheme} sketch editor`);
  const shapes = dialog.locator('details[data-schizzo-menu="forme"] summary');
  await shapes.click();
  await audit(page, `${scheme} sketch editor, shapes menu`);
  await shapes.click();
  await drawEverything(page, dialog);
  await dialog.screenshot({ path: join(shots, `${scheme}-sketch-editor.png`) });
  await dialog.locator('[data-schizzo-fatto]').click();
  await dialog.waitFor({ state: 'hidden' });

  // Drawn again: the menus from the keyboard (a shape chosen), then something selected — each time the
  // editor opens again clean; nothing changed — the sheet stays.
  const reopen = async () => {
    await block.locator('[data-foglio]').last().locator('[data-foglio-disegna]').click();
    await dialog.waitFor({ state: 'visible' });
  };
  const done = async () => {
    await dialog.locator('[data-schizzo-fatto]').click();
    await dialog.waitFor({ state: 'hidden' });
  };
  await reopen();
  await checkKeyboard(page, dialog, reopen);
  await done();
  await reopen();
  await checkReopened(page, dialog);
  await selectCircle(page, dialog);
  await done();
  await reopen();
  await checkReopened(page, dialog);
  await done();

  const items = block.locator('[data-foglio]');
  if ((await items.count()) !== before + 1) fail('sketches: the new sheet is not in the list');
  const sheet = JSON.parse(await items.last().locator('[data-foglio-dati]').inputValue());
  const kinds = new Set(sheet.e.map((el) => el.t));
  for (const kind of ['p', 'q', 'e', 'a', 's', 'x']) {
    if (!kinds.has(kind)) fail(`sketches: the form got no element of kind ${kind}`);
  }
  if (!(await page.locator('[data-dirty-hint]').isVisible()))
    fail('sketches: a drawn sheet does not mark the sheet as changed');
  await audit(page, `${scheme} sketch block`);

  await page.click('.actions button[type=submit]');
  await page.waitForURL(sheetUrl);
  if ((await page.locator('#s-schizzi svg.schizzo').count()) !== before + 1)
    fail('sketches: the sheet page does not show them');
  await checkLayouts(page, `${sheetUrl}/modifica`);
  await page.goto(`${sheetUrl}/stampa`);
  for (const text of ['Vano 1600 × 1400', '1600', 'Ø 600', 'Pistone']) {
    if (!(await page.locator('.paper__schizzi text', { hasText: text }).count()))
      fail(`sketches: the print does not show "${text}"`);
  }
}
