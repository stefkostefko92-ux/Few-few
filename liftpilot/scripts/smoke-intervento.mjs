// The smoke test's changes of speed and travel the logbook documents (round 46, S4): a modernisation renewing the lift
// with its existing sling under UNI 10411-11 whose logbook's speed locks «Velocità variata» on «Sì» with its reason
// (smoke.mjs draws the Progetto on it); a «Solo argano» whose drawn travel differs from the logbook's — the Progetto's
// save held, the type to review, «Porta nel calcolo» offered —, then a «Calcolo argano» from it with the speed +6 %
// over the logbook's: refused as a «Solo argano», «Passa ad Ammodernamento» saves it with the speed locked. Round 46
// S5: the optional parts of the modernisation «No» unless answered; a «Solo argano» on a controller of one speed refused,
// «Passa ad Ammodernamento con il quadro» saves it with the controller replaced (11.2.1).
import assert from 'node:assert/strict';
import { step } from './smoke-kit.mjs';

/** The modernisation of smoke.mjs (round 45: the renovation's preset, UNI 10411-11), from the saved calculation
 *  `calcUrl`: its logbook's speed 0,90 m/s against the design's 1,00 locks the speed; the load and the travel answered
 *  «No»; the standard added before taken off. Leaves the page on the saved calculation. */
export async function ammodernamento({ page, hydrated, calcUrl }) {
  step('Calcolo argano for the drawing (round 45): a modernisation renewing the lift with its existing sling, UNI 10411-11, its logbook (round 46)');
  await page.goto(calcUrl);
  await Promise.all([page.waitForURL(/\/calc\?from=/), page.click('.page-head a[href*="/calc?from="]')]);
  await hydrated(page, '#Q');
  await page.click('label.intervento-tipo[data-tipo="AMMODERNAMENTO"]');
  await page.click('.parti-sino .rif-preset button');
  await page.waitForSelector('.parti-sino .rif-preset button.on');
  assert.match(await page.textContent('.parti-sino .rif-preset button.on'), /Rifacimento con l’arcata esistente/, 'the renovation preset');
  // the optional parts: a group of their own, «No» checked, never still to answer; the renovation does not answer them
  assert.match(await page.textContent('.parti-altre legend'), /Altre parti \(facoltative\)/);
  assert.equal(await page.locator('.parti-altre li.parte').count(), 5, 'safety gear, ACOP/UCM, alarm, room, sliding car doors (the car doors replaced)');
  assert.equal(await page.locator('.parti-altre li.parte label.on:has-text("No")').count(), 5, '«No» unless answered');
  assert.equal(await page.locator('.parti-altre li.da').count(), 0);
  await page.uncheck('.collaudo label:has-text("tutto l’impianto") input');
  await page.selectOption('.collaudo select', '10411-11');
  // the logbook's speed: under -11 any change counts, the speed is the rule's «Sì», its reason beside it
  await page.fill('.collaudo [data-lib="v"]', '0.9');
  await page.waitForSelector('.parti-sino li[data-part="speed"] .parte-regola.si');
  assert.match(await page.textContent('.parti-sino li[data-part="speed"] .parte-perche'), /rispetto a 0,90 m\/s del libretto: variata \(UNI 10411-11, 15\)/);
  assert.equal(await page.getAttribute('.parti-sino li[data-part="speed"] .parte-regola', 'aria-describedby'), 'parte-speed-perche');
  assert.match(await page.textContent('.collaudo [data-var="velocita"]'), /variata \(UNI 10411-11, 15\)/);
  for (const part of ['load', 'travel']) await page.click(`.parti-sino li[data-part="${part}"] label:has-text("No")`);
  await page.waitForSelector('.savebar button.primary:not([disabled])');
  await Promise.all([page.waitForURL(/\/calculations\/[a-z0-9]+$/, { timeout: 30000 }), page.click('.savebar button.primary')]);
  assert.match(await page.textContent('.calc-ruolo'), /Ammodernamento[\s\S]*Calcolo argano dell’impianto/, 'the type and the role of the record');
  // its Progetto draws the shaft (the parts in it are replaced): the way to it from the calculation
  await Promise.all([page.waitForURL(/\/progetto\?calc=[a-z0-9]+$/, { timeout: 30000 }), page.click('section[aria-labelledby="calc-progetto"] a[href*="/progetto?calc="]')]);
}

