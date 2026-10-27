// The relazione tecnica di modifica in the smoke test (round 52: after the owner's model, RT 2.x), on the installations
// the run made: the replacement (scripts/smoke-replacement.mjs): from its machine room's page to the workspace on its
// «Calcolo argano», the registry with the year 1978 (DPR 1497/1963 derived, then confirmed on the logbook), a 2-page PDF
// and a phone photo uploaded (the document joins on its own, the photo when ticked), the steps with what each still
// needs, the first page and the signatures typed (the draft kept), the draft's PDF with «BOZZA», the issue (the checks not
// met or with «Attenzione» confirmed first), the RT's page with its components, its PDF = the fascicolo + the files'
// pages, a revision R1 with its note; the main installation (its modernisation): the owner missing blocks the issue, the
// components' required fields filled, issued; a «Trasformazione completa» says why it has none; the old relazione
// tecnica of the machine room is gone (404); the workspace fits a phone.
import { Buffer } from 'node:buffer';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import { step } from './smoke-kit.mjs';

// a 24 × 12 JPEG and an EXIF segment with a GPS marker in it (the upload strips it: smoke-allegati.mjs checks how)
const JPEG = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAA0JCgsKCA0LCgsODg0PEyAVExISEyccHhcgLikxMC4pLSwzOko+MzZGNywtQFdBRkxOUlNSMj5aYVpQYEpRUk//2wBDAQ4ODhMREyYVFSZPNS01T09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0//wAARCAAMABgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDo9E8Gf2Tq0F9/aHneVu+TyducqR13H1rq6KKmMFFWRtXxFSvLmqO7CiiiqMT/2Q==', 'base64');
function phoneJpeg(stamp) {
  const text = Buffer.from(`GPS-45.4642N-9.1900E-rt-${stamp}\0`, 'latin1'), tiff = Buffer.alloc(22);
  tiff.write('MM', 0, 'latin1'); tiff.writeUInt16BE(42, 2); tiff.writeUInt32BE(8, 4); tiff.writeUInt16BE(1, 8);
  tiff.writeUInt16BE(0x010e, 10); tiff.writeUInt16BE(2, 12); tiff.writeUInt32BE(text.length, 14); tiff.writeUInt32BE(tiff.length, 18);
  const body = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff, text]);
  return Buffer.concat([JPEG.subarray(0, 20), Buffer.from([0xff, 0xe1, (body.length + 2) >> 8, (body.length + 2) & 0xff]), body, JPEG.subarray(20)]);
}
async function pdf(pages, label) {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([595.28, 841.89]).drawText(`${label} ${i + 1}`, { x: 40, y: 800, size: 12 });
  return Buffer.from(await doc.save());
}
const pagesOf = async (bytes) => (await PDFDocument.load(bytes, { updateMetadata: false })).getPageCount();

/** The text of a PDF (pdftotext of poppler-utils), or null where the tool is missing. */
function pdfText(bytes) {
  const r = spawnSync('pdftotext', ['-layout', '-', '-'], { input: bytes, maxBuffer: 64 * 1024 * 1024 });
  return r.status === 0 ? r.stdout.toString('utf8') : null;
}

const ws = (page) => page.locator('[data-rt="workspace2"]');
const mancanti = async (page) => (await page.locator('#rt2-firme .rt-mancanti li').allTextContents()).map((x) => x.trim());

/** The registry: the owner, the maintenance and the law of the approval confirmed on the logbook (`legge`: the derived
 *  law it must offer first), saved; the page read again. */
async function anagrafica(page, hydrated, { anno, legge, proprietario }) {
  await hydrated(page, '#rt-prop');
  if (anno) await page.fill('#rt-anno', anno);
  assert.match(await page.textContent('#rt-legge option:first-child'), legge, 'the law derived');
  await page.check('#rt-legge-ok');
  await page.fill('#rt-prop', proprietario);
  await page.fill('#rt-man', 'Ascensori Brianza');
  await page.click('form.rt-anagrafica button[type="submit"]');
  await page.waitForSelector('form.rt-anagrafica .note:has-text("Anagrafica salvata.")');
  await page.reload();
  await hydrated(page, '#rt2-firme');
  assert.ok(!(await mancanti(page)).some((m) => m.startsWith('Dati dell’impianto')), 'the registry complete');
}

