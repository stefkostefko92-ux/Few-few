// Linked data in a real browser (public/js/collegati.js): what the panel order says follows into the
// argano request while nobody types there; a different value is listed under its group in both forms,
// the same number written otherwise is not; on save the differences wait for a confirmation.
import { audit, fail } from './helpers.mjs';

const listed = (page, form, name) =>
  page.locator(`#f-${form} [data-diff]:visible`, { hasText: name }).count();

export async function checkLinkedData(page, scheme) {
  await page.fill('#f-oq-velocita', '1,0');
  if ((await page.inputValue('#f-pa-velocita')) !== '1,0')
    fail(`${scheme}: the argano request does not take the speed of the panel order`);
  await page.fill('#f-pa-velocita', '1.0');
  if (await listed(page, 'pa', 'Velocità (m/s)'))
    fail(`${scheme}: 1,0 and 1.0 listed as different`);
  await page.fill('#f-pa-velocita', '1,6');
  for (const form of ['oq', 'pa']) {
    if (!(await listed(page, form, 'Velocità (m/s)')))
      fail(`${scheme}: different speeds not listed in the ${form} form`);
  }
  // A field someone typed in no longer follows: the panel order changes, the request keeps 1,6.
  await page.fill('#f-oq-velocita', '1,2');
  if ((await page.inputValue('#f-pa-velocita')) !== '1,6')
    fail(`${scheme}: a typed value was overwritten`);
  // The orders go into the sheet print too (a DOM click, like tick() in helpers.mjs).
  await page.locator('#f-riepilogoOrdini').evaluate((input) => {
    if (!input.checked) input.click();
  });
}

export async function confirmDifferences(page, scheme) {
  await page.waitForSelector('#confirm-summary');
  if (!(await page.textContent('#confirm-summary')).includes('Velocità (m/s)'))
    fail(`${scheme}: the confirmation does not list the speed`);
  await audit(page, `${scheme} confirm`);
  // Enter in a field saves the normal way (the first button of the form): asked again, not confirmed.
  await Promise.all([
    page.waitForResponse((reply) => reply.request().method() === 'POST'),
    page.press('#f-oq-quantita', 'Enter'),
  ]);
  await page.waitForLoadState('load');
  if (!(await page.locator('#confirm-summary').count()))
    fail(`${scheme}: Enter in a field confirmed the differences`);
  await page.click('.actions button[name="conferma"]');
}