/** A «Solo argano» with its logbook (speed 1,00 m/s, travel 18 m: the design's), in an installation of its own: its
 *  Progetto drawn with another travel is held (tipoDaRivedere); a «Calcolo argano» from it with the logbook's speed at
 *  0,94 m/s (+6,4 %) is refused as a «Solo argano» and saved as a modernisation after «Passa ad Ammodernamento». */
export async function soloLibretto({ BASE, page, hydrated, stamp, projectData }) {
  step('Solo argano with its logbook (round 46): saved as it is; its Progetto with another travel is held, the type to review');
  await page.goto(`${BASE}/it/app/projects/new`);
  await page.fill('input[name="name"]', `Libretto ${stamp}`);
  await page.fill('input[name="city"]', 'Como');
  await Promise.all([page.waitForURL(/\/projects\/[a-z0-9]+\/calc$/), page.click('main form button[type="submit"]')]);
  await hydrated(page, '#Q');
  await page.click('.controls button:has-text("Esempio C")');
  await page.waitForSelector('.verdict .big');
  assert.ok(await page.isChecked('input[name="intervento"][value="SOLO_ARGANO"]'), 'Solo argano');
  await page.fill('.collaudo [data-lib="v"]', '1');
  await page.fill('.collaudo [data-lib="H"]', '18');
  await page.waitForSelector('.collaudo [data-var="corsa"]');
  assert.equal(await page.locator('[data-avviso="avviso_velocita_solo"], [data-avviso="avviso_corsa_solo"]').count(), 0, 'the logbook as the design: no change');
  await page.waitForSelector('.savebar button.primary:not([disabled])');
  await Promise.all([page.waitForURL(/\/calculations\/[a-z0-9]+$/, { timeout: 30000 }), page.click('.savebar button.primary')]);
  const soloUrl = page.url();
  // the Progetto on it: the shaft and the room typed, four rises of 3 m (12 m) against the logbook's 18 m
  await Promise.all([page.waitForURL(/\/progetto\?calc=[a-z0-9]+$/, { timeout: 30000 }), page.click('section[aria-labelledby="calc-progetto"] a[href*="/progetto?calc="]')]);
  await hydrated(page, '#bk-room-W');
  const room = { W: 3000, D: 3000, shaftX: 500, shaftY: 500, H: 2700, slab: 250, doorAt: 300, doorW: 800, doorH: 2000, panelW: 800, panelD: 300, panelH: 1800 };
  for (const [k, v] of Object.entries(room)) await page.fill(`#bk-room-${k}`, String(v));
  await page.selectOption('#bk-room-doorWall', 'front');
  await projectData({ page, hydrated });
  await page.waitForSelector('.lift-work .differenze [data-rivedere="tipo"]');
  assert.match(await page.textContent('.lift-work .differenze [data-corsa="entra"]'), /diversa da quella del libretto \(18,00 m\)/);
  assert.ok(await page.locator('.lift-work .differenze button:has-text("Porta nel calcolo")').count() > 0, '«Porta nel calcolo» offered');
  assert.ok(await page.locator('.lift-work .savebar button.btn-primary').isDisabled(), 'the save held');
  assert.match(await page.textContent('.lift-work .savebar'), /rivedi il tipo di intervento nel calcolo argano/);

  step('Solo argano: the logbook\'s speed +6 % refuses it; «Passa ad Ammodernamento» saves it with the speed locked');
  await page.goto(soloUrl);
  await Promise.all([page.waitForURL(/\/calc\?from=/), page.click('.page-head a[href*="/calc?from="]')]);
  await hydrated(page, '#Q');
  assert.equal(await page.inputValue('.collaudo [data-lib="v"]'), '1', 'the logbook kept with the record');
  await page.fill('.collaudo [data-lib="v"]', '0.94');
  await page.waitForSelector('[data-avviso="avviso_velocita_solo"]');
  assert.ok(await page.locator('.savebar button.primary').isDisabled(), 'refused as a «Solo argano»');
  assert.match(await page.textContent('.savebar'), /velocità variata dal libretto/);
  await page.click('[data-avviso="avviso_velocita_solo"] button:has-text("Passa ad Ammodernamento")');
  await page.waitForSelector('input[name="intervento"][value="AMMODERNAMENTO"]:checked');
  await page.waitForSelector('.parti-sino li[data-part="speed"] .parte-regola.si');
  assert.match(await page.textContent('.parti-sino li[data-part="speed"] .parte-perche'), /\+6,4 % rispetto a 0,94 m\/s del libretto: variata \(UNI 10411-1, 15\.1\)/);
  while (await page.locator('.parti-sino li.da').count()) {
    const part = await page.getAttribute('.parti-sino li.da', 'data-part');
    await page.click(`.parti-sino li[data-part="${part}"] label:has-text("No")`);
  }
  await page.waitForSelector('.savebar button.primary:not([disabled])');
  await Promise.all([page.waitForURL(/\/calculations\/[a-z0-9]+$/, { timeout: 30000 }), page.click('.savebar button.primary')]);
  assert.match(await page.textContent('.calc-ruolo'), /Ammodernamento/, 'saved as a modernisation');
  return soloUrl;
}

