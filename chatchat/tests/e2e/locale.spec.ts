import { expect, test } from '@playwright/test';
import { db } from '../integration/helpers.js';
import { cookieLogin, newPortalUser } from './support/world.js';

/**
 * FR-14: превключвателят на езика сменя интерфейса И профила на сървъра (PATCH /me) — следващият
 * AI отговор е на новия език (фалшивият модел в server.ts отговаря на „Answer language: …“), и
 * след нов вход интерфейсът е пак на избрания език.
 */
test('смяна на езика → интерфейсът, профилът и AI отговорът са на новия език', async ({
  browser,
}) => {
  const user = await newPortalUser('Paolo Lingua');
  const ctx = await browser.newContext({ locale: 'it-IT' });
  try {
    await cookieLogin(ctx, user);
    const page = await ctx.newPage();
    await page.goto('/');

    await page.getByRole('button', { name: 'Nuovo caso' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Nuovo caso' });
    await dialog.getByLabel('Modello').fill('LTX-500');
    await dialog.getByLabel('Revisione HW').fill('B');
    await dialog.getByLabel('Firmware').fill('4.2');
    await dialog.getByLabel('Codice errore').fill('E37');
    await dialog.getByRole('button', { name: 'Crea caso' }).click();

    await page.getByLabel('Descriva cosa vede sul quadro').fill('Il display mostra E37');
    await page.getByRole('button', { name: 'Invia' }).click();
    const log = page.getByRole('log', { name: 'Conversazione' });
    await expect(log.getByRole('article').last()).toContainText('Diagnosi di prova.');

    // Превключвателят в горната лента → английски: интерфейсът и профилът.
    await page.locator('#app-lang').selectOption('en');
    await expect(page.getByLabel('Describe what you see on the control panel')).toBeVisible();
    await expect
      .poll(async () => (await db.user.findUniqueOrThrow({ where: { id: user.id } })).locale)
      .toBe('en');

    await page.getByLabel('Describe what you see on the control panel').fill('Still E37');
    await page.getByRole('button', { name: 'Send' }).click();
    const english = page.getByRole('log', { name: 'Conversation' });
    await expect(english.getByRole('article').last()).toContainText('Test diagnosis.');

    // Ново устройство (празно localStorage) → езикът идва от профила.
    const other = await browser.newContext({ locale: 'it-IT' });
    try {
      await cookieLogin(other, user);
      const fresh = await other.newPage();
      await fresh.goto('/');
      await expect(fresh.locator('html')).toHaveAttribute('lang', 'en');
    } finally {
      await other.close();
    }
  } finally {
    await ctx.close();
  }
});
