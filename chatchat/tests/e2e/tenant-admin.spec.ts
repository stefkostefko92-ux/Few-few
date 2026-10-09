import { expect, test } from '@playwright/test';
import { db } from '../integration/helpers.js';
import { cookieLogin, newStaff } from './support/world.js';

const NEW_PASSWORD = 'una password lunga e nuova 2026';

/**
 * Поток (д): администраторът на клиента създава потребител — получава САМО еднократен линк (парола
 * никога не се показва); новият човек отваря линка в друг браузър, задава парола и влиза с нея.
 * Линкът не може да се ползва втори път.
 */
test('администратор: нов потребител → еднократен линк → вход с нова парола', async ({
  page,
  browser,
  context,
}) => {
  const admin = await newStaff('TENANT_ADMIN', 'Ada Admin');
  await cookieLogin(context, admin);
  await page.goto('/admin.html');

  const email = `nuovo-${Date.now().toString(36)}@example.test`;
  await page.getByRole('button', { name: 'Nuovo utente' }).click();
  const form = page.getByRole('dialog', { name: 'Nuovo utente' });
  await form.getByLabel('Email').fill(email);
  await form.getByLabel('Nome', { exact: true }).fill('Nuovo Tecnico');
  await form.getByRole('button', { name: 'Crea utente' }).click();

  // Линкът се показва веднъж; паролата — никога.
  const linkDialog = page.getByRole('dialog', { name: /Link per la password/ });
  const link = await linkDialog.getByLabel('Link monouso per impostare la password').inputValue();
  expect(link).toMatch(/\/reset#[\w-]{20,}$/);
  await linkDialog.getByRole('button', { name: 'Fatto' }).first().click();

  // Новият човек — друго устройство: линк → нова парола.
  const guest = await browser.newContext({ locale: 'it-IT' });
  try {
    const gp = await guest.newPage();
    await gp.goto(link);
    await gp.getByLabel('Nuova password').fill(NEW_PASSWORD);
    await gp.getByLabel('Ripeta la password').fill(NEW_PASSWORD);
    await gp.getByRole('button', { name: 'Salva la password' }).click();
    await expect(gp.getByText('Password cambiata.')).toBeVisible();
    await gp.getByRole('button', { name: 'Vai all’accesso' }).first().click();

    await gp.getByLabel('Email', { exact: true }).fill(email);
    await gp.getByLabel('Password', { exact: true }).fill(NEW_PASSWORD);
    await gp.getByRole('button', { name: 'Accedi' }).click();
    await expect(gp.getByRole('button', { name: 'Nuovo caso' }).first()).toBeVisible();

    // Линкът е еднократен: втори опит е отказан.
    const again = await guest.newPage();
    await again.goto(link);
    await again.getByLabel('Nuova password').fill(`${NEW_PASSWORD} bis`);
    await again.getByLabel('Ripeta la password').fill(`${NEW_PASSWORD} bis`);
    await again.getByRole('button', { name: 'Salva la password' }).click();
    await expect(again.getByRole('alert').filter({ hasText: /.+/ })).toBeVisible();
  } finally {
    await guest.close();
  }

  // Сървърът: потребителят е в клиента на администратора, активен, с хеш (не отворена парола).
  const created = await db.user.findFirstOrThrow({ where: { email } });
  expect(created.tenantId).toBe(admin.tenantId);
  expect(created.passwordHash).toMatch(/^\$argon2id\$/);
});
