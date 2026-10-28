// The smoke test's remedies (round 54): on the Progetto a check to look at opens its remedies, each tried on the whole
// design; «Applica» puts one right (the check leaves the ones to look at), then the draft is discarded so the rest of
// the run finds the design as saved. «Calcolo argano» lists the checks its verdict counts with their own remedies.
import assert from 'node:assert/strict';
import { step } from './smoke-kit.mjs';

const WHY_NONE = /Calcolo argano|nessun valore|Nessun rimedio|Inserisci|Scrivi|Dati dell’impianto/;

export async function rimediFlow({ page, hydrated, projectUrl }) {
  step('Rimedi: a check to look at — its remedies tried on the whole design; «Applica» puts it right; the draft discarded');
  await page.goto(`${projectUrl}/progetto`);
  await hydrated(page, '.lato-tabs button');
  await page.click('.lato-tabs button:has-text("Verifiche")');
  const buttons = page.locator('#lato-verifiche-panel .lift-checks > .table-panel button:has-text("Rimedi")');
  const n = await buttons.count();
  assert.ok(n > 0, 'a check to look at, with its remedies');
  let fixed = null;
  for (let i = 0; i < n && !fixed; i++) {
    const b = buttons.nth(i), id = await b.evaluate((x) => x.closest('tr')?.getAttribute('data-check'));
    await b.click();
    const row = page.locator('#lato-verifiche-panel tr.rimedi-row');
    await row.locator('.rimedi:not([aria-busy])').waitFor({ timeout: 90000 });
    const apply = row.locator('.rimedi-list > li').first().locator('button:has-text("Applica")');
    if (await apply.count()) {
      assert.match((await row.textContent()) ?? '', /provato sull’intero progetto/, 'how the remedies were found');
      await apply.click();
      fixed = id;
    } else {
      assert.match((await row.textContent()) ?? '', WHY_NONE, `${id}: why there is none`);
      await b.click();
    }
  }
  assert.ok(fixed, 'a remedy found and applied');
  await page.waitForFunction((id) => !globalThis.document.querySelector(`#lato-verifiche-panel .lift-checks > .table-panel tr[data-check="${id}"]`), fixed, { timeout: 30000 });
  await page.waitForSelector('.savebar .draft-bar button:has-text("Scarta la bozza")', { timeout: 30000 });
  await page.click('.savebar .draft-bar button:has-text("Scarta la bozza")');
  // discarded, the page loads again (DraftBar: window.location.reload)
  await Promise.all([page.waitForEvent('load', { timeout: 30000 }), page.click('.savebar .draft-bar button:has-text("Sì, scarta")')]);
  await hydrated(page, '.lato-tabs button');

  step('Rimedi in «Calcolo argano»: the checks its verdict counts, each with its remedies');
  const calc = await page.getAttribute('a:has-text("Modifica nel calcolo argano")', 'href');
  assert.ok(calc, 'the way to the calculation');
  await page.goto(new URL(calc, page.url()).href);
  await page.waitForSelector('.verdict');
  if (await page.locator('.rimedi-calc').count()) {
    await page.locator('.rimedi-calc-list > li').first().locator('button:has-text("Rimedi")').click();
    await page.waitForSelector('.rimedi-calc .rimedi:not([aria-busy])', { timeout: 60000 });
    assert.match((await page.textContent('.rimedi-calc .rimedi')) ?? '', /Applica|Nessun rimedio/, 'remedies or why none');
  }
}
