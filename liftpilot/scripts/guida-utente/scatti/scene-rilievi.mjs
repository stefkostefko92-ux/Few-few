// Scenes of the guide's screenshots: the survey sheets (Rilievi), the first installation made from one, its «Calcolo
// argano».
import assert from 'node:assert/strict';
import { step } from '../../smoke-kit.mjs';
import { S, as, goto, hydrated } from './ambiente.mjs';
import { between, shot } from './scatto.mjs';

export const FORM = 'form[data-scheda-form]';
const SHEET_URL = /\/app\/rilievi\/[a-z0-9]{20,40}(\?.*)?$/;
/** Ticks a box of the survey form through its label. */
const tick = (page, name, value) => page.click(`${FORM} label:has(> input[name="${name}"][value="${value}"])`);

/** «Salva scheda»; when the sheet and its modules disagree, «Salva comunque». */
export async function saveSheet(page) {
  await page.click(`${FORM} .savebar button[type="submit"]:not([name])`);
  await Promise.race([page.waitForURL(SHEET_URL), page.waitForSelector('#confirm-summary'), page.waitForSelector('#error-summary')]);
  if (await page.locator('#error-summary').count()) throw new Error(`the sheet is refused: ${await page.locator('#error-summary').innerText()}`);
  if (!SHEET_URL.test(page.url())) await Promise.all([page.waitForURL(SHEET_URL), page.click(`${FORM} button[name="conferma"]`)]);
  await page.waitForSelector('.rv-flash');
}

/** A new survey sheet saved with these fields (#f-<key> → value) and these ticks (name → value); its address. */
async function newSheet(page, fields, checks) {
  await goto(page, '/it/app/rilievi/nuovo');
  await hydrated(page, `${FORM}[data-live] button[type="submit"]`);
  for (const [k, v] of Object.entries(fields)) await page.fill(`#f-${k}`, v);
  for (const [name, value] of Object.entries(checks)) await tick(page, name, value);
  await saveSheet(page);
  return page.url().replace(/\?.*$/, '');
}

export async function rilievi() {
  step('survey sheets: the new sheet, an hydraulic one');
  const { page, errors } = await as('chief');
  await goto(page, '/it/app/rilievi/nuovo');
  await hydrated(page, `${FORM}[data-live] button[type="submit"]`);
  await shot('rilievi-nuovo', page);
  await tick(page, 'tipoImpianto', 'IDRAULICO');
  await page.waitForSelector('#s-centralina', { state: 'visible' });
  await page.locator('#s-centralina').scrollIntoViewIfNeeded();
  await shot('rilievi-nuovo-idraulico', page);

  step('survey sheets: the sheets of the demo');
  // 1. the full one: stops measured, the panel's order, the argano's data sheet, the suspensions
  await goto(page, '/it/app/rilievi/nuovo');
  await hydrated(page, `${FORM}[data-live] button[type="submit"]`);
  const A = { numeroImpianto: '70412', matricola: '0412768', indirizzo: 'Condominio Via dei Mille 12, Bergamo', buonoLavoro: 'BL-2026/118', portataKg: '630', fermate: '5', marca: 'Schindler' };
  for (const [k, v] of Object.entries(A)) await page.fill(`#f-${k}`, v);
  for (const [name, value, opens] of [['tipoImpianto', 'ELETTRICO'], ['tipoPorte', 'AUTOMATICHE', '#f-sospensioni'], ['doppioAccesso', 'no'], ['bottoniereMisure', 'si', '#f-misure'],
    ['quadroMarca', 'PELAZZA'], ['quadroOrdine', 'si', '#f-oq'], ['arganoPreventivo', 'si', '#f-pa'], ['sospensioni', 'si', '#f-sospensioniNumero']]) {
    await tick(page, name, value);
    if (opens) await page.waitForSelector(opens, { state: 'visible' });
  }
  await page.fill('#f-sospensioniNumero', '5');
  await saveSheet(page);
  const sheets = [page.url().replace(/\?.*$/, '')];
  // 2.–6. simpler sheets, other addresses and days
  for (const [f, tipo] of [
    [{ numeroImpianto: '70415', matricola: '0398221', indirizzo: 'Residenza Le Querce, Via Zambianchi 8, Bergamo', portataKg: '480', fermate: '4', data: '2026-10-21' }, 'ELETTRICO'],
    [{ numeroImpianto: '70420', matricola: '0455190', indirizzo: 'Via Borgo Palazzo 31, Bergamo', portataKg: '630', fermate: '6', data: '2026-10-19' }, 'ELETTRICO'],
    [{ numeroImpianto: '70431', matricola: '0271904', indirizzo: 'Condominio Il Glicine, Via Pignolo 4, Bergamo', portataKg: '1000', fermate: '3', data: '2026-10-15' }, 'IDRAULICO'],
    [{ numeroImpianto: '70437', matricola: '0502266', indirizzo: 'Via Camozzi 17, Bergamo', portataKg: '450', fermate: '5', data: '2026-10-12' }, 'ELETTRICO'],
    [{ numeroImpianto: '70440', matricola: '0150973', indirizzo: 'Palazzina Rosa, Via Corridoni 2, Bergamo', portataKg: '630', fermate: '4', data: '2026-10-08' }, 'ELETTRICO'],
  ]) sheets.push(await newSheet(page, f, { tipoImpianto: tipo }));
  S.sheets = sheets;

  step('survey sheets: the list, a search, the sheet, its print');
  await goto(page, '/it/app/rilievi');
  await hydrated(page, '#q');
  await shot('rilievi-elenco', page);
  await page.fill('#q', 'Mille');
  await page.waitForURL((u) => u.searchParams.get('q') === 'Mille');
  await page.waitForSelector('#results mark');
  await shot('rilievi-elenco-ricerca', page);
  await goto(page, sheets[0]);
  await shot('rilievi-scheda', page);
  await goto(page, `${sheets[0]}/stampa`);
  await page.waitForSelector('.rv-paper');
  await shot('rilievi-stampa', page, { clip: { x: 0, y: 0, width: 1440, height: 1100 } });

  step('survey sheets: edit (the last change by a colleague), a conflict');
  const tec = await as('technician');
  const edit = async (p, marca) => {
    await goto(p, `${sheets[1]}/modifica`);
    await hydrated(p, `${FORM}[data-live] button[type="submit"]`);
    if (marca) { await p.fill('#f-marca', marca); await saveSheet(p); }
  };
  await edit(tec.page, 'Kone');
  await edit(page);
  await shot('rilievi-modifica', page);
  // the colleague saves while the form is open: the second save is a conflict
  await page.fill('#f-marca', 'Otis');
  await edit(tec.page, 'Kone Monospace');
  await page.click(`${FORM} .savebar button[type="submit"]:not([name])`);
  await page.waitForSelector('.rv-conflict');
  await shot('rilievi-conflitto', page.locator('.rv-conflict'), { pad: 20 });
  // knowingly saved, then the form left clean
  await Promise.all([page.waitForURL(SHEET_URL), page.click(`${FORM} .savebar button[type="submit"]:not([name])`)]);

  step('survey sheets: to the trash, the trash, final deletion, back');
  for (const i of [5, 4]) {
    await goto(page, `${sheets[i]}/elimina`);
    await hydrated(page, 'main form button[type="submit"]');
    if (i === 5) await shot('rilievi-elimina', page);
    await Promise.all([page.waitForURL(/\/app\/rilievi$/), page.click('main form button[type="submit"]')]);
  }
  await goto(page, '/it/app/rilievi/cestino');
  await hydrated(page, '#results tbody tr form button');
  await shot('rilievi-cestino', page);
  const id4 = sheets[4].split('/').pop();
  await goto(page, `/it/app/rilievi/cestino/${id4}/elimina`);
  await shot('rilievi-elimina-definitiva', page);
  // not deleted: «Ripristina» brings it back
  await goto(page, '/it/app/rilievi/cestino');
  await hydrated(page, '#results tbody tr form button');
  await Promise.all([page.waitForURL(SHEET_URL), page.locator(`#results tr:has(a[href$="/app/rilievi/${id4}"]) form button`).click()]);
  assert.deepEqual(errors, [], 'browser errors');
}

