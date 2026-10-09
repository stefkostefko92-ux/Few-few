import { expect, test } from '@playwright/test';
import { formLogin, newPortalUser } from './support/world.js';

// Истинският екран на Pixel 5 (393×727). Залепеният формуляр (public/app/composer.css) е компактен —
// Playwright отказва клик по бутон, покрит от друг елемент, затова тестът пази и това.

/** Поток (а) на телефон (Pixel 5): същото, на тесен екран — без хоризонтално превъртане. */
test('мобилен изглед: нов случай, въпрос, отговор с цитат, източник', async ({ page }) => {
  const user = await newPortalUser('Paolo Mobile');
  await formLogin(page, user.email);
  // На тесен екран първо е списъкът; „Nuovo caso“ е най-горе.
  await expect(page.getByRole('button', { name: 'Cambia conversazione' })).toBeVisible();
  await page.getByRole('button', { name: 'Nuovo caso' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Nuovo caso' });
  await dialog.getByLabel('Modello').fill('LTX-500');
  await dialog.getByLabel('Revisione HW').fill('B');
  await dialog.getByLabel('Firmware').fill('4.2');
  await dialog.getByLabel('Codice errore').fill('E37');
  await dialog.getByRole('button', { name: 'Crea caso' }).click();

  await page.getByLabel('Descriva cosa vede sul quadro').fill('Il display mostra E37');
  await page.getByRole('button', { name: 'Invia' }).click();

  const answer = page.getByRole('log', { name: 'Conversazione' }).getByRole('article').last();
  await expect(answer.getByRole('heading', { name: 'Esito: Causa identificata' })).toBeVisible();
  await expect(answer.getByRole('blockquote')).toContainText('E37 versione quattro');

  const open = answer.getByRole('button', { name: /Apri pagina/ });
  await open.click();
  const source = page.getByRole('dialog', { name: 'Fonte' });
  await expect(source).toContainText('ERR-LIST-500');
  await source.getByRole('button', { name: 'Chiudi' }).click();
  await expect(source).toBeHidden();

  // Страницата не излиза извън екрана (няма хоризонтално превъртане).
  const overflow = await page.evaluate<number>(
    'document.documentElement.scrollWidth - document.documentElement.clientWidth',
  );
  expect(overflow).toBeLessThanOrEqual(1);
});
