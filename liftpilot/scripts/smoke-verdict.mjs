// The smoke test's step for the result pill (src/components/VerdictChecks.tsx): on the dashboard the first result that
// does not pass (else the first that passes with warnings) opens, with a click, the panel of the checks behind its
// count; the panel lists exactly as many as the pill's number — a record the engines no longer reproduce may list
// what its stored records keep, and then says why —; Esc closes it and leaves the focus on the pill, where Enter opens and
// closes it again.
import assert from 'node:assert/strict';
import { step } from './smoke-kit.mjs';

export async function verdictPopover({ BASE, page, hydrated }) {
  step('a result that does not pass shows the checks behind its number; Esc closes them');
  await page.goto(`${BASE}/it/app?all=1`);
  await page.waitForSelector('.dash-row');
  // a record of the running engines first (no «da aggiornare» beside its pill): its list is the one its count was made from
  const fresh = '.dash-row:not(:has(.chip.old))';
  const picks = [[`${fresh} .vc-pill.fail`, 'fail'], [`${fresh} .vc-pill.warn`, 'warn'], ['.dash-row .vc-pill.fail', 'fail'], ['.dash-row .vc-pill.warn', 'warn']];
  let pick = null;
  for (const [sel, tone] of picks) if (await page.locator(sel).count()) { pick = { sel, tone }; break; }
  assert.ok(pick, 'a result with checks to show on the dashboard');
  await hydrated(page, pick.sel);
  const pill = page.locator(pick.sel).first();
  const n = Number(/(\d+)/.exec((await pill.textContent()) ?? '')?.[1]);
  assert.ok(n > 0, 'the pill counts its checks');
  assert.equal(await pill.getAttribute('aria-expanded'), 'false');
  assert.match((await pill.getAttribute('aria-label')) ?? '', /mostra le verifiche/, 'the pill says what it opens');
  await pill.click();
  const panel = page.locator('.vc-panel[role="dialog"]');
  await panel.waitFor();
  assert.equal(await pill.getAttribute('aria-expanded'), 'true');
  assert.equal(await pill.getAttribute('aria-controls'), await panel.getAttribute('id'), 'the pill controls its panel');
  // read from the server on this first opening
  await page.waitForSelector('.vc-panel .vc-group, .vc-panel .vc-note, .vc-panel [role="alert"]', { timeout: 30000 });
  assert.equal(await page.locator('.vc-panel [role="alert"]').count(), 0, 'the checks loaded');
  const listed = await page.locator(`.vc-panel .vc-group.${pick.tone} .vc-item`).count();
  const note = await page.locator('.vc-panel .vc-note').count();
  if (pick.sel.startsWith(fresh)) {
    assert.equal(listed, n, `the panel lists the pill's ${n}`);
    assert.equal(note, 0, 'nothing to explain on a record of the running engines');
  } else assert.ok(listed === n || note === 1, `${listed} listed for ${n}, and no reason given`);
  // every check named, with its value
  for (const item of await page.locator('.vc-panel .vc-item').all()) {
    assert.ok(((await item.locator('.vc-name').textContent()) ?? '').trim(), 'a check without its name');
    assert.ok(((await item.locator('.vc-value').textContent()) ?? '').trim(), 'a check without its value');
  }
  assert.match((await page.getAttribute('.vc-panel .vc-open', 'href')) ?? '', /^\/it\/app\/(calculations|lift-designs|shaft-designs|room-designs)\/[a-z0-9]+#/);
  await page.keyboard.press('Escape');
  await panel.waitFor({ state: 'detached' });
  assert.equal(await pill.getAttribute('aria-expanded'), 'false');
  assert.ok(await pill.evaluate((el) => el === globalThis.document.activeElement), 'the focus stays on the pill');
  // the keyboard toggles it as the click does: Enter opens, Enter closes (aria-expanded says which)
  await page.keyboard.press('Enter');
  await panel.waitFor();
  assert.equal(await pill.getAttribute('aria-expanded'), 'true', 'Enter opens the panel');
  await page.keyboard.press('Enter');
  await panel.waitFor({ state: 'detached' });
  assert.equal(await pill.getAttribute('aria-expanded'), 'false', 'Enter closes the panel');
}
