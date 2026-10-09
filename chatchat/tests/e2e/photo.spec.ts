import { expect, test } from '@playwright/test';
import { jpegSized } from '../file-fixtures.js';
import { db } from '../integration/helpers.js';
import { PHOTO_CODE } from './support/constants.js';
import { cookieLogin, newPortalUser } from './support/world.js';

/**
 * Поток (б): снимка — качване на JPEG (антивирусът я пуска), привързване към въпроса, отговорът
 * показва наблюденията по нея. Снимката е допълваща: не е цитат и не вдига нивото на доказателствата.
 */
test('снимка: качване, привързване към въпроса, наблюдения в отговора', async ({
  page,
  context,
}) => {
  const user = await newPortalUser('Paolo Foto');
  await cookieLogin(context, user);
  await page.goto('/');

  await page.getByRole('button', { name: 'Nuovo caso' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Nuovo caso' });
  await dialog.getByLabel('Modello').fill('LTX-500');
  await dialog.getByLabel('Revisione HW').fill('B');
  await dialog.getByLabel('Firmware').fill('4.2');
  await dialog.getByLabel('Codice errore').fill('E37');
  await dialog.getByRole('button', { name: 'Crea caso' }).click();

  // Качване от „галерията“: избор на файл (JPEG по магическите байтове).
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Scegli dalla galleria' }).click();
  await (
    await chooser
  ).setFiles({
    name: 'display.jpg',
    mimeType: 'image/jpeg',
    buffer: jpegSized(1600, 1200),
  });
  const tray = page.getByRole('list', { name: 'File da inviare' });
  await expect(tray).toContainText('Controllato e pronto');

  await page.getByLabel('Descriva cosa vede sul quadro').fill('Guardi la foto del display');
  await page.getByRole('button', { name: 'Invia' }).click();

  const answer = page.getByRole('log', { name: 'Conversazione' }).getByRole('article').last();
  const photos = answer.locator('.blk-photos');
  await expect(photos).toContainText('Cosa si vede nelle foto');
  await expect(photos).toContainText('display');
  await expect(photos).toContainText(PHOTO_CODE);
  await expect(photos).toContainText('leggibile');

  // Само тази снимка е стигнала до модела — и е записана като привързана към въпроса.
  const attachment = await db.attachment.findFirstOrThrow({
    where: { uploadedById: user.id },
  });
  expect(attachment.scanStatus).toBe('CLEAN');
  expect(attachment.caseMessageId).not.toBeNull();
});
