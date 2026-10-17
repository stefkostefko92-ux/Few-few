// The MoviLift panel order in a real browser (public/js/moduli.js, collegati.js): it opens with its
// make and "Sì", filled from the sheet — the words of the ticked boxes, the plant data; its radio groups follow the sheet while nobody chooses there and go back to
// the blank form's answer when the sheet says nothing; a Pelazza panel hides it again.
import { audit, fail, tick } from './helpers.mjs';

const untick = (page, name, value) =>
  page.locator(`input[name=${name}][value=${value}]`).evaluate((input) => {
    if (input.checked) input.click();
  });
const chosen = (page, name) =>
  page.locator(`input[name=${name}]:checked`).evaluateAll((inputs) => inputs.map((i) => i.value));
const listed = (page, name) => page.locator('#f-om [data-diff]:visible', { hasText: name }).count();

export async function checkMovilift(page, scheme) {
  // What the Pelazza order already says carries over when the panel turns out to be a MoviLift.
  await tick(page, 'quadroMarca', 'PELAZZA');
  await tick(page, 'quadroOrdine', 'si');
  await page.fill('#f-oq-velocita', '1,6');
  await tick(page, 'quadroMarca', 'MOVILIFT');
  if ((await page.inputValue('#f-om-velocita')) !== '1,6')
    fail(`${scheme}: the speed of the Pelazza order did not carry over to MoviLift`);
  if (!(await page.locator('#f-om').isVisible())) fail(`${scheme}: MoviLift order not shown`);
  if (await page.locator('#f-oq').isVisible()) fail(`${scheme}: Pelazza order shown for MoviLift`);
  const expected = {
    '#f-om-fermate': '6',
    '#f-om-portata': '630',
    '#f-om-tipologia': 'Elettrico',
    '#f-om-tipoPorte': 'Automatiche',
  };
  for (const [selector, value] of Object.entries(expected)) {
    const actual = await page.inputValue(selector);
    if (actual !== value) fail(`${scheme}: ${selector} is "${actual}", not "${value}"`);
  }
  const radios = { 'om-ingressi': 'doppio', 'om-locMacc': 'alto', 'om-controllo': 'scheda' };
  for (const [name, value] of Object.entries(radios)) {
    const actual = (await chosen(page, name)).join(',');
    if (actual !== value) fail(`${scheme}: ${name} is "${actual}", not "${value}"`);
  }
  await audit(page, `${scheme} movilift`);

  // The machine room follows the sheet; with nothing there, the blank form's "in ALTO" again.
  await untick(page, 'ubicazioneMacchina', 'ALTO');
  await tick(page, 'ubicazioneMacchina', 'BASSO');
  if ((await chosen(page, 'om-locMacc')).join() !== 'basso')
    fail(`${scheme}: the machine room does not follow the sheet`);
  await untick(page, 'ubicazioneMacchina', 'BASSO');
  if ((await chosen(page, 'om-locMacc')).join() !== 'alto')
    fail(`${scheme}: the machine room does not go back to the blank form`);
  await tick(page, 'ubicazioneMacchina', 'ALTO');

  // A selected double entrance is still a double entrance; a single one is a difference.
  await tick(page, 'om-ingressi', 'doppioSelezionato');
  if (await listed(page, 'Accessi')) fail(`${scheme}: selected double entrance listed`);
  await tick(page, 'om-ingressi', 'unico');
  if (!(await listed(page, 'Accessi')))
    fail(`${scheme}: single entrance against a double access not listed`);
  await tick(page, 'om-ingressi', 'doppio');
}