/** A «Calcolo argano» from the «Solo argano» `soloUrl` (its controller answered VVVF with the example): one speed refuses
 *  it (UNI 10411-1, 11.2.1); «Passa ad Ammodernamento con il quadro» locks the controller «Sì» with its reason, and saves. */
export async function soloQuadro({ page, hydrated, soloUrl }) {
  step('Solo argano on a controller of one speed (round 46, 11.2.1): refused; «Passa ad Ammodernamento con il quadro» saves it');
  await page.goto(soloUrl);
  await Promise.all([page.waitForURL(/\/calc\?from=/), page.click('.page-head a[href*="/calc?from="]')]);
  await hydrated(page, '#Q');
  const reg = '.parti-sino li[data-part="regolazione"]';
  await page.waitForSelector(`${reg} label.on:has-text("VVVF")`);
  assert.equal(await page.locator('.parti-altre').count(), 0, 'a «Solo argano» has no other parts');
  await page.click(`${reg} label:has-text("1 velocità")`);
  await page.waitForSelector('[data-avviso="avviso_inverter"]');
  assert.ok(await page.locator('.savebar button.primary').isDisabled(), 'refused as a «Solo argano»');
  assert.match(await page.textContent('.savebar'), /quadro esistente senza regolazione della velocità/);
  assert.equal(await page.locator('[data-avviso] button:has-text("Passa ad Ammodernamento")').count(), 1, 'one way to the modernisation');
  await page.click('[data-avviso="avviso_inverter"] button:has-text("Passa ad Ammodernamento con il quadro")');
  await page.waitForSelector('input[name="intervento"][value="AMMODERNAMENTO"]:checked');
  await page.waitForSelector('.parti-sino li[data-part="controller"] .parte-regola.si');
  assert.match(await page.textContent('.parti-sino li[data-part="controller"] .parte-perche'), /non ha la regolazione della velocità[\s\S]*UNI 10411-1, 11\.2\.1/);
  assert.ok(await page.isChecked(`${reg} input[value="1v"]`), 'the answer in view, changeable');
  while (await page.locator('.parti-sino li.da').count()) {
    const part = await page.getAttribute('.parti-sino li.da', 'data-part');
    await page.click(`.parti-sino li[data-part="${part}"] label:has-text("No")`);
  }
  await page.waitForSelector('.savebar button.primary:not([disabled])');
  await Promise.all([page.waitForURL(/\/calculations\/[a-z0-9]+$/, { timeout: 30000 }), page.click('.savebar button.primary')]);
  assert.match(await page.textContent('.calc-ruolo'), /Ammodernamento/, 'saved as a modernisation');
  assert.match(await page.textContent('main'), /Quadro di manovra/, 'the controller among the parts');
}

