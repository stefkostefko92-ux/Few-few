// Annotations on a photo in a real browser (the owner, 12 November 2026 — point C5): "Annota" on a tile of
// the form opens the sketch editor full screen over the photo; a red line drawn and "Fatto" save it on its
// own (the sheet is not marked as changed) and the tile shows the drawing.
import { audit, fail } from './helpers.mjs';

export async function annotatePhoto(page, tile, { scheme }) {
  const name = `${scheme} annotations`;
  const hintBefore = await page.locator('[data-dirty-hint]').isHidden();
  await tile.locator('[data-annota]').click();
  const dialog = page.locator('[data-schizzo-editor]');
  await dialog.waitFor({ state: 'visible' });
  const title = (await dialog.locator('h2, [data-schizzo-titolo]').first().textContent())?.trim();
  if (title !== 'Annotazioni sulla foto') fail(`${name}: editor title is "${title}"`);
  const photo = await page.evaluate(() => Boolean(window.rilieviSchizzo.sfondo.immagine));
  if (!photo) fail(`${name}: the photo is not under the sheet`);
  await audit(page, `${name} editor`);
  await dialog.locator('details[data-schizzo-menu="stile"] summary').click();
  await dialog.locator('label[for="schizzo-colore-r"]').click();
  await dialog.locator('details[data-schizzo-menu="stile"] summary').click();
  await dialog.locator('label[for="schizzo-strumento-linea"]').click();
  const box = await dialog.locator('canvas').boundingBox();
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.4);
  await page.mouse.down();
  for (let i = 1; i <= 8; i += 1)
    await page.mouse.move(
      box.x + box.width * (0.3 + i * 0.04),
      box.y + box.height * (0.4 + i * 0.02),
    );
  await page.mouse.up();
  await dialog.locator('[data-schizzo-fatto]').click();
  await dialog.waitFor({ state: 'hidden' });
  await tile
    .locator('.galleria__media .annotazioni')
    .waitFor({ timeout: 5000 })
    .catch(() => {
      fail(`${name}: the tile does not show the drawing`);
    });
  if (
    (await tile.locator('[data-annota] span').first().textContent())?.trim() !==
    'Modifica le annotazioni'
  )
    fail(`${name}: the button does not say the photo is annotated`);
  if ((await page.locator('[data-dirty-hint]').isHidden()) !== hintBefore)
    fail(`${name}: annotating marked the sheet as changed`);
}