/** «Dati generali» and the engineer of «Verificato da» typed («Redatto da»: the user, prefilled); the draft kept. */
async function compila(page, hydrated, descrizione) {
  const g = page.locator('#rt2-generale'), f = page.locator('#rt2-firme');
  await hydrated(page, '#rt2-generale select');
  await g.getByLabel('Ascensore di costruzione:', { exact: true }).fill('Esempio Elevatori');
  await g.getByLabel('Utenti autorizzati ed esperti:', { exact: true }).selectOption('no');
  await g.getByLabel('Componenti modificati o tipologia modifica:', { exact: true }).fill(descrizione);
  const red = f.locator('.rt2-campi').nth(0), ver = f.locator('.rt2-campi').nth(1);
  assert.notEqual(await red.getByLabel('Nome e cognome', { exact: true }).inputValue(), '', '«Redatto da»: the user, prefilled');
  await ver.getByLabel('Titolo', { exact: true }).selectOption('Ing.');
  await ver.getByLabel('Nome e cognome', { exact: true }).fill('Laura Bianchi');
  await ver.getByLabel('Provincia dell’Ordine', { exact: true }).fill('Milano');
  await ver.getByLabel('Numero di iscrizione', { exact: true }).fill('A12345');
  await page.waitForFunction(() => /Bozza (salvata|ripresa)/.test(globalThis.document.querySelector('.rt-bar .draft-bar')?.textContent ?? ''), null, { timeout: 20000 });
}

/** Every component field still to fill (marked by the workspace): a choice its first option, a number its least value,
 *  a text a word — the smoke's data, not a lift's; the checks they give are confirmed at the issue. */
async function riempi(page) {
  const need = page.locator('[data-rt="workspace2"] section.rt-card:not(#rt2-generale):not(#rt2-firme) .field.need');
  for (let i = 0; i < 40 && await need.count(); i++) {
    const f = need.first(), sel = f.locator('select'), num = f.locator('input[type="number"]');
    if (await sel.count()) await sel.selectOption((await sel.locator('option').nth(1).getAttribute('value')) ?? '');
    else if (await num.count()) await num.fill((await num.getAttribute('min')) ?? '1');
    else await f.locator('input, textarea').first().fill('Dato della prova');
  }
  assert.equal(await need.count(), 0, 'every component field filled');
}

/** The issue: with checks not met or with «Attenzione» the engineer confirms them first («Annulla» goes back); the RT's
 *  page. */
async function emetti(page, label) {
  const button = page.locator(`#rt2-firme button.btn-primary:has-text("${label}")`);
  assert.equal(await button.isDisabled(), false, `«${label}» enabled: ${(await mancanti(page)).join('; ')}`);
  const conferma = page.locator('#rt2-firme [role="alertdialog"]');
  await button.click();
  const esito = await Promise.race([page.waitForURL(/\/app\/relazioni\/[a-z0-9]+$/, { timeout: 90000 }).then(() => 'emessa'), conferma.waitFor({ timeout: 90000 }).then(() => 'conferma')]);
  if (esito === 'conferma') {
    assert.ok(await conferma.locator('li').count() > 0, 'the checks to confirm, listed');
    await conferma.locator('button:has-text("Annulla")').click();
    await conferma.waitFor({ state: 'detached' });
    await button.click();
    await conferma.waitFor();
    await Promise.all([page.waitForURL(/\/app\/relazioni\/[a-z0-9]+$/, { timeout: 90000 }), conferma.locator('button:has-text("Emetti comunque")').click()]);
  }
  return page.url();
}