/** Round 47 (owner's decision D1): a modernisation renewed with its existing sling («Rifacimento», Example C under UNI
 *  10411-1, in an installation of its own). Without documents the speed, the load and the travel stay to answer, the
 *  list of what is missing naming what is needed; the logbook and the documented loads equal to the design's answer
 *  them «No» («dai documenti»), the answer stays the user's («Sì» against the documents says so); saved with the three
 *  «No», opened again with the same marks; the travel beyond the logbook's locks «Sì»; a record saved with it locked and
 *  opened again asks it again once the logbook's travel is cleared (round 47 recheck). */
export async function documentiNo({ BASE, page, hydrated, stamp }) {
  step('Ammodernamento with «Rifacimento» (round 47, D1): the logbook and the documented loads within the limits answer speed, load and travel «No»; beyond them «Sì»; reopened, the «No» stays the documents\'');
  await page.goto(`${BASE}/it/app/projects/new`);
  await page.fill('input[name="name"]', `Documenti ${stamp}`);
  await page.fill('input[name="city"]', 'Como');
  await Promise.all([page.waitForURL(/\/projects\/[a-z0-9]+\/calc$/), page.click('main form button[type="submit"]')]);
  await hydrated(page, '#Q');
  await page.click('.controls button:has-text("Esempio C")');
  await page.waitForSelector('.verdict .big');
  await page.click('label.intervento-tipo[data-tipo="AMMODERNAMENTO"]');
  await page.click('.parti-sino .rif-preset button');
  await page.waitForSelector('.parti-sino .rif-preset button.on');
  // round 52: the note short, the documents' rule in its «?»
  assert.match(await page.textContent('.parti-sino .rif-preset .note'), /tutte le parti sostituite tranne l’arcata/);
  assert.match(await page.textContent('.parti-sino .rif-preset .aiuto-testo'), /Velocità, portata e corsa seguono i documenti/);
  const VAR = ['speed', 'load', 'travel'];
  for (const p of VAR) await page.waitForSelector(`.parti-sino li.da[data-part="${p}"]`);
  const missing = await page.textContent('.missing-list');
  assert.match(missing, /Velocità nominale variata: «Sì» o «No», oppure la velocità del libretto/, missing);
  assert.match(missing, /Portata variata: «Sì» o «No», oppure i carichi documentati/, missing);
  assert.match(missing, /Corsa variata: «Sì» o «No», oppure la corsa del primo collaudo/, missing);
  // the logbook and the documented loads as Example C's design (1,00 m/s, 18 m; 630 / 700 / 700 + 0,5 · 630 kg)
  await page.fill('.collaudo [data-lib="v"]', '1');
  await page.fill('.collaudo [data-lib="H"]', '18');
  const doc = page.locator('.collaudo fieldset.parti', { has: page.locator('legend', { hasText: 'Carichi documentati' }) }).locator('input');
  for (const [i, x] of ['630', '700', '1015'].entries()) await doc.nth(i).fill(x);
  for (const p of VAR) {
    const li = `.parti-sino li[data-part="${p}"]`;
    await page.waitForSelector(`${li} .parte-doc`);
    assert.ok(await page.isChecked(`${li} input[value="no"]`), `${p}: «No» from the documents`);
    assert.equal(await page.locator(`${li}.da`).count(), 0, `${p}: not still to answer`);
  }
  assert.match(await page.textContent('.parti-sino li[data-part="travel"] .parte-perche'), /Corsa uguale a quella documentata/);
  assert.match(await page.textContent('.parti-sino li[data-part="speed"] .parte-perche'), /Velocità uguale a quella documentata/);
  assert.match(await page.textContent('.parti-sino li[data-part="load"] .parte-perche'), /uguali a quelli documentati[\s\S]*cabina nuova/);
  assert.equal(await page.getAttribute('.parti-sino li[data-part="travel"] .parte-scelta', 'aria-describedby'), 'parte-travel-perche');
  // the answer stays the user's: «Sì» against the documents says so; «No» again
  await page.click('.parti-sino li[data-part="travel"] label:has-text("Sì")');
  await page.waitForSelector('.parti-sino li[data-part="travel"] .parte-contro');
  assert.match(await page.textContent('.parti-sino li[data-part="travel"] .parte-contro'), /Contro i documenti/);
  await page.click('.parti-sino li[data-part="travel"] label:has-text("No")');
  await page.waitForSelector('.parti-sino li[data-part="travel"] .parte-doc');
  assert.equal(await page.locator('.parti-sino .parte-contro').count(), 0);
  // complete: saved with the three «No»
  await page.waitForSelector('.savebar button.primary:not([disabled])');
  await Promise.all([page.waitForURL(/\/calculations\/[a-z0-9]+$/, { timeout: 30000 }), page.click('.savebar button.primary')]);
  assert.match(await page.textContent('.calc-ruolo'), /Ammodernamento/, 'saved as a modernisation');
  assert.doesNotMatch(await page.textContent('main'), /velocità nominale \(variata\)|portata o carichi \(variati\)|corsa \(variata\)/i, 'none of the three among the parts');
  // opened again («Nuovo calcolo da questi dati»): the record's «No» with the documents' marks; the travel beyond the logbook's locks «Sì»
  await Promise.all([page.waitForURL(/\/calc\?from=/), page.click('.page-head a[href*="/calc?from="]')]);
  await hydrated(page, '#Q');
  for (const p of VAR) await page.waitForSelector(`.parti-sino li[data-part="${p}"] .parte-doc`);
  await page.fill('#H', '19');
  await page.waitForSelector('.parti-sino li[data-part="travel"] .parte-regola.si');
  assert.match(await page.textContent('.parti-sino li[data-part="travel"] .parte-perche'), /\+1,00 m rispetto a 18,00 m del libretto: variata \(UNI 10411-1, 16\)/);
  assert.ok(await page.locator('.parti-sino li[data-part="speed"] .parte-doc').count() === 1, 'the speed still «No» from the documents');
  // the documents' «No» stays theirs on the record opened again (round 47 review): the logbook's travel cleared, the
  // travel is to answer again — never a «No» nobody gave
  await page.fill('#H', '18');
  await page.waitForSelector('.parti-sino li[data-part="travel"] .parte-doc');
  await page.fill('.collaudo [data-lib="H"]', '');
  await page.waitForSelector('.parti-sino li.da[data-part="travel"]');
  assert.equal(await page.isChecked('.parti-sino li[data-part="travel"] input[value="no"]'), false, 'the travel: not a «No» nobody gave');
  assert.match(await page.textContent('.missing-list'), /Corsa variata: «Sì» o «No», oppure la corsa del primo collaudo/);
  // and their «Sì» (round 47 recheck): saved with the travel locked by the logbook, opened again, the logbook's travel
  // cleared — to answer again, never the «No» of a part the rule had answered
  await page.fill('.collaudo [data-lib="H"]', '18');
  await page.fill('#H', '19');
  await page.waitForSelector('.parti-sino li[data-part="travel"] .parte-regola.si');
  await page.waitForSelector('.savebar button.primary:not([disabled])');
  await Promise.all([page.waitForURL(/\/calculations\/[a-z0-9]+$/, { timeout: 30000 }), page.click('.savebar button.primary')]);
  await Promise.all([page.waitForURL(/\/calc\?from=/), page.click('.page-head a[href*="/calc?from="]')]);
  await hydrated(page, '#Q');
  await page.waitForSelector('.parti-sino li[data-part="travel"] .parte-regola.si');
  await page.fill('.collaudo [data-lib="H"]', '');
  await page.waitForSelector('.parti-sino li.da[data-part="travel"]');
  assert.equal(await page.isChecked('.parti-sino li[data-part="travel"] input[value="no"]'), false, 'the travel the rule had locked: not a «No» nobody gave');
  assert.match(await page.textContent('.missing-list'), /Corsa variata: «Sì» o «No», oppure la corsa del primo collaudo/);
  assert.ok(await page.locator('.savebar button.primary').isDisabled(), 'not saved while the travel is to answer');
}
