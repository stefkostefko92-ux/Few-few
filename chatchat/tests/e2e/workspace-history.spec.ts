import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { MAGIC } from '../file-fixtures.js';
import { db } from '../integration/helpers.js';
import { apiAs, cookieLogin, newStaff } from './support/world.js';

/**
 * Работното пространство (FR-16, §12.1): търсене в историята → отваряне на съобщението в
 * контекста му (и когато е далеч назад — извън първата страница); прикачен файл в директен
 * разговор, свален от другия участник.
 */

test('търсене: намира старо съобщение, подчертава думата и го отваря в контекст', async ({
  browser,
}) => {
  const sara = await newStaff('SUPPORT', 'Sara Ricerca');
  const enzo = await newStaff('ENGINEERING', 'Enzo Ricerca');
  const api = await apiAs(sara);
  const created = await api.post('/api/v1/conversations', { type: 'DIRECT', userId: enzo.id });
  expect(created.status).toBe(201);
  const dm = created.body.conversation.id as string;
  const post = (text: string) =>
    api.post(`/api/v1/conversations/${dm}/messages`, { text, clientMessageId: randomUUID() });
  const target = await post('Il contattore KM2 della Città vibra a ogni partenza');
  expect(target.status).toBe(201);
  // 60 messaggi dopo: il bersaglio è fuori dalla prima pagina (50).
  for (let i = 0; i < 60; i += 1) await post(`aggiornamento ${i}`);

  const ctx = await browser.newContext({ locale: 'it-IT' });
  try {
    await cookieLogin(ctx, enzo);
    const page = await ctx.newPage();
    await page.goto('/');
    await page.getByRole('button', { name: 'Cerca', exact: true }).click();
    const box = page.getByRole('searchbox', { name: 'Cerca nella cronologia' });
    await box.fill('citta km2');
    await box.press('Enter');

    const results = page.getByRole('list', { name: 'Risultati della ricerca' });
    const hit = results.getByRole('button', { name: /Sara Ricerca/ });
    await expect(hit).toHaveCount(1);
    // Подчертано: „Città“ без ударение в заявката и „KM2“ — като <mark>, не HTML от сървъра.
    await expect(hit.locator('mark')).toHaveText(['KM2', 'Città']);

    await hit.click();
    const message = page.locator(`#conv-host [data-message-id="${target.body.message.id}"]`);
    await expect(message).toBeVisible();
    await expect(message).toContainText('vibra a ogni partenza');
    await expect(page.getByRole('heading', { name: 'Sara Ricerca' })).toBeVisible();
  } finally {
    await ctx.close();
  }
});

test('файл в DM: качване в полето, изпращане, другият участник го сваля', async ({ browser }) => {
  const sara = await newStaff('SUPPORT', 'Sara Allegati');
  const enzo = await newStaff('ENGINEERING', 'Enzo Allegati');
  const created = await (
    await apiAs(sara)
  ).post('/api/v1/conversations', { type: 'DIRECT', userId: enzo.id });
  const dm = created.body.conversation.id as string;

  const saraCtx = await browser.newContext({ locale: 'it-IT' });
  const enzoCtx = await browser.newContext({ locale: 'it-IT', acceptDownloads: true });
  try {
    await cookieLogin(saraCtx, sara);
    await cookieLogin(enzoCtx, enzo);
    const saraPage = await saraCtx.newPage();
    await saraPage.goto(`/#c=${dm}`);
    const conv = saraPage.locator('#conv-pane');
    const chooser = saraPage.waitForEvent('filechooser');
    await conv.getByRole('button', { name: 'Allega file' }).click();
    await (await chooser).setFiles({ name: 'targa.png', mimeType: 'image/png', buffer: MAGIC.png });
    await expect(conv.getByRole('list', { name: 'File da inviare' })).toContainText(
      'Controllato e pronto',
    );
    await conv.getByLabel('Messaggio', { exact: true }).fill('Ecco la targa del quadro');
    await conv.getByRole('button', { name: 'Invia' }).click();
    await expect(conv.getByRole('list', { name: 'Allegati' })).toContainText('targa.png');

    const enzoPage = await enzoCtx.newPage();
    await enzoPage.goto(`/#c=${dm}`);
    const chip = enzoPage
      .locator('#conv-pane')
      .getByRole('list', { name: 'Allegati' })
      .getByRole('button', { name: /targa\.png/ });
    await expect(chip).toBeVisible();
    await chip.click();
    const dialog = enzoPage.getByRole('dialog', { name: 'targa.png' });
    const link = dialog.getByRole('link', { name: 'Scarica il file' });
    await expect(link).toBeVisible();
    const [download] = await Promise.all([enzoPage.waitForEvent('download'), link.click()]);
    const path = await download.path();
    const { readFile } = await import('node:fs/promises');
    expect(Buffer.compare(await readFile(path), Buffer.from(MAGIC.png))).toBe(0);

    // Сървърът: файлът е привързан към съобщението в разговора, CLEAN.
    const stored = await db.attachment.findFirstOrThrow({
      where: { conversationId: dm, uploadedById: sara.id },
    });
    expect(stored.scanStatus).toBe('CLEAN');
    expect(stored.conversationMessageId).not.toBeNull();
  } finally {
    await saraCtx.close();
    await enzoCtx.close();
  }
});
