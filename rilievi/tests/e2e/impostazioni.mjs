// The company settings in a real browser: the order of the sheet sections, moved with the arrow buttons
// (no JavaScript needed), saved once and used by the sheet form; the focus stays on the section that
// moved, so a keyboard user can keep moving it. Put back to the default at the end.
import { audit, fail } from './helpers.mjs';

const order = (page) =>
  page.locator('input[name=ordine]').evaluateAll((inputs) => inputs.map((input) => input.value));

export async function checkSettings(page, { base, aziendaId, sheetPath }) {
  await page.goto(`${base}/impostazioni?azienda=${aziendaId}`);
  await audit(page, 'settings');
  const before = await order(page);
  if (before.at(-1) !== 'note')
    fail(`settings: "Note e lavori" is not last by default (${before})`);
  await page.click('button[name=sposta][value="note:su"]');
  await page.waitForSelector('.order__dirty');
  const moved = await order(page);
  if (moved.at(-2) !== 'note') fail(`settings: "Note e lavori" did not move up (${moved})`);
  const focused = await page.evaluate(() => document.activeElement?.getAttribute('value'));
  if (focused !== 'note:su') fail(`settings: the focus left the moved section (${focused})`);
  await page.keyboard.press('Enter');
  await page.waitForFunction(
    () => [...document.querySelectorAll('input[name=ordine]')].at(-3)?.value === 'note',
  );
  await page.click('button[name=salva]');
  await page.waitForURL(/\/impostazioni\?azienda=/);
  if (!(await page.locator('.flash').count())) fail('settings: no confirmation after saving');
  await page.goto(`${base}${sheetPath}/modifica`);
  const sections = await page
    .locator('fieldset.section[id^="s-"]')
    .evaluateAll((sets) => sets.map((set) => set.id.slice(2)));
  // Moved up twice from the bottom: after "Serrature o sospensioni", before "Allarme".
  const at = (key) => sections.indexOf(key);
  if (!(at('serrature') < at('note') && at('note') < at('allarme')))
    fail(`settings: the form does not follow the saved order (${sections})`);
  await page.goto(`${base}/impostazioni?azienda=${aziendaId}`);
  await page.click('button[name=ripristina]');
  await page.waitForURL(/\/impostazioni\?azienda=/);
  if ((await order(page)).at(-1) !== 'note') fail('settings: the default order did not come back');
}
