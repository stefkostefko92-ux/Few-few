// The smoke test's changes of speed and travel the logbook documents (round 46, S4): a modernisation renewing the lift
// with its existing sling under UNI 10411-11 whose logbook's speed locks «Velocità variata» on «Sì» with its reason
// (smoke.mjs draws the Progetto on it); a «Solo argano» whose drawn travel differs from the logbook's — the Progetto's
// save held, the type to review, «Porta nel calcolo» offered —, then a «Calcolo argano» from it with the speed +6 %
// over the logbook's: refused as a «Solo argano», «Passa ad Ammodernamento» saves it with the speed locked.
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
}
