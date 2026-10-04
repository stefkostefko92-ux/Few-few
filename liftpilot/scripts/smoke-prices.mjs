// The smoke test's price list: the owner prices an article and adds two free lines — one by the stop for the whole
// projects, one a corpo for the replacements —; the saved design's cost then counts the first with its stops, the
// replacement's machine room the second; then the two lines are removed again (the platform company keeps its list).
import assert from 'node:assert/strict';
import { step } from './smoke-kit.mjs';

export async function priceList({ BASE, page, hydrated, stamp, liftUrl, roomUrl }) {
  step('price list: an article, two free lines, the cost of the projects');
  const form = 'main form:has(input[name^="p:"])', free = 'section[aria-labelledby="pg-free"]';
  await page.goto(`${BASE}/it/app/prices`);
  await hydrated(page, `${form} button[type="submit"]`);
  await page.locator('main input[name="p:car"]').fill('12.500,00');
  const n = await page.locator(`${free} input[name$=":text"]`).count(), stop = `Ponteggio ${stamp}`, lot = `Trasporto ${stamp}`;
  await page.click(`${free} button:has-text("Aggiungi una voce")`);
  await page.fill(`main input[name="c:${n}:text"]`, stop);
  await page.fill(`main input[name="c:${n}:price"]`, '150,00');
  await page.selectOption(`main select[name="c:${n}:basis"]`, 'STOP');
  await page.selectOption(`main select[name="c:${n}:scope"]`, 'FULL');
  await page.click(`${free} button:has-text("Aggiungi una voce")`);
  await page.fill(`main input[name="c:${n + 1}:text"]`, lot);
  await page.fill(`main input[name="c:${n + 1}:price"]`, '300');
  await page.selectOption(`main select[name="c:${n + 1}:scope"]`, 'REPLACEMENT');
  await page.click(`${form} button[type="submit"]`);
  await page.waitForSelector('main .alert-ok');
  assert.equal(await page.locator('main input[name="p:car"]').inputValue(), '12.500,00');
  assert.equal(await page.locator('main input[name="p:panev:B 65 320"]').inputValue(), '11,77', 'Panev starts from its list');
  // back from the database, in their order
  await page.reload();
  await hydrated(page, `${form} button[type="submit"]`);
  assert.equal(await page.locator(`main input[name="c:${n}:text"]`).inputValue(), stop);
  assert.equal(await page.locator(`main input[name="c:${n + 1}:price"]`).inputValue(), '300,00');

  // the whole project counts the line by the stop and the plant from the design; the replacement the one a corpo
  await page.goto(liftUrl);
  const cost = await page.textContent('section[aria-labelledby="project-cost-h"]');
  assert.ok(cost.includes(stop) && !cost.includes(lot), 'free lines of the whole projects');
  assert.match(cost, /Quadro di manovra[\s\S]*Cottimista \(montaggio\)/, 'the plant counted from the design');
  await page.goto(roomUrl);
  const repl = await page.textContent('section[aria-labelledby="project-cost-h"]');
  assert.ok(repl.includes(lot) && !repl.includes(stop), 'free lines of the replacements');

  // the two lines removed again
  await page.goto(`${BASE}/it/app/prices`);
  await hydrated(page, `${form} button[type="submit"]`);
  for (const text of [stop, lot]) await page.click(`${free} button[aria-label$="${text}"]`);
  await page.click(`${form} button[type="submit"]`);
  await page.waitForSelector('main .alert-ok');
  await page.reload();
  assert.equal(await page.locator(`${free} input[name$=":text"]`).count(), n, 'the free lines as they were');
  await page.goto(`${BASE}/it/app/billing`);
  await page.waitForSelector('main .status-pill');
}
