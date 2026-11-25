// The reduced headroom and pit (owner, 3 November 2026 — his sheet "Solo su elettrico") in a real
// browser: each list of solutions only under its own "Sì"; "AMI 100 Mono RTBS" ticked in either list
// opens its order sheet, untick it and the sheet closes. No "Installare AMI 100?", no Mono UCM. The card
// is saved with the RTBS ticked under the reduced pit: run.mjs then fetches its PDF.
import { audit, fail, tick } from './helpers.mjs';

const shown = (page, selector) => page.locator(selector).isVisible();

/** Ticks or unticks one box of a list (a DOM click, like a tap on its label). */
const setBox = (page, name, value, checked) =>
  page.locator(`input[name=${name}][value=${value}]`).evaluate((input, wanted) => {
    if (input.checked !== wanted) input.click();
  }, checked);

export async function checkAmi100(page, scheme) {
  if (await page.locator('input[name=ami100]').count()) fail(`${scheme}: the old AMI 100 question`);
  if (await shown(page, '#f-testataInterventi'))
    fail(`${scheme}: headroom solutions shown with no reduced headroom`);
  await tick(page, 'testataRidotta', 'si');
  if (!(await shown(page, '#f-testataInterventi')))
    fail(`${scheme}: no solutions for a reduced headroom`);
  if (await shown(page, '#f-ar')) fail(`${scheme}: AMI 100 sheet before its tick`);

  await setBox(page, 'testataInterventi', 'AMI100_RTBS', true);
  if (!(await shown(page, '#f-ar'))) fail(`${scheme}: AMI 100 Mono RTBS ticked, no sheet`);
  await setBox(page, 'testataInterventi', 'AMI100_RTBS', false);
  if (await shown(page, '#f-ar')) fail(`${scheme}: AMI 100 sheet still open without its tick`);
  await tick(page, 'testataRidotta', 'no');

  await tick(page, 'fossaRidotta', 'si');
  if (!(await shown(page, '#f-fossaInterventi'))) fail(`${scheme}: no solutions for a reduced pit`);
  await setBox(page, 'fossaInterventi', 'GREMBIULE_3_STADI', true);
  if (!(await shown(page, '#f-grembiuleNote')))
    fail(`${scheme}: no note for the retractable apron`);
  await page.fill('#f-grembiuleNote', 'Da verificare lo spazio');
  await setBox(page, 'fossaInterventi', 'AMI100_RTBS', true);
  if (!(await shown(page, '#f-ar')))
    fail(`${scheme}: AMI 100 Mono RTBS ticked in the pit, no sheet`);
  if (!(await page.locator('#f-ar .modulo__rowtitle', { hasText: 'Spessore guida [mm]' }).count()))
    fail(`${scheme}: AMI 100 rows without their names`);
  await tick(page, 'ar-tensione24', 'si');
  await page.fill('#f-ar-codiceAmi', 'RTBS-24');
  await page.fill('#f-ar-numeroOrdine', 'A-17');
  await audit(page, `${scheme} ami100`);
}
