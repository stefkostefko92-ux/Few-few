// The October 2026 brief in a real browser: a Mastech panel asks for its type, and each type opens its
// own order filled from the sheet (and from the order of the make chosen before); a hydraulic lift
// shows the power unit in place of the argano and the governor; the end of the form chooses the
// sections of the print.
import { audit, fail, tick } from './helpers.mjs';

const untick = (page, name, value) =>
  page.locator(`input[name=${name}][value=${value}]`).evaluate((input) => {
    if (input.checked) input.click();
  });
const shown = (page, selector) => page.locator(selector).isVisible();

export async function checkMastech(page, scheme, aziendaName) {
  // Mastech with the order wanted (the question is already "Sì"): no form until the type is chosen.
  await tick(page, 'quadroMarca', 'MASTECH');
  if (!(await shown(page, '#f-quadroModello'))) fail(`${scheme}: no Mastech type to choose`);
  if ((await shown(page, '#f-mn')) || (await shown(page, '#f-mq')))
    fail(`${scheme}: a Mastech order shown before its type`);

  await tick(page, 'quadroModello', 'NG120');
  if (!(await shown(page, '#f-mn'))) fail(`${scheme}: NG120 order not shown`);
  if (await shown(page, '#f-mq')) fail(`${scheme}: QI Touch order shown for NG120`);
  const ng120 = {
    '#f-mn-nFermate': '6',
    // The speed written in the order of the make chosen before carries over.
    '#f-mn-velocita': '1,6',
    '#f-mn-cliente': aziendaName,
  };
  for (const [selector, value] of Object.entries(ng120)) {
    const actual = await page.inputValue(selector);
    if (actual !== value) fail(`${scheme}: ${selector} is "${actual}", not "${value}"`);
  }
  if (!(await page.isChecked('#f-mn-op1Automatico')))
    fail(`${scheme}: NG120 without the automatic doors of the sheet`);
  if (!(await page.locator('#f-mn .modulo__rowtitle', { hasText: 'Norme di riferimento' }).count()))
    fail(`${scheme}: NG120 rows without their names`);
  await tick(page, 'mn-pianoA0', 'si');

  await tick(page, 'quadroModello', 'QI_TOUCH');
  if (!(await shown(page, '#f-mq'))) fail(`${scheme}: QI Touch order not shown`);
  if (await shown(page, '#f-mn')) fail(`${scheme}: NG120 order shown for QI Touch`);
  const qi = {
    '#f-mq-numeroFermate': '6',
    '#f-mq-portataNominale': '630',
    '#f-mq-numeroAccessi': '2',
    '#f-mq-tipoImpianto': 'Elettrico',
  };
  for (const [selector, value] of Object.entries(qi)) {
    const actual = await page.inputValue(selector);
    if (actual !== value) fail(`${scheme}: ${selector} is "${actual}", not "${value}"`);
  }
  await audit(page, `${scheme} mastech`);

  // A hydraulic lift: the power unit in place of the argano and the governor — its make and model with
  // either answer, the A3 amendment with "No" and, with the amendment, the flexible hose.
  await tick(page, 'tipoImpianto', 'IDRAULICO');
  if ((await shown(page, '#s-argano')) || (await shown(page, '#s-limitatore')))
    fail(`${scheme}: argano or governor shown for a hydraulic lift`);
  if (!(await shown(page, '#s-centralina'))) fail(`${scheme}: no power unit for a hydraulic lift`);
  if (!(await shown(page, '#s-centralina >> text=Centralina da sostituire?')))
    fail(`${scheme}: the power unit does not ask "Centralina da sostituire?"`);
  if (!(await shown(page, '#f-centralinaNote'))) fail(`${scheme}: no notes for the power unit`);
  await tick(page, 'centralinaDaFare', 'si');
  if (!(await shown(page, '#f-centralinaMarca'))) fail(`${scheme}: no make for a new unit`);
  if (await shown(page, '#f-emendamentoA3')) fail(`${scheme}: A3 amendment asked for a new unit`);
  await tick(page, 'centralinaDaFare', 'no');
  if (!(await shown(page, '#f-centralinaMarca'))) fail(`${scheme}: no make for an old unit`);
  if (!(await shown(page, '#f-emendamentoA3'))) fail(`${scheme}: no A3 amendment for an old unit`);
  if (await shown(page, '#f-tuboFlessibile')) fail(`${scheme}: hose asked without the amendment`);
  await tick(page, 'emendamentoA3', 'si');
  await tick(page, 'tuboFlessibile', 'si');
  for (const key of ['tuboFlessibileDiametroMm', 'tuboFlessibileLunghezzaM', 'tuboFlessibileNote'])
    if (!(await shown(page, `#f-${key}`))) fail(`${scheme}: ${key} not shown for the hose`);
  await tick(page, 'tuboFlessibile', 'no');
  if (await shown(page, '#f-tuboFlessibileLunghezzaM'))
    fail(`${scheme}: the hose length stays for "No"`);
  // One kind of lift at a time: ticking "Elettrico" takes "Idraulico" away.
  await tick(page, 'tipoImpianto', 'ELETTRICO');
  if (!(await shown(page, '#s-argano')) || (await shown(page, '#s-centralina')))
    fail(`${scheme}: the argano does not come back for a traction lift`);

  // The print keeps every section unless unticked: the cables are left out of this one.
  await untick(page, 'stampa', 'cavi');
}
