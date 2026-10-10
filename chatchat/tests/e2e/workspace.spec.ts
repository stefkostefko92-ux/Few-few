import { expect, test } from '@playwright/test';
import { db } from '../integration/helpers.js';
import { newCase } from '../integration/world.js';
import { apiAs, cookieLogin, newPortalUser, newStaff } from './support/world.js';

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

/**
 * При зареждане на десктоп се отваря последният случай. Ако човекът междувременно е избрал друго
 * (тук — опашката, докато разговорите още се зареждат), автоматичното отваряне не го връща насила.
 */
test('зареждане: опашката, избрана докато се зарежда, не се подменя с последния случай', async ({
  browser,
}) => {
  const tech = await newPortalUser('Tecnico Avvio');
  await newCase(await apiAs(tech));
  const sara = await newStaff('SUPPORT', 'Sara Avvio');
  const ctx = await browser.newContext({ locale: 'it-IT' });
  try {
    await cookieLogin(ctx, sara);
    const page = await ctx.newPage();
    const caseOpens: string[] = [];
    page.on('request', (r) => {
      if (/^\/api\/v1\/cases\/[^/]+$/.test(new URL(r.url()).pathname)) caseOpens.push(r.url());
    });
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route('**/api/v1/conversations?limit=*', async (route) => {
      await held;
      await route.continue();
    });
    await page.goto('/');
    await page.getByRole('button', { name: 'Coda ticket' }).click();
    const queue = page.getByRole('group', { name: 'Quali ticket' });
    await expect(queue).toBeVisible();
    release();
    // Потокът се свързва СЛЕД разговорите; автоматичното отваряне идва веднага след тях — ако
    // имаше такова, заявката за случая вече е тръгнала, когато потокът е активен.
    await expect(page.getByText('Tempo reale attivo')).toBeVisible();
    await expect(queue).toBeVisible();
    expect(caseOpens).toEqual([]);
  } finally {
    await ctx.close();
  }
});