export async function p1() {
  step('installation 1: the blank form, then the one made from the survey sheet');
  const { page } = await as('chief');
  await goto(page, '/it/app/projects/new');
  await hydrated(page, 'main form button[type="submit"]');
  await shot('nuovo-impianto-vuoto', page, { clip: await between(page, 'main h1', 'main form', 40) });
  // «Crea impianto» from the sheet's panel: the form filled from the survey, then its calculation
  await goto(page, S.sheets[0]);
  await page.waitForSelector('#collegamento a:has-text("Crea impianto")');
  await Promise.all([page.waitForURL(/\/app\/projects\/new\?rilievo=/), page.click('#collegamento a:has-text("Crea impianto")')]);
  await hydrated(page, 'main form button[type="submit"]');
  await page.waitForSelector('main form .badge.rilievo');
  await shot('nuovo-impianto-da-rilievo', page);
  await Promise.all([page.waitForURL(/\/projects\/[a-z0-9]+\/calc$/), page.click('main form button[type="submit"]')]);
  S.p1 = page.url().replace(/\/calc$/, '');
}

/** The calculator's «Salva calcolo»: the saved calculation's address. */
export async function saveCalc(page) {
  const SAVE = '.savebar button.primary:not([disabled])';
  await page.waitForSelector(SAVE, { timeout: 30000 });
  await Promise.all([page.waitForURL(/\/calculations\/[a-z0-9]+$/, { timeout: 30000 }), page.click('.savebar button.primary')]);
  return page.url();
}

export async function p1calc() {
  step('calculation of the first installation: the example B, its results, saved');
  const { page, errors } = await as('chief');
  await goto(page, `${S.p1}/calc`);
  await hydrated(page, '#Q');
  await page.click('.controls button:has-text("Esempio B")');
  await page.waitForSelector('.verdict .big');
  await page.waitForSelector('.savebar .draft-bar', { timeout: 20000 }).catch(() => undefined);
  const group = (title) => page.locator(`details.group:has(> summary:has-text("${title}"))`);
  await shot('calc-form', page.locator('.panel.intervento'), { also: [group('Impianto'), group('Disposizione e geometria')], pad: 10 });
  await shot('calc-risultati', page.locator('.layout .verdict'), { also: [page.locator('.layout .diagram')], pad: 10 });
  S.calc1 = await saveCalc(page);
  await page.waitForSelector('dl.cartiglio');
  await shot('calc-saved', page, { clip: { x: 0, y: 0, width: 1440, height: 1200 } });
  assert.deepEqual(errors, [], 'browser errors');
}
