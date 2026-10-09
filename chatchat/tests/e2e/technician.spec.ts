import { expect, test } from '@playwright/test';
import { db } from '../integration/helpers.js';
import { formLogin, newPortalUser } from './support/world.js';

/**
 * Поток (а): порталният техник от входа до затварянето на случая — нов случай с контекст → въпрос →
 * отговор с цитат → отваряне на източника → „Utile“ → тикет → изход „решен“.
 */
test('техникът: вход, случай, отговор с цитат, източник, обратна връзка, тикет, изход', async ({
  page,
}) => {
  const user = await newPortalUser('Paolo E2E');
  await formLogin(page, user.email);
  await expect(page.getByRole('heading', { name: 'Nessun caso aperto' })).toBeVisible();

  await page.getByRole('button', { name: 'Nuovo caso' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Nuovo caso' });
  await dialog.getByLabel('Modello').fill('LTX-500');
  await dialog.getByLabel('Revisione HW').fill('B');
  await dialog.getByLabel('Firmware').fill('4.2');
  await dialog.getByLabel('Codice errore').fill('E37');
  await dialog.getByRole('button', { name: 'Crea caso' }).click();

  await page.getByLabel('Descriva cosa vede sul quadro').fill('Il display mostra E37');
  await page.getByRole('button', { name: 'Invia' }).click();

  // Отговорът носи цитат за фърмуер 4 (записът за версия 5 е друг и не се показва).
  const answer = page.getByRole('log', { name: 'Conversazione' }).getByRole('article').last();
  await expect(answer.getByRole('heading', { name: 'Esito: Causa identificata' })).toBeVisible();
  const quote = answer.getByRole('blockquote');
  await expect(quote).toContainText('E37 versione quattro');
  await expect(quote).not.toContainText('versione cinque');

  // Отваряне на източника: страницата с цитирания текст.
  await answer.getByRole('button', { name: /Apri pagina/ }).click();
  const source = page.getByRole('dialog', { name: 'Fonte' });
  await expect(source).toContainText('ERR-LIST-500');
  await expect(source).toContainText('Elenco dei codici errore del quadro LTX-500.');
  await source.getByRole('button', { name: 'Chiudi' }).click();
  await expect(source).toBeHidden();

  // „Utile“.
  await answer.getByRole('button', { name: 'Utile', exact: true }).click();
  await expect(answer.getByRole('status').last()).not.toBeEmpty();

  // Тикет.
  await page.getByRole('button', { name: 'Apri ticket' }).first().click();
  const ticket = page.getByRole('dialog', { name: 'Apri ticket' });
  await ticket.getByLabel('Motivo').fill('Il problema persiste dopo i controlli.');
  await ticket.getByRole('button', { name: 'Apri ticket' }).click();
  await expect(page.getByText(/Ticket TS-\d{4}-\d{6} · aperto/)).toBeVisible();

  // Изход „решен“.
  await page.getByRole('button', { name: 'Segna come risolto' }).click();
  await expect(page.getByText('Segnato come risolto', { exact: true })).toBeVisible();

  // Сървърът е на същото мнение: изход, тикет и обратна връзка са записани.
  const stored = await db.case.findFirstOrThrow({
    where: { createdById: user.id },
    include: { ticket: true },
  });
  expect(stored.outcome).toBe('RESOLVED');
  expect(stored.ticket?.number).toMatch(/^TS-\d{4}-\d{6}$/);
  expect(await db.feedback.count({ where: { userId: user.id, rating: 'USEFUL' } })).toBe(1);
});
