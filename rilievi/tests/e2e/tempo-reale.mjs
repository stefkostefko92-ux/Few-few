// The same data in more than one place, filled in real time in a real browser (public/js/collegati.js,
// moduli.js). A form first fills the sheet: the stops (and their measurement rows), the ropes, the load
// written "1.000", the address. The sheet then fills the forms while it is typed: the reference with the
// lift number, the date, the doors, the door operator as a list option, the door opening of the 2SG
// sheet. One form fills the other, and the sheet's "Accessi" carries the entrances of the panel order to
// the other make's order. A field typed by hand keeps its value and the difference is listed; on a saved
// sheet a changed address is a difference to confirm, never a silent overwrite.
import { fail, tick } from './helpers.mjs';

const chosen = (page, name) =>
  page
    .locator(`input[name=${name}]:checked`)
    .evaluateAll((inputs) => inputs.map((input) => input.value).join(','));

export async function checkRealTime(context, { base, aziendaName, sheetUrl, scheme }) {
  const page = await context.newPage();
  page.on('pageerror', (error) => fail(`${scheme} real time: page error ${error.message}`));
  const expect = async (selector, wanted, what) => {
    const actual = await page.inputValue(selector);
    if (actual !== wanted) fail(`${scheme} real time: ${what} is "${actual}", not "${wanted}"`);
  };
  await page.goto(`${base}/schede/nuova`);
  await page.selectOption('#f-azienda', { label: aziendaName });

  // A form first: the sheet follows.
  await tick(page, 'quadroMarca', 'PELAZZA');
  await tick(page, 'quadroOrdine', 'si');
  await tick(page, 'bottoniereMisure', 'si');
  await page.fill('#f-oq-nFermate', '7');
  await expect('#f-fermate', '7', 'the stops of the sheet, from the panel order');
  const rows = await page.locator('[data-misura]:visible').count();
  if (rows !== 7)
    fail(`${scheme} real time: ${rows} measurement rows for the 7 stops of the order`);
  await tick(page, 'arganoPreventivo', 'si');
  await expect('#f-pa-piani', '7', 'the stops of the argano sheet');
  await page.fill('#f-pa-funiN', '4');
  await expect('#f-funiNumero', '4', 'the ropes of the sheet, from the argano sheet');
  await page.fill('#f-pa-portata', '1.000');
  await expect('#f-portataKg', '1000', 'the load of the sheet, from "1.000"');
  await page.fill('#f-pa-indirizzo', 'Via Roma 1, Torino');
  await expect('#f-indirizzo', 'Via Roma 1, Torino', 'the address of the sheet');

  // The sheet next: the forms follow while it is typed.
  await page.fill('#f-numeroImpianto', '880011');
  await expect('#f-oq-rifImpianto', 'N° 880011 — Via Roma 1, Torino', 'the order reference');
  await expect('#f-pa-nImpianto', '880011', 'the lift number of the argano sheet');
  await page.fill('#f-data', '2026-10-14');
  await expect('#f-oq-data', '14/10/2026', 'the date of the panel order');
  await tick(page, 'tipoPorte', 'AUTOMATICHE');
  if (!(await page.isChecked('#f-oq-porteAutomatiche')))
    fail(`${scheme} real time: the doors of the panel order do not follow the sheet`);
  await page.fill('#f-operatoreMarca', 'Selcom');
  await expect('#f-om-marcaOpA', 'SELCOM', 'the door operator of the MoviLift order');
  await page.fill('#f-lucePorte', '800 x 2000');
  await expect('#f-sg-luceCabinaL', '800', 'the width of the 2SG cabin door');
  await expect('#f-sg-luceCabinaH', '2000', 'the height of the 2SG cabin door');

  // One form fills the other; the entrances reach the other make's order through the sheet.
  await page.fill('#f-oq-motIn', '12');
  await expect('#f-pa-ampere', '12', 'the motor current of the argano sheet');
  await page.fill('#f-oq-nAccessi', '2');
  if ((await chosen(page, 'doppioAccesso')) !== 'si')
    fail(`${scheme} real time: "Accessi: 2" of the sheet does not follow the panel order`);
  if ((await chosen(page, 'om-ingressi')) !== 'doppio')
    fail(`${scheme} real time: the MoviLift entrances do not follow the panel order`);

  // Typed by hand on both sides: each keeps its value, the difference is listed.
  await page.fill('#f-fermate', '8');
  await expect('#f-oq-nFermate', '7', 'the stops typed in the panel order');
  await expect('#f-pa-piani', '8', 'the stops of the argano sheet, still following');
  if (!(await page.locator('#f-oq [data-diff]:visible', { hasText: 'Fermate' }).count()))
    fail(`${scheme} real time: 8 stops on the sheet and 7 in the order not listed`);
  await page.close();

  // A saved sheet says what was saved: a new address on the sheet is a difference, not a copy.
  const edit = await context.newPage();
  await edit.goto(`${sheetUrl}/modifica`);
  await edit.fill('#f-indirizzo', 'Via Garibaldi 2, Torino');
  if ((await edit.inputValue('#f-pa-indirizzo')) === 'Via Garibaldi 2, Torino')
    fail(`${scheme} real time: the saved address of the argano sheet was overwritten`);
  if (!(await edit.locator('#f-pa [data-diff]:visible', { hasText: 'Indirizzo' }).count()))
    fail(`${scheme} real time: the changed address is not listed as a difference`);
  await edit.close();
}
