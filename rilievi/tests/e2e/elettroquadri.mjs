// The Elettroquadri make in a real browser (the owner, 30 October 2026): no second question — the order
// form follows the kind of lift of the sheet (electric → geared, MRL → gearless, hydraulic →
// oleodinamico), one at a time, filled from the sheet and from the order of the make chosen before.
import { audit, fail, tick } from './helpers.mjs';

const shown = (page, selector) => page.locator(selector).isVisible();
const FORMS = { ELETTRICO: '#f-eg', GEARLESS: '#f-el', IDRAULICO: '#f-eo' };

export async function checkElettroquadri(page, scheme, aziendaName) {
  // The order is already wanted ("Sì") and the lift is electric: the geared form, at once.
  await tick(page, 'quadroMarca', 'ELETTROQUADRI');
  if (await shown(page, '#f-quadroModello')) fail(`${scheme}: Elettroquadri asks for a type`);
  for (const [kind, form] of Object.entries(FORMS)) {
    await tick(page, 'tipoImpianto', kind);
    for (const [other, selector] of Object.entries(FORMS)) {
      if ((await shown(page, selector)) !== (other === kind))
        fail(`${scheme}: ${selector} ${other === kind ? 'hidden' : 'shown'} for ${kind}`);
    }
    const prefix = form.slice(3);
    const expected = { [`#f-${prefix}-nFermate`]: '6', [`#f-${prefix}-cliente`]: aziendaName };
    // The speed written in the order of the make chosen before carries over (hydraulic: no argano).
    if (kind !== 'IDRAULICO') expected[`#f-${prefix}-velocita`] = '1,6';
    for (const [selector, value] of Object.entries(expected)) {
      const actual = await page.inputValue(selector);
      if (actual !== value) fail(`${scheme}: ${selector} is "${actual}", not "${value}"`);
    }
    if (!(await page.isChecked(`#f-${prefix}-accessi2`)))
      fail(`${scheme}: ${prefix} without the two accesses of the sheet`);
  }
  await audit(page, `${scheme} elettroquadri`);
  // Back to the electric lift for the rest of the flow.
  await tick(page, 'tipoImpianto', 'ELETTRICO');
}
