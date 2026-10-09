import { expect, test } from '@playwright/test';
import { db } from '../integration/helpers.js';
import { cookieLogin, newStaff } from './support/world.js';

/**
 * Поток (г): работно пространство — директно съобщение между двама колеги; второто устройство го
 * получава в реално време (SSE), без презареждане. Два независими browser context-а = два устройства.
 */
test('директно съобщение: второто устройство го получава в реално време', async ({ browser }) => {
  const sara = await newStaff('SUPPORT', 'Sara Realtime');
  const enzo = await newStaff('ENGINEERING', 'Enzo Realtime');

  const saraCtx = await browser.newContext({ locale: 'it-IT' });
  const enzoCtx = await browser.newContext({ locale: 'it-IT' });
  try {
    await cookieLogin(saraCtx, sara);
    await cookieLogin(enzoCtx, enzo);
    const saraPage = await saraCtx.newPage();
    const enzoPage = await enzoCtx.newPage();
    await saraPage.goto('/');
    await enzoPage.goto('/');

    // Енцо е свързан към потока ПРЕДИ Сара да пише.
    await expect(enzoPage.getByText('Tempo reale attivo')).toBeVisible();

    // Сара започва директен разговор с Енцо.
    await saraPage.getByRole('button', { name: 'Nuovo messaggio' }).click();
    const dialog = saraPage.getByRole('dialog', { name: 'Nuova conversazione' });
    await dialog.getByLabel('Persone').fill('Enzo Realtime');
    await dialog.getByRole('button', { name: /Enzo Realtime/ }).click();
    await dialog.getByRole('button', { name: 'Crea', exact: true }).click();

    const text = 'Puoi guardare il caso della Alfa Srl? Sembra un E37 ricorrente.';
    await saraPage.getByLabel('Messaggio', { exact: true }).fill(text);
    await saraPage.getByLabel('Messaggio', { exact: true }).press('Control+Enter');

    // Второто устройство: разговорът се появява в „Messaggi diretti“ и носи съобщението.
    const dm = enzoPage.getByRole('button', { name: /Sara Realtime/ });
    await expect(dm).toBeVisible();
    await dm.click();
    await expect(enzoPage.getByRole('log').filter({ hasText: text })).toBeVisible();

    // И обратно — отговорът на Енцо стига при Сара.
    const reply = 'Certo, lo apro adesso.';
    await enzoPage.getByLabel('Messaggio', { exact: true }).fill(reply);
    await enzoPage.getByLabel('Messaggio', { exact: true }).press('Control+Enter');
    await expect(saraPage.getByRole('log').filter({ hasText: reply })).toBeVisible();

    expect(await db.conversationMessage.count({ where: { body: { in: [text, reply] } } })).toBe(2);
  } finally {
    await saraCtx.close();
    await enzoCtx.close();
  }
});
