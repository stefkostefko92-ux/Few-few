// Photos and videos of a section in a real browser (public/js/allegati.js, carica.js): the upload folded
// under "Aggiungi foto o video", a phone photo made smaller (and upright) before it is sent, sent in the
// background with its progress, the tile that waits for the compression and turns into the photo (the
// worker must run next to the portal: `npm run worker`), a caption saved with Enter on the edit page
// without marking the sheet as changed, a file deleted after the browser's own confirmation, and the
// photos chosen for the print as icons at the end of the form (stampa-foto.js: "all", "none", the count,
// the mark of a section out of the print, the icons again after a change in a gallery).
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { fail } from './helpers.mjs';

const READY_WAIT = 60_000;

export async function checkAttachments(page, { sheetUrl, shots }) {
  // A 12 Mpx phone photo held upright (landscape pixels, EXIF orientation 6) and a small one.
  const phone = join(shots, 'quadro-e2e.jpg');
  await sharp({
    create: {
      width: 4032,
      height: 3024,
      channels: 3,
      noise: { type: 'gaussian', mean: 128, sigma: 12 },
    },
  })
    .jpeg({ quality: 92 })
    .withMetadata({ orientation: 6 })
    .toFile(phone);
  const small = join(shots, 'targa-e2e.jpg');
  await sharp({ create: { width: 1200, height: 900, channels: 3, background: '#c05020' } })
    .jpeg()
    .toFile(small);
  const files = [phone, small];

  await page.goto(sheetUrl);
  const block = page.locator('[data-allegati="quadro"]');
  await block.locator('summary').click();
  await block.locator('input[type=file]').setInputFiles(files);
  await block.locator('input[name=didascalia]').fill('Quadro, lato sinistro');
  // What the page really sends: the files of the request's form.
  await page.evaluate(() => {
    const send = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function (body) {
      if (body instanceof FormData)
        window.sentFiles = [...body.values()].filter((v) => v instanceof File).map((f) => f.size);
      return send.call(this, body);
    };
  });
  await page.locator('button[form="carica-quadro"]').click();
  await page.waitForFunction(() => Array.isArray(window.sentFiles));
  const [phoneSent, smallSent] = await page.evaluate(() => window.sentFiles);
  const [phoneSize, smallSize] = await Promise.all(
    files.map(async (file) => (await stat(file)).size),
  );
  if (!(phoneSent < phoneSize / 2))
    fail(`the phone photo was not made smaller before upload (${phoneSent} of ${phoneSize})`);
  if (smallSent !== smallSize) fail('a photo already small enough was changed before upload');
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
  const upright = await page
    .locator('[data-galleria="quadro"] [data-stato="PRONTO"] img')
    .first()
    .evaluate((img) => img.decode().then(() => img.naturalHeight > img.naturalWidth));
  if (!upright) fail('the phone photo held upright is not upright');

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

  // The photos on the print: icons at the end of the form. The deleted photo leaves them too (the
  // icons come again after a change in a gallery); none is ticked until chosen.
  const icons = page.locator('[data-foto-stampa] input[name="fotoStampa"]');
  const counted = () => page.textContent('[data-foto-conteggio]');
  await page.waitForFunction(
    () => document.querySelectorAll('[data-foto-stampa] input[name="fotoStampa"]').length === 1,
  );
  if ((await icons.first().isChecked()) || !(await counted()).startsWith('0 di 1'))
    fail('a new photo is ticked for the print before anyone chose it');
  await page.click('[data-foto-tutte]');
  if (!(await icons.first().isChecked()) || !(await counted()).startsWith('1 di 1'))
    fail('"select all" did not tick the photo');
  await page.click('[data-foto-nessuna]');
  if (await icons.first().isChecked()) fail('"none" left the photo ticked');
  await icons.first().check();
  // A section out of the print is marked at once, and back.
  const group = page.locator('[data-foto-stampa] [data-sezione="quadro"]');
  const toggle = () => page.locator('input[name=stampa][value=quadro]').evaluate((i) => i.click());
  await toggle();
  if ((await group.getAttribute('data-esclusa')) === null) fail('section out of print not marked');
  await toggle();
  if ((await group.getAttribute('data-esclusa')) !== null) fail('mark stays on a printed section');
  await page.click('.actions button[type=submit]');
  await page.waitForURL(/\/schede\/[a-z0-9]+$/);
  await page.goto(`${sheetUrl}/stampa`);
  if (!(await page.locator('.paper__foto .paper__figura img').count()))
    fail('print without the photos of the sections');
  if (!(await page.textContent('.paper__foto')).includes('Targa del quadro'))
    fail('print without the caption');
}
