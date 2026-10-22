// The sketch pad in a real browser (public/js/schizzi.js, schizzo-editor.js): the MASTER turns it on for
// the company, a new sheet opens the full-screen editor, a stroke with the pen, a line, a rectangle and a
// text, a stroke rubbed out, undo and redo; "Done" gives the sheet back to the form (preview, unsaved
// changes), the sheet is saved, shown, printed; the editor and the block pass the accessibility audit.
import { join } from 'node:path';
import { audit, fail } from './helpers.mjs';

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
  const canvas = dialog.locator('canvas');
  // `bend`: how far the stroke bows from the straight line (a hand-drawn stroke is never straight).
  const drag = async (from, to, steps = 8, bend = 0) => {
    const box = await canvas.boundingBox();
    const at = ([fx, fy]) => [box.x + box.width * fx, box.y + box.height * fy];
    await page.mouse.move(...at(from));
    await page.mouse.down();
    for (let i = 1; i <= steps; i += 1) {
      const f = i / steps;
      const y = from[1] + (to[1] - from[1]) * f + Math.sin(f * Math.PI) * bend;
      await page.mouse.move(...at([from[0] + (to[0] - from[0]) * f, y]));
    }
    await page.mouse.up();
  };
  const pick = (name, value) => dialog.locator(`label[for="schizzo-${name}-${value}"]`).click();
  await pick('colore', 'r');
  await drag([0.1, 0.2], [0.4, 0.35], 16, 0.08);
  await pick('colore', 'b');
  await pick('strumento', 'linea');
  await drag([0.1, 0.8], [0.9, 0.8]);
  await pick('strumento', 'rettangolo');
  await drag([0.55, 0.15], [0.85, 0.55]);
  await pick('strumento', 'testo');
  await page.waitForTimeout(100);
  const box = await canvas.boundingBox();
  await page.mouse.click(box.x + box.width * 0.12, box.y + box.height * 0.7);
  await dialog.locator('#schizzo-testo').fill('Vano 1600 × 1400');
  await dialog.locator('#schizzo-testo').press('Enter');
  await pick('strumento', 'penna');
  await drag([0.3, 0.6], [0.4, 0.62], 4);
  await pick('strumento', 'gomma');
  await drag([0.3, 0.6], [0.4, 0.62], 4);
  await dialog.locator('[data-schizzo-annulla]').click();
  await dialog.locator('[data-schizzo-ripeti]').click();
  await dialog.screenshot({ path: join(shots, `${scheme}-sketch-editor.png`) });
  await dialog.locator('[data-schizzo-fatto]').click();
  await dialog.waitFor({ state: 'hidden' });

  const items = block.locator('[data-foglio]');
  if ((await items.count()) !== before + 1) fail('sketches: the new sheet is not in the list');
  const sheet = JSON.parse(await items.last().locator('[data-foglio-dati]').inputValue());
  const kinds = sheet.e.map((el) =>
    el.t === 'x'
      ? 'text'
      : el.d.endsWith('z')
        ? 'rect'
        : /^M\d+ \d+l-?\d+ -?\d+$/.test(el.d)
          ? 'line'
          : 'pen',
  );
  if (kinds.join() !== 'pen,line,rect,text')
    fail(`sketches: the sheet holds ${kinds.join() || 'nothing'} (pen, line, rect, text expected)`);
  if (!(await page.locator('[data-dirty-hint]').isVisible()))
    fail('sketches: a drawn sheet does not mark the sheet as changed');
  await audit(page, `${scheme} sketch block`);

  await page.click('.actions button[type=submit]');
  await page.waitForURL(sheetUrl);
  if ((await page.locator('#s-schizzi svg.schizzo').count()) !== before + 1)
    fail('sketches: the sheet page does not show them');
  await page.goto(`${sheetUrl}/stampa`);
  if (!(await page.locator('.paper__schizzi text', { hasText: 'Vano 1600 × 1400' }).count()))
    fail('sketches: the print does not show the text');
}