/** The replacement's RT, from its machine room's page while its «Solo argano» is the installation's latest calculation. */
export async function rtRoom({ BASE, page, hydrated, stamp, roomUrl, roomId }) {
  step('RT: the old relazione tecnica of the machine room is gone; its page leads to the relazione tecnica di modifica');
  assert.equal((await page.request.get(`${BASE}/api/room-designs/${roomId}/relazione`)).status(), 404, 'old room relazione: 404');
  await page.goto(roomUrl);
  await Promise.all([page.waitForURL(/\/relazione-tecnica$/), page.click('.page-head .actions a[href$="/relazione-tecnica"]')]);
  const wsUrl = page.url(), projectId = wsUrl.split('/').at(-2);
  assert.equal(await page.locator('[data-rt-base="calcolo"]').count(), 1, 'made on the «Calcolo argano»');
  assert.equal(await ws(page).count(), 1, 'the workspace after the owner’s model');

  step('RT: the steps with what each needs; the registry — 1978 gives DPR 1497/1963 to confirm on the logbook');
  const nav = (await page.locator('.rt-nav a').allTextContents()).join(' | ');
  assert.match(nav, /Dati generali \(mancano \d+\)/, nav);
  assert.match(nav, /Funi di trazione/, 'the ropes replaced bring their pages');
  assert.match(nav, /Macchina/, 'the machine replaced brings its page');
  await anagrafica(page, hydrated, { anno: '1978', legge: /DPR 1497\/1963 \(dall’anno di installazione\)/, proprietario: 'Condominio Via Roma 1' });

  step('RT: two files of the installation (a 2-page PDF, a phone photo): the document joins on its own, the photo when ticked');
  const post = (file, fields) => page.request.post(`${BASE}/api/projects/${projectId}/allegati`, { headers: { Origin: BASE }, multipart: { ...fields, file } });
  const doc = await pdf(2, `Libretto RT ${stamp}`);
  assert.equal((await post({ name: 'libretto.pdf', mimeType: 'application/pdf', buffer: doc }, { kind: 'LIBRETTO_VERBALE', title: 'Libretto e verbali' })).status(), 201);
  assert.equal((await post({ name: 'foto.jpg', mimeType: 'image/jpeg', buffer: phoneJpeg(stamp) }, { kind: 'FOTO', title: 'Fotografia del locale' })).status(), 201);
  await page.goto(wsUrl);
  await hydrated(page, '#rt2-allegati ol.rt2-dich input');
  const file = (t) => page.locator(`#rt2-allegati ol.rt2-dich li:has-text("${t}") input`);
  assert.equal(await file('Libretto e verbali').isChecked(), true, 'the document, on its own');
  assert.equal(await file('Fotografia del locale').isChecked(), false, 'a photo is never attached on its own');
  await file('Fotografia del locale').check();
  // the documents the fascicolo declares attached: the machine's and the ropes' proposed
  assert.ok(await page.locator('#rt2-allegati ul.rt2-dich input:checked').count() >= 2, 'the documents proposed');

  step('RT: first page and signatures typed (the draft kept); the draft’s PDF with «BOZZA»');
  await compila(page, hydrated, `Sostituzione dell’argano esistente con uno nuovo, prova ${stamp}: funi sostituite, quadro esistente.`);
  await riempi(page);
  assert.deepEqual(await mancanti(page), [], 'nothing missing');
  assert.match((await page.locator('.rt-nav a').allTextContents()).join(' | '), /Firme ed emissione ✓/);
  const preview = await page.request.get(`${BASE}/api/projects/${projectId}/relazione-tecnica/anteprima`);
  assert.equal(preview.status(), 200, 'the draft’s PDF');
  const draftPdf = await preview.body();
  assert.equal(draftPdf.subarray(0, 5).toString('latin1'), '%PDF-');
  const bozza = pdfText(draftPdf);
  if (bozza !== null) assert.match(bozza, /BOZZA/, 'the draft says it is one');
  await page.goto(wsUrl);
  assert.match(await page.textContent('.rt-bar .draft-bar'), /Bozza ripresa/, 'the draft taken up again');

  step('RT: issued (the checks confirmed first); its page with its components; its PDF is the fascicolo and the files’ pages');
  await hydrated(page, '#rt2-firme button.btn-primary');
  const rtUrl = await emetti(page, 'Emetti la relazione'), rtId = rtUrl.split('/').pop();
  const numero = /RT (\d{2}-\d{3}) R0$/.exec(await page.textContent('h1'))?.[1];
  assert.ok(numero, 'number and revision');
  const comp = (await page.locator('section[aria-labelledby="rt-p-componenti"] li').allTextContents()).join(' | ');
  assert.match(comp, /Funi di trazione/, comp);
  assert.match(comp, /Macchina/, comp);
  const res = await page.request.get(`${BASE}/api/relazioni/${rtId}/pdf`);
  assert.equal(res.status(), 200);
  assert.match(res.headers()['content-disposition'] ?? '', /RT-\d{2}-\d{3}-R0-/);
  const body = await res.body(), total = await pagesOf(body);
  const testo = pdfText(body);
  if (testo !== null) {
    for (const x of ['Matricola n°', 'Funi di trazione', 'Created and Designed by Carbon Stealth VCC', `${numero}`]) assert.ok(testo.includes(x), `«${x}» in the PDF`);
    assert.ok(!/BOZZA/.test(testo), 'an issued RT is no draft');
  }
  await page.reload();
  const kept = Number(/(\d+) pagin[ae] senza i documenti allegati/.exec(await page.textContent('dl.cartiglio'))?.[1] ?? NaN);
  assert.equal(total, kept + 3, `body ${kept} + PDF 2 + photo 1 = ${total}`);
  await page.goto(wsUrl);
  assert.equal(await page.locator(`.rt-emesse li[data-rt-id="${rtId}"]`).count(), 1, 'listed among the RTs issued');
  assert.equal((await page.request.get(`${BASE}/api/projects/${projectId}/relazione-tecnica/anteprima`)).status(), 200, 'a new draft starts from the RT issued');

  step('RT: revision R1 of the same number, with its note');
  await page.goto(rtUrl);
  await Promise.all([page.waitForURL(/\/relazione-tecnica\?revisione=/), page.click('.page-head a:has-text("Nuova revisione")')]);
  assert.match(await page.textContent('main .alert-info'), /revisione R1/);
  await hydrated(page, '#rt2-firme input');
  await page.locator('#rt2-firme').getByLabel(/^Che cosa cambia rispetto a /).fill('Corretta la descrizione della modifica');
  await page.waitForFunction(() => /Bozza salvata/.test(globalThis.document.querySelector('.rt-bar .draft-bar')?.textContent ?? ''), null, { timeout: 20000 });
  const r1Url = await emetti(page, 'Emetti la revisione');
  assert.match(await page.textContent('h1'), new RegExp(`RT ${numero} R1$`), 'the same number, revision 1');
  assert.equal(await page.locator('main section[aria-labelledby="rt-p-rev"] li').count(), 2, 'R0 and R1');
  assert.equal((await page.goto(rtUrl)).status(), 200);
  assert.match(await page.textContent('main .alert-info'), /non è l’ultima revisione/);

  step('RT: the installation’s page lists it; the workspace fits a phone');
  await page.goto(wsUrl.replace(/\/relazione-tecnica$/, ''));
  assert.ok(await page.locator('.rt-emesse li').count() >= 2, 'the RTs on the installation’s page');
  await page.setViewportSize({ width: 360, height: 800 });
  for (const url of [wsUrl, r1Url]) {
    await page.goto(url);
    assert.ok(await page.evaluate(() => globalThis.document.documentElement.scrollWidth <= 360), `no horizontal scroll at 360 px: ${url}`);
  }
  await page.setViewportSize({ width: 1360, height: 900 });
  return { rtId, rtUrl, wsUrl, projectId };
}

