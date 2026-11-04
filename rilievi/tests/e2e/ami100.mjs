// AMI 100 (30 October 2026) in a real browser: asked only with a reduced pit or a reduced headroom
// (either one), the type before its sheet, each type its own sheet, the UCM one filled from the card
// (load and stops). The card is saved with AMI 100 Mono UCM: run.mjs then fetches its PDF.
import { audit, fail, tick } from './helpers.mjs';

const shown = (page, selector) => page.locator(selector).isVisible();

export async function checkAmi100(page, scheme) {
  if (await shown(page, '#f-ami100'))
    fail(`${scheme}: AMI 100 asked with no reduced pit or headroom`);
  await tick(page, 'testataRidotta', 'si');
  if (!(await shown(page, '#f-ami100')))
    fail(`${scheme}: AMI 100 not asked with a reduced headroom`);
  await tick(page, 'testataRidotta', 'no');
  if (await shown(page, '#f-ami100')) fail(`${scheme}: AMI 100 still asked with neither reduced`);
  await tick(page, 'fossaRidotta', 'si');
  if (!(await shown(page, '#f-ami100'))) fail(`${scheme}: AMI 100 not asked with a reduced pit`);

  await tick(page, 'ami100', 'si');
  if (!(await shown(page, '#f-ami100Tipo'))) fail(`${scheme}: no AMI 100 type to choose`);
  if ((await shown(page, '#f-au')) || (await shown(page, '#f-ar')))
    fail(`${scheme}: an AMI 100 sheet shown before its type`);

  await tick(page, 'ami100Tipo', 'MONO_RTBS');
  if (!(await shown(page, '#f-ar')) || (await shown(page, '#f-au')))
    fail(`${scheme}: AMI 100 Mono RTBS shows the wrong sheet`);
  await page.fill('#f-ar-codiceAmi', 'RTBS-24');

  await tick(page, 'ami100Tipo', 'MONO_UCM');
  if (!(await shown(page, '#f-au')) || (await shown(page, '#f-ar')))
    fail(`${scheme}: AMI 100 Mono UCM shows the wrong sheet`);
  for (const [selector, value] of Object.entries({
    '#f-au-portata': '630',
    '#f-au-fermate': '6',
  })) {
    const actual = await page.inputValue(selector);
    if (actual !== value) fail(`${scheme}: ${selector} is "${actual}", not "${value}"`);
  }
  if (!(await page.locator('#f-au .modulo__rowtitle', { hasText: 'Spessore guida [mm]' }).count()))
    fail(`${scheme}: AMI 100 rows without their names`);
  await tick(page, 'au-tensione24', 'si');
  await tick(page, 'au-spessore9', 'si');
  await page.fill('#f-au-numeroOrdine', 'A-17');
  await audit(page, `${scheme} ami100`);
}
