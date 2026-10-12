import { expect, test } from '@playwright/test';
import { cookieLogin, newPortalUser } from './support/world.js';

/**
 * FR-03 на телефон (Pixel 5): търсенето на документи е на цял екран, резултатът се отваря във
 * визуализатора, бързият код — от началния екран; без хоризонтално превъртане.
 */
test('мобилен: търсене на документ → визуализатор и бърз код', async ({ page }) => {
  const tech = await newPortalUser('Paolo Telefono');
  await cookieLogin(page.context(), tech);
  await page.goto('/');

  await page.getByRole('button', { name: 'Cerca documenti' }).click();
  const search = page.getByRole('dialog', { name: 'Documenti e codici errore' });
  await search.getByLabel('Modello').fill('LTX-500');
  await search.getByLabel('Cerchi nel testo, nel codice o nel titolo').fill('encoder');
  await search.getByRole('button', { name: 'Cerca', exact: true }).click();
  const hit = search.getByRole('listitem').filter({ hasText: 'MAN-500 · rev. A' });
  await expect(hit).toBeVisible();
  const overflow = await page.evaluate<number>(
    'document.documentElement.scrollWidth - document.documentElement.clientWidth',
  );
  expect(overflow).toBeLessThanOrEqual(1);
  await hit.getByRole('button', { name: /Apra pag\. 4/ }).click();
  const viewer = page.getByRole('dialog', { name: 'Fonte' });
  await expect(viewer).toContainText('cavo encoder');
  await viewer.getByRole('button', { name: 'Chiudi' }).click();

  await search.getByRole('tab', { name: 'Codice errore' }).click();
  await search.getByRole('textbox', { name: 'Codice errore' }).fill('E37');
  await search.getByRole('button', { name: 'Mostri il codice' }).click();
  await expect(search.getByRole('article').filter({ hasText: 'Guasto encoder' })).toBeVisible();
});
