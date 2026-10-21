// Photos and videos of a section in a real browser (public/js/allegati.js): the upload folded under
// "Aggiungi foto o video", sent in the background with its progress, the tile that waits for the
// compression and turns into the photo (the worker must run next to the portal: `npm run worker`), a
// caption saved with Enter on the edit page without marking the sheet as changed, a file deleted after
// the browser's own confirmation, and the photos on the print when the sheet asks for them.
import { join } from 'node:path';
import sharp from 'sharp';
import { fail, tick } from './helpers.mjs';

const READY_WAIT = 60_000;

export async function checkAttachments(page, { sheetUrl, shots }) {
  const files = [];
  for (const [name, colour] of [
    ['quadro-e2e.jpg', '#2050c0'],
    ['targa-e2e.jpg', '#c05020'],
  ]) {
    const file = join(shots, name);
    await sharp({ create: { width: 1200, height: 900, channels: 3, background: colour } })
      .jpeg()
      .toFile(file);
    files.push(file);
  }

  await page.goto(sheetUrl);
  const block = page.locator('[data-allegati="quadro"]');
  await block.locator('summary').click();
  await block.locator('input[type=file]').setInputFiles(files);
  await block.locator('input[name=didascalia]').fill('Quadro, lato sinistro');
  await page.locator('button[form="carica-quadro"]').click();
  await page.waitForFunction(
    () => document.querySelectorAll('[data-galleria="quadro"] [data-allegato]').length === 2,
  );
  if (!(await page.textContent('[data-avvisi="quadro"]')).includes('File caricati: 2'))
    fail('upload without its message');
  if (await block.locator('details[open]').count()) fail('upload stays open after it went in');
  try {
    await page.waitForFunction(
      () =>
        document.querySelectorAll('[data-galleria="quadro"] [data-stato="PRONTO"] img').length ===
        2,
      null,
      { timeout: READY_WAIT },
    );
  } catch {
    fail('photos not compressed in time — is the worker running (npm run worker)?');
    return;
  }

  // The edit page: Enter in the second caption saves that one, and the sheet is not "changed" by it.
  await page.goto(`${sheetUrl}/modifica`);
  const hintBefore = await page.locator('[data-dirty-hint]').isHidden();
  const second = page.locator('[data-galleria="quadro"] [data-allegato]').nth(1);
  const id = await second.getAttribute('data-allegato');
  await second.locator('input[type=text]').fill('Targa del quadro');
  await second.locator('input[type=text]').press('Enter');
  await page.waitForFunction(() =>
    (document.querySelector('[data-avvisi="quadro"]')?.textContent || '').includes('salvata'),
  );
  if ((await page.inputValue(`#d-${id}`)) !== 'Targa del quadro') fail('caption not kept');
  if ((await page.locator('[data-dirty-hint]').isHidden()) !== hintBefore)
    fail('a caption marked the sheet as changed');

  // Deleting asks first (the browser's dialog) and takes the tile away.
  page.once('dialog', (dialog) => dialog.accept());
  await page
    .locator('[data-galleria="quadro"] [data-allegato]')
    .first()
    .locator('a[data-elimina]')
    .click();
  await page.waitForFunction(
    () => document.querySelectorAll('[data-galleria="quadro"] [data-allegato]').length === 1,
  );

  // The photos on the print: only with the tick at the end of the form.
  await tick(page, 'stampaFoto', 'si');
  await page.click('.actions button[type=submit]');
  await page.waitForURL(/\/schede\/[a-z0-9]+$/);
  await page.goto(`${sheetUrl}/stampa`);
  if (!(await page.locator('.paper__foto .paper__figura img').count()))
    fail('print without the photos of the sections');
  if (!(await page.textContent('.paper__foto')).includes('Targa del quadro'))
    fail('print without the caption');
}