/** The main installation's RT, on its modernisation: the owner missing blocks the issue; its components filled; issued. */
export async function rtVano({ page, hydrated, stamp, projectUrl }) {
  step('RT: the main installation’s modernisation — the owner missing blocks the issue; its components filled; issued');
  await page.goto(`${projectUrl}/relazione-tecnica`);
  assert.equal(await page.locator('[data-rt-base="calcolo"]').count(), 1, 'made on the «Calcolo argano»');
  await hydrated(page, '#rt2-firme button.btn-primary');
  assert.ok(await page.locator('#rt2-firme button.btn-primary').isDisabled(), 'blocked without the owner');
  assert.ok((await mancanti(page)).some((m) => m.startsWith('Dati dell’impianto: proprietario')), 'the owner listed as missing');
  // a CE-marked lift: DPR 162/1999, derived, confirmed on the logbook
  await anagrafica(page, hydrated, { legge: /DPR 162\/1999/, proprietario: 'Condominio Via Verdi 3' });
  await compila(page, hydrated, `Ammodernamento dell’impianto esistente, prova ${stamp}: argano, quadro e parti indicate nel calcolo.`);
  await riempi(page);
  await emetti(page, 'Emetti la relazione');
  assert.ok(await page.locator('section[aria-labelledby="rt-p-componenti"] li').count() > 0, 'its components on the RT’s page');
}

/** A «Trasformazione completa» has the new lift's documents, not a relazione tecnica di modifica: said in words. */
export async function rtTrasformazione({ page, projectUrl }) {
  step('RT: a «Trasformazione completa» says why it has no relazione tecnica di modifica');
  await page.goto(`${projectUrl}/relazione-tecnica`);
  assert.equal(await page.locator('[data-rt-motivo="trasformazione"]').count(), 1);
  assert.match(await page.textContent('[data-rt-motivo]'), /ascensore nuovo/);
  assert.equal(await page.locator('[data-rt="workspace2"]').count(), 0, 'no workspace');
}
