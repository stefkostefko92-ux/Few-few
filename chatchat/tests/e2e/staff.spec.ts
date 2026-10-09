import { expect, test } from '@playwright/test';
import { db } from '../integration/helpers.js';
import { ask, newCase } from '../integration/world.js';
import { apiAs, formLogin, newPortalUser, newStaff, totpNow } from './support/world.js';

/**
 * Поток (в): служител с втори фактор — вход с парола + TOTP, поемане на случая на техника,
 * вътрешна дискусия по случая. Порталът не вижда дискусията.
 */
test('персонал с MFA: вход с TOTP, поемане на случая, вътрешна дискусия', async ({ page }) => {
  const portal = await newPortalUser('Paolo Cliente');
  const portalApi = await apiAs(portal);
  const caseId = await newCase(portalApi, { deviceSerial: 'SN-ALFA-1' });
  await ask(portalApi, caseId, 'Il display mostra E37');

  const staff = await newStaff('SUPPORT', 'Sara Supporto');
  await formLogin(page, staff.email, { totp: totpNow() });
  await expect(page.getByRole('button', { name: 'Nuovo caso' }).first()).toBeVisible();

  // Случаят на техника се вижда в списъка; отваряме го и го поемаме.
  await page.getByRole('button', { name: /E37/ }).first().click();
  await page.getByRole('button', { name: 'Prendi in carico' }).click();
  await expect(page.locator('#actions-feedback')).toHaveText('Ha preso in carico il caso.');

  // Вътрешна дискусия по случая: съобщението е видимо за персонала.
  await page.getByRole('button', { name: 'Discussione interna' }).click();
  const note = 'Verificare il connettore X3 prima dell’intervento in sito.';
  await page.getByLabel('Messaggio', { exact: true }).fill(note);
  await page.getByLabel('Messaggio', { exact: true }).press('Control+Enter');
  await expect(page.getByRole('log').filter({ hasText: note })).toBeVisible();

  // Сървърът: съобщението е в разговор от вид CASE, а порталът не го вижда по никой път.
  // (съобщението се показва оптимистично — чакаме записа по състояние, не по време)
  await expect
    .poll(() => db.conversationMessage.count({ where: { conversation: { caseId } } }))
    .toBe(1);
  const stored = await db.conversationMessage.findFirstOrThrow({
    where: { conversation: { caseId } },
    include: { conversation: true },
  });
  expect(stored.conversation.type).toBe('CASE');
  const timeline = await portalApi.get(`/api/v1/cases/${caseId}/timeline`);
  expect(timeline.status).toBe(200);
  expect(JSON.stringify(timeline.body)).not.toContain('internal.');
  expect(JSON.stringify(timeline.body)).not.toContain(note);
  expect((await portalApi.get(`/api/v1/conversations/${stored.conversationId}`)).status).toBe(404);
});
