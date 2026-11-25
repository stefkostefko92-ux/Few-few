// The size and the order of the photos in the print, with a preview (public/js/foto-ordine.js,
// foto-righe.js; the owner, 10 November 2026): the ticked photos as a list with "before"/"after", the
// hidden order and the spoken position follow a move, the focus stays on the moved photo, the page counts
// as changed; the preview has more pages one a row than small; the print keeps the order and the size.
// Runs after allegati.mjs (one ready photo in "Quadro"); the worker must run next to the portal.
import { join } from 'node:path';
import sharp from 'sharp';
import { fail } from './helpers.mjs';

const READY_WAIT = 60_000;

export async function checkPhotoOrder(page, { sheetUrl, shots }) {
  const files = [
    [join(shots, 'ordine-largo-e2e.jpg'), 1600, 1200],
    [join(shots, 'ordine-alto-e2e.jpg'), 900, 1200],
  ];
  for (const [file, width, height] of files)
    await sharp({ create: { width, height, channels: 3, background: '#707070' } })
      .jpeg()
      .toFile(file);

  await page.goto(sheetUrl);
  const block = page.locator('[data-allegati="quadro"]');
  await block.locator('summary').click();
  await block.locator('#up-quadro').setInputFiles(files.map(([file]) => file));
  await page.locator('button[form="carica-quadro"]').click();
  try {
    await page.waitForFunction(
      () =>
        document.querySelectorAll('[data-galleria="quadro"] [data-stato="PRONTO"] img').length ===
        3,
      null,
      { timeout: READY_WAIT },
    );
  } catch {
    return fail('photo order: photos not compressed in time — is the worker running?');
  }

  await page.goto(`${sheetUrl}/modifica`);
  await page.click('[data-foto-tutte]');
  const voci = page.locator('[data-foto-ordine] li');
  if ((await voci.count()) !== 3) return fail(`photo order: ${await voci.count()} rows, not 3`);
  const ordine = async () => (await page.inputValue('input[name="fotoOrdine"]')).split(' ');
  const before = await ordine();
  const listed = await voci.evaluateAll((items) =>
    items.map((li) => li.querySelector('[data-sposta]').dataset.id),
  );
  if (listed.join(' ') !== before.join(' '))
    fail('photo order: the list and the hidden order differ');
  if (!(await voci.first().locator('[data-sposta="-1"]').isDisabled()))
    fail('photo order: the first photo can move before itself');

  await voci.first().locator('[data-sposta="1"]').click();
  const after = await ordine();
  if (after.join(' ') !== [before[1], before[0], before[2]].join(' '))
    fail(`photo order: moved wrong (${before} → ${after})`);
  if ((await page.evaluate(() => document.activeElement?.dataset?.id)) !== before[0])
    fail('photo order: the focus left the moved photo');
  if (!(await page.textContent('[data-foto-annuncio]')).includes('posizione 2 di 3'))
    fail('photo order: the move is not announced');
  if (!(await page.locator('[data-dirty-hint]').isVisible()))
    fail('photo order: a move does not mark the sheet as changed');

  const size = (value) =>
    page.locator(`input[name="fotoDimensione"][value="${value}"]`).evaluate((i) => i.click());
  const pages = () => page.locator('[data-foto-anteprima] .foto-anteprima__pagina').count();
  if ((await page.locator('[data-foto-anteprima] .foto-anteprima__foto').count()) !== 3)
    fail('photo order: the preview does not show the three photos');
  await size('PICCOLE');
  const piccole = await pages();
  await size('UNA');
  const una = await pages();
  if (!(piccole === 1 && una > piccole))
    fail(`photo order: preview pages small ${piccole}, one a row ${una}`);
  await page
    .locator('.foto-disposizione')
    .screenshot({ path: join(shots, 'light-foto-ordine-una.png') });
  await size('GRANDI');
  await page
    .locator('.foto-disposizione')
    .screenshot({ path: join(shots, 'light-foto-ordine-grandi.png') });

  await page.click('.actions button[type=submit]');
  await page.waitForURL(/\/schede\/[a-z0-9]+$/);
  await page.goto(`${sheetUrl}/stampa`);
  if (!(await page.locator('.paper__foto-grid--grandi').count()))
    fail('photo order: the print does not have the size chosen');
  // An annotated photo is printed as an SVG with the photo inside (C5): both count, in the order of the sheet.
  const printed = await page
    .locator('.paper__foto .paper__figura :is(img, .paper__foto-annotata image)')
    .evaluateAll((els) =>
      els.map(
        (el) =>
          /\/allegati\/([a-z0-9]+)\?mini=1/.exec(
            el.getAttribute('src') ?? el.getAttribute('href') ?? '',
          )?.[1],
      ),
    );
  if (printed.join(' ') !== after.join(' '))
    fail(`photo order: printed ${printed}, chosen ${after}`);
}
